// updatePin (SPEC §6). Owner only; ACTIVE or HIDDEN (a HIDDEN pin stays
// HIDDEN), but not while hidden for REPORTS (the reported content stays as it
// is until a moderator decides); before the event's expiresAt; 10 a day.
// Location is never editable. Any change resets moderation.decision to 'NONE'.
// lightsUp (with a new photo) moves a COMING_SOON pin to READY, which opens voting.
// A new photo goes to a new versioned path and starts a new vote round in the
// same transaction; old photos and old-round votes are deleted afterwards as
// cleanup only. The checks also run read-only before sharp, so a call that
// would fail anyway never processes a photo.
import { db, Timestamp } from '../lib/admin.js'
import { assertCanWrite } from '../lib/beta.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { fail } from '../lib/errors.js'
import { deleteUpload, processUpload, type StoredPhoto } from '../lib/photo.js'
import { takeRateLimit, type RateLimitDoc } from '../lib/rateLimit.js'
import { assertNotBanned, assertTermsAccepted, lookupAuthUser, userFromSnap, type UserDoc } from '../lib/users.js'
import { parseUpdatePinInput, uploadIdOf, type UpdatePinInput } from '../lib/validation.js'
import { pinIdFor, rankScoreOf, type PinDoc } from './model.js'
import { discardPhoto, deleteOldPhotos, editablePin, readAll, refs, type Snaps } from './shared.js'

export interface UpdatePinResult {
  pinId: string
}

/** Votes from rounds before `round`; they no longer count, so they're just clutter. */
async function deleteOldRoundVotes(pinId: string, round: number): Promise<void> {
  const firestore = db()
  const old = await firestore.collection(`pins/${pinId}/votes`).where('round', '<', round).get()
  if (old.empty) return
  const writer = firestore.bulkWriter()
  for (const doc of old.docs) void writer.delete(doc.ref)
  await writer.close()
}

interface Checked {
  user: UserDoc
  userExists: boolean
  rateLimit: RateLimitDoc
  pin: PinDoc
}

/** The update checks, in SPEC order. Throws the first failure. */
function check(s: Snaps, uid: string, authCreatedAt: Timestamp, now: Date): Checked {
  const { user, exists: userExists } = userFromSnap(s.user, authCreatedAt)
  assertNotBanned(user)
  assertTermsAccepted(user)
  const rateLimit = takeRateLimit(s.rateLimit.data(), 'updatePin', now)
  const pin = editablePin(s.pin, uid)
  if (now.getTime() >= pin.expiresAt.toMillis()) {
    fail('NOT_EDITABLE', 'failed-precondition', 'This event is over, so displays can no longer be edited.')
  }
  // A reported pin can't be changed (or its photo swapped away) before review.
  if (pin.status === 'HIDDEN' && pin.hiddenReason === 'REPORTS') {
    fail('NOT_EDITABLE', 'failed-precondition', "This display is under review, so it can't be changed right now.")
  }
  return { user, userExists, rateLimit, pin }
}

export async function updatePin(callerIn: Caller | null, data: unknown): Promise<UpdatePinResult> {
  const caller = requireAuth(callerIn)
  const uid = caller.uid
  let input: UpdatePinInput
  try {
    input = parseUpdatePinInput(data)
  } catch (err) {
    // Bad input still frees the caller's upload (the lifecycle rule is only a backstop).
    const uploadId = uploadIdOf(data)
    if (uploadId) await deleteUpload(uid, uploadId)
    throw err
  }
  const pinId = pinIdFor(uid, input.eventId)
  const r = refs(uid, input.eventId, pinId)
  let photo: StoredPhoto | null = null
  try {
    const authInfo = await lookupAuthUser(uid)
    await assertCanWrite(caller, authInfo)
    // Read-only pre-check; nothing is counted until the transaction.
    check(await readAll(r), uid, authInfo.authCreatedAt, new Date())

    // New photo: same cleaning as createPin, outside the transaction.
    if (input.uploadId !== undefined) photo = await processUpload(uid, input.uploadId, pinId)

    const result = await db().runTransaction(async (tx) => {
      const now = new Date()
      const { user, userExists, rateLimit, pin } = check(await readAll(r, tx), uid, authInfo.authCreatedAt, now)

      const update: Partial<PinDoc> & Record<string, unknown> = {}
      if (input.title !== undefined && input.title !== pin.title) update.title = input.title
      if (input.description !== undefined && input.description !== pin.description) {
        update.description = input.description
      }
      const stage = input.lightsUp ? 'READY' : (pin.stage ?? 'READY')
      if (stage !== (pin.stage ?? 'READY')) update.stage = stage
      if (photo) {
        const next = { ...pin, stage, hereVotes: 0, notThereVotes: 0, verified: false }
        Object.assign(update, photo, {
          voteRound: pin.voteRound + 1,
          hereVotes: 0,
          notThereVotes: 0,
          verified: false,
          rankScore: rankScoreOf(next),
        })
      }

      const changed = Object.keys(update).length > 0
      if (changed) {
        update.updatedAt = Timestamp.fromDate(now)
        update['moderation.decision'] = 'NONE' // stops approve-then-swap
        tx.update(r.pin, update)
      }
      if (!userExists) tx.set(r.user, user)
      tx.set(r.rateLimit, rateLimit)
      return { old: pin, newRound: photo ? pin.voteRound + 1 : null }
    })

    // Cleanup only: correctness comes from voteRound, not from these deletes.
    if (photo && result.newRound !== null) {
      await deleteOldPhotos(result.old, photo)
      await deleteOldRoundVotes(pinId, result.newRound).catch(() => undefined)
    }
    return { pinId }
  } catch (err) {
    if (photo) await discardPhoto(r.pin, photo)
    throw err
  } finally {
    if (input.uploadId !== undefined) await deleteUpload(uid, input.uploadId)
  }
}
