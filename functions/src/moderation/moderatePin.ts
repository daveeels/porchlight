// moderatePin (SPEC §6). Admin only (auth.token.admin === true). The logic is
// the plain `applyModeration`, also used by scripts/moderate.ts so the audit
// log is the same whichever way an admin moderates. Never hand-edit pins.
//
// | APPROVE  | HIDDEN → ACTIVE                         | decision APPROVED, hiddenReason null
// | REMOVE   | ACTIVE/HIDDEN → REMOVED (also an owner- | removedBy ADMIN, decision REJECTED;
// |          | REMOVED pin hidden for REPORTS)         | photos deleted after the commit
// | RESTORE  | REMOVED (by admin) → ACTIVE             | removedBy null, hiddenReason null, decision APPROVED
// | BAN_USER | owner's removable pins → REMOVED        | users/{owner}.banned, Auth disabled + tokens revoked
//
// Every action sets moderation.{decision, reviewedBy, reviewedAt} on the
// pin(s) it changes and appends one moderationActions doc, in the same
// transaction. The note goes only into moderationActions (admin read):
// anyone can read an ACTIVE pin, so moderation.note on the pin stays null. Auth calls and photo deletes happen outside it (golden rule 11).
// placeIndex counts are left to the nightly rebuildPlaceIndex.
import type { UserRecord } from 'firebase-admin/auth'
import type { DocumentReference, DocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { auth, db, Timestamp } from '../lib/admin.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { fail, invalid } from '../lib/errors.js'
import { userFromSnap, type UserDoc } from '../lib/users.js'
import { parseModeratePinInput, type ModeratePinInput, type ModerationAction } from '../lib/validation.js'
import type { ModerationDecision, PinDoc, PinStatus } from '../pins/model.js'
import { deleteOldPhotos } from '../pins/shared.js'

export interface ModeratePinResult {
  pinId: string
  status: PinStatus
}

export interface ModerationActionDoc {
  pinId: string
  adminUid: string
  action: ModerationAction
  note: string | null
  createdAt: Timestamp
}

/** What a moderator can REMOVE (and what a ban removes). */
export function isRemovable(pin: Pick<PinDoc, 'status' | 'removedBy' | 'hiddenReason'>): boolean {
  if (pin.status === 'ACTIVE' || pin.status === 'HIDDEN') return true
  // Owner deleted a reported pin: its photos were kept for the moderator.
  return pin.status === 'REMOVED' && pin.removedBy === 'OWNER' && pin.hiddenReason === 'REPORTS'
}

function cantApply(action: ModerationAction, status: PinStatus): never {
  fail('NOT_EDITABLE', 'failed-precondition', `Can't ${action} a display that is ${status}.`)
}

/** Public on ACTIVE pins, so no free-text note here (it's in moderationActions). */
function moderationFields(decision: ModerationDecision, adminUid: string, ts: Timestamp) {
  return {
    'moderation.decision': decision,
    'moderation.reviewedBy': adminUid,
    'moderation.reviewedAt': ts,
    'moderation.note': null,
  }
}

const REMOVED_BY_ADMIN = { status: 'REMOVED', removedBy: 'ADMIN' } as const

/** Auth record of a ban target, looked up before the transaction; null if it has no Auth account. */
async function findAuthUser(uid: string): Promise<UserRecord | null> {
  try {
    return await auth().getUser(uid)
  } catch {
    return null
  }
}

/**
 * The moderation logic shared by the callable and scripts/moderate.ts.
 * `adminUid` is recorded as moderation.reviewedBy and in moderationActions;
 * the caller has already checked the admin claim.
 */
export async function applyModeration(input: ModeratePinInput, adminUid: string): Promise<ModeratePinResult> {
  const firestore = db()
  const pinRef = firestore.doc(`pins/${input.pinId}`) as DocumentReference<PinDoc>
  const auditRef = firestore.collection('moderationActions').doc() as DocumentReference<ModerationActionDoc>

  // BAN_USER needs the owner (from the pin) and their Auth record before the transaction.
  let banTarget: { uid: string; authUser: UserRecord | null } | null = null
  if (input.action === 'BAN_USER') {
    const ownerId = (await pinRef.get()).get('ownerId') as unknown
    if (typeof ownerId !== 'string' || !ownerId) fail('NOT_FOUND', 'not-found', "We couldn't find that display.")
    if (ownerId === adminUid) invalid("You can't ban yourself.")
    banTarget = { uid: ownerId, authUser: await findAuthUser(ownerId) }
  }

  const { status, photosToDelete } = await firestore.runTransaction(async (tx) => {
    // Reads first.
    const pinSnap = (await tx.get(pinRef)) as DocumentSnapshot<PinDoc>
    let userSnap: DocumentSnapshot<UserDoc> | null = null
    let ownerPins: QuerySnapshot<PinDoc> | null = null
    if (banTarget) {
      userSnap = (await tx.get(firestore.doc(`users/${banTarget.uid}`))) as DocumentSnapshot<UserDoc>
      ownerPins = (await tx.get(firestore.collection('pins').where('ownerId', '==', banTarget.uid))) as QuerySnapshot<PinDoc>
    }

    const pin = pinSnap.data()
    if (!pin) fail('NOT_FOUND', 'not-found', "We couldn't find that display.")
    const ts = Timestamp.now()
    const photos: Array<Pick<PinDoc, 'photoPath' | 'thumbPath'>> = []
    let next: PinStatus = pin.status

    switch (input.action) {
      case 'APPROVE':
        if (pin.status !== 'HIDDEN') cantApply('APPROVE', pin.status)
        next = 'ACTIVE'
        tx.update(pinRef, {
          status: next,
          hiddenReason: null,
          ...moderationFields('APPROVED', adminUid, ts),
        })
        break

      case 'REMOVE':
        if (!isRemovable(pin)) cantApply('REMOVE', pin.status)
        next = 'REMOVED'
        tx.update(pinRef, { ...REMOVED_BY_ADMIN, ...moderationFields('REJECTED', adminUid, ts) })
        photos.push(pin)
        break

      case 'RESTORE':
        if (pin.status !== 'REMOVED' || pin.removedBy !== 'ADMIN') cantApply('RESTORE', pin.status)
        next = 'ACTIVE'
        tx.update(pinRef, {
          status: next,
          removedBy: null,
          hiddenReason: null,
          ...moderationFields('APPROVED', adminUid, ts),
        })
        break

      case 'BAN_USER': {
        if (!banTarget || !userSnap || !ownerPins) throw new Error('ban target not loaded')
        const created = new Date(banTarget.authUser?.metadata.creationTime ?? NaN)
        const authCreatedAt = Number.isNaN(created.getTime()) ? ts : Timestamp.fromDate(created)
        const { user, exists } = userFromSnap(userSnap, authCreatedAt)
        const userRef = firestore.doc(`users/${banTarget.uid}`)
        if (exists) tx.update(userRef, { banned: true })
        else tx.set(userRef, { ...user, banned: true })
        for (const doc of ownerPins.docs) {
          const p = doc.data()
          if (!isRemovable(p)) continue
          tx.update(doc.ref, { ...REMOVED_BY_ADMIN, ...moderationFields('REJECTED', adminUid, ts) })
          photos.push(p)
          if (doc.id === pinRef.id) next = 'REMOVED'
        }
        // The pin the ban was made from records the review even if it was already gone.
        if (!isRemovable(pin)) tx.update(pinRef, moderationFields('REJECTED', adminUid, ts))
        break
      }
    }

    tx.create(auditRef, {
      pinId: input.pinId,
      adminUid,
      action: input.action,
      note: input.note,
      createdAt: ts,
    })
    return { status: next, photosToDelete: photos }
  })

  // After the commit. A failed Auth call throws so the admin re-runs the ban
  // (the Firestore side is idempotent); users/{uid}.banned already blocks writes.
  if (banTarget?.authUser) {
    await auth().updateUser(banTarget.uid, { disabled: true })
    await auth().revokeRefreshTokens(banTarget.uid)
  }
  for (const photo of photosToDelete) {
    await deleteOldPhotos(photo).catch((err: unknown) => {
      logger.warn('Could not delete moderated photos', { pinId: input.pinId, error: String(err) })
    })
  }
  return { pinId: input.pinId, status }
}

/** The callable: admin claim only. */
export async function moderatePin(callerIn: Caller | null, data: unknown): Promise<ModeratePinResult> {
  const caller = requireAuth(callerIn)
  if (!caller.admin) fail('NOT_ADMIN', 'permission-denied', 'Only moderators can do that.')
  const input = parseModeratePinInput(data)
  return applyModeration(input, caller.uid)
}
