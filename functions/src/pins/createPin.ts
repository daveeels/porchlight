// createPin (SPEC §6). Steps, in this order:
// 1. auth + validate input, getAuth().getUser (before any transaction), beta
//    gate, then a read-only pre-check of the step 5 checks, so a call that
//    would fail anyway (rate limit, existing pin, closed event) never runs sharp
// 2. offset the location; geohash + place from the OFFSET point; reject points
//    outside the covered area (still before sharp)
// 3. photo, outside any transaction (sharp → photos/{pinId}/{uploadId}/)
// 4. re-creating over a REMOVED pin: clear its old votes/reports/photos
//    (only if the checks below would pass)
// 5. one transaction: read all, check, write pin + users + rateLimits
// 6. after commit: best-effort placeIndex increment; on failure delete the new
//    photos; always delete the upload (even when the input was invalid).
// Never log the exact coordinates or the request payload.
import type { Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { geohashForLocation } from 'geofire-common'
import { db, FieldValue, GeoPoint, Timestamp } from '../lib/admin.js'
import { assertCanWrite } from '../lib/beta.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { fail, invalid } from '../lib/errors.js'
import { offsetPoint } from '../lib/geo.js'
import { deleteUpload, processUpload, type StoredPhoto } from '../lib/photo.js'
import { coveredPlace, lookupPlace, type PinPlace } from '../lib/places.js'
import { takeRateLimit, type RateLimitDoc } from '../lib/rateLimit.js'
import { assertNotBanned, lookupAuthUser, userFromSnap, type UserDoc } from '../lib/users.js'
import { parseCreatePinInput, uploadIdOf, type CreatePinInput } from '../lib/validation.js'
import { pinIdFor, type HolidayEventDoc, type PinDoc } from './model.js'
import { deleteOldPhotos, discardPhoto, readAll, refs, type Refs, type Snaps } from './shared.js'

export const MAX_CREATES_PER_EVENT = 3

export interface CreatePinResult {
  pinId: string
}

interface Checked {
  user: UserDoc
  userExists: boolean
  rateLimit: RateLimitDoc
  event: HolidayEventDoc
  existing: PinDoc | undefined
}

/** Step 5 checks, in SPEC order. Throws the first failure. */
function check(s: Snaps, eventId: string, authCreatedAt: Timestamp, now: Date): Checked {
  const { user, exists: userExists } = userFromSnap(s.user, authCreatedAt)
  assertNotBanned(user)

  const rateLimit = takeRateLimit(s.rateLimit.data(), 'createPin', now)

  const event = s.event.data()
  if (!event) invalid('Unknown event.')
  const nowMs = now.getTime()
  if (!event.isActive || nowMs < event.submissionsOpenAt.toMillis() || nowMs >= event.expiresAt.toMillis()) {
    fail('SUBMISSIONS_CLOSED', 'failed-precondition', 'Submissions are closed for this event.')
  }

  const existing = s.pin.data()
  if (existing) {
    if (existing.status === 'ACTIVE' || existing.status === 'HIDDEN') {
      fail('ALREADY_EXISTS', 'already-exists', 'You already have a display this season.')
    }
    if (existing.removedBy === 'ADMIN') {
      fail('REMOVED_BY_ADMIN', 'permission-denied', 'Your display was removed by a moderator.')
    }
    if (existing.hiddenReason === 'REPORTS') {
      fail('UNDER_REVIEW', 'permission-denied', 'This display is under review.')
    }
  }

  if ((user.pinCreatesByEvent[eventId] ?? 0) >= MAX_CREATES_PER_EVENT) {
    fail('CREATE_CAP', 'resource-exhausted', "You've added the most displays allowed this season.")
  }
  return { user, userExists, rateLimit, event, existing }
}

interface NewPin {
  uid: string
  eventId: string
  title: string
  description: string | null
  photo: StoredPhoto
  geo: { lat: number; lng: number }
  geohash: string
  place: PinPlace
}

function writeAll(tx: Transaction, r: Refs, c: Checked, p: NewPin, now: Date): void {
  const ts = Timestamp.fromDate(now)
  const pin: PinDoc = {
    ownerId: p.uid,
    eventId: p.eventId,
    season: c.event.season,
    seasonYear: c.event.seasonYear,
    title: p.title,
    description: p.description,
    ...p.photo,
    geo: new GeoPoint(p.geo.lat, p.geo.lng),
    geohash: p.geohash,
    place: p.place,
    status: 'ACTIVE',
    hiddenReason: null,
    removedBy: null,
    consentAt: ts,
    voteRound: 0,
    hereVotes: 0,
    notThereVotes: 0,
    verified: false,
    reportsCount: 0,
    rankScore: 0,
    isFeatured: false,
    featuredUntil: null,
    moderation: { decision: 'NONE', reviewedBy: null, reviewedAt: null, note: null },
    createdAt: ts,
    updatedAt: ts,
    expiresAt: c.event.expiresAt,
    purgeAt: c.event.purgeAt,
  }
  tx.set(r.pin, pin)

  const creates = (c.user.pinCreatesByEvent[p.eventId] ?? 0) + 1
  if (c.userExists) {
    tx.update(r.user, { [`pinCreatesByEvent.${p.eventId}`]: creates })
  } else {
    tx.set(r.user, { ...c.user, pinCreatesByEvent: { [p.eventId]: creates } })
  }
  tx.set(r.rateLimit, c.rateLimit)
}

/** Step 4: a REMOVED pin is being replaced — drop its old votes, reports and photos. */
async function clearRemovedPin(r: Refs, old: PinDoc, photo: StoredPhoto): Promise<void> {
  const firestore = db()
  await firestore.recursiveDelete(r.pin.collection('votes'))
  await firestore.recursiveDelete(r.pin.collection('reports'))
  await deleteOldPhotos(old, photo)
}

/** Best effort, after the commit: the new place shows up in search at once (SPEC §5). */
async function bumpPlaceIndex(eventId: string, place: PinPlace): Promise<void> {
  const update: Record<string, unknown> = {
    towns: {
      [place.townKey]: {
        town: place.town,
        areaKey: place.areaKey,
        region: place.region,
        countryCode: place.countryCode,
        count: FieldValue.increment(1),
      },
    },
    updatedAt: Timestamp.now(),
  }
  if (place.areaKey && place.area) {
    update.areas = { [place.areaKey]: { area: place.area, count: FieldValue.increment(1) } }
  }
  try {
    await db().doc(`placeIndex/${eventId}`).set(update, { merge: true })
  } catch (err) {
    logger.warn('placeIndex increment failed', { eventId, townKey: place.townKey, error: String(err) })
  }
}

export async function createPin(callerIn: Caller | null, data: unknown): Promise<CreatePinResult> {
  // 1. Auth, input, Auth lookup, beta gate, pre-check.
  const caller = requireAuth(callerIn)
  const uid = caller.uid
  let input: CreatePinInput
  try {
    input = parseCreatePinInput(data)
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
    // Read-only: nothing is counted until the transaction, which checks again.
    const pre = check(await readAll(r), input.eventId, authInfo.authCreatedAt, new Date())

    // 2. Offset once; geohash and place come from the offset point only.
    const geo = offsetPoint(input.lat, input.lng)
    const town = coveredPlace(geo.lat, geo.lng)
    if (!town) invalid('Porchlight only covers New Zealand for now.')
    const place = lookupPlace(geo.lat, geo.lng, town)
    const geohash = geohashForLocation([geo.lat, geo.lng], 9)

    // 3. Photo, outside any transaction.
    photo = await processUpload(uid, input.uploadId, pinId)

    // 4. Re-create over a REMOVED pin (the pre-check passed, so it isn't blocked).
    if (pre.existing?.status === 'REMOVED') await clearRemovedPin(r, pre.existing, photo)

    // 5. One transaction: reads first, then checks, then writes.
    const newPin: NewPin = {
      uid,
      eventId: input.eventId,
      title: input.title,
      description: input.description,
      photo,
      geo,
      geohash,
      place,
    }
    await db().runTransaction(async (tx) => {
      const now = new Date()
      const checked = check(await readAll(r, tx), input.eventId, authInfo.authCreatedAt, now)
      writeAll(tx, r, checked, newPin, now)
    })

    // 6. Best-effort side write.
    await bumpPlaceIndex(input.eventId, place)
    return { pinId }
  } catch (err) {
    if (photo) await discardPhoto(r.pin, photo)
    throw err
  } finally {
    await deleteUpload(uid, input.uploadId)
  }
}
