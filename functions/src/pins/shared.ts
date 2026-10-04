// Helpers shared by createPin / updatePin / deletePin.
import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../lib/admin.js'
import { fail } from '../lib/errors.js'
import { deletePhotoFolder, folderOf, type StoredPhoto } from '../lib/photo.js'
import type { RateLimitDoc } from '../lib/rateLimit.js'
import type { UserDoc } from '../lib/users.js'
import type { HolidayEventDoc, PinDoc } from './model.js'

export function refs(uid: string, eventId: string, pinId: string) {
  const firestore = db()
  return {
    user: firestore.doc(`users/${uid}`) as DocumentReference<UserDoc>,
    rateLimit: firestore.doc(`rateLimits/${uid}`) as DocumentReference<Partial<RateLimitDoc>>,
    event: firestore.doc(`events/${eventId}`) as DocumentReference<HolidayEventDoc>,
    pin: firestore.doc(`pins/${pinId}`) as DocumentReference<PinDoc>,
  }
}

export type Refs = ReturnType<typeof refs>

export interface Snaps {
  user: DocumentSnapshot<UserDoc>
  rateLimit: DocumentSnapshot<Partial<RateLimitDoc>>
  event: DocumentSnapshot<HolidayEventDoc>
  pin: DocumentSnapshot<PinDoc>
}

/** All four reads at once — in a transaction (tx) or not (pre-check). */
export async function readAll(r: Refs, tx?: Transaction): Promise<Snaps> {
  const list = [r.user, r.rateLimit, r.event, r.pin] as DocumentReference[]
  const snaps = tx ? await tx.getAll(...list) : await db().getAll(...list)
  const [user, rateLimit, event, pin] = snaps
  return {
    user: user as DocumentSnapshot<UserDoc>,
    rateLimit: rateLimit as DocumentSnapshot<Partial<RateLimitDoc>>,
    event: event as DocumentSnapshot<HolidayEventDoc>,
    pin: pin as DocumentSnapshot<PinDoc>,
  }
}

export function notFound(): never {
  fail('NOT_FOUND', 'not-found', "You don't have a display this season.")
}

/** Owner's pin that can still be edited or deleted: ACTIVE or HIDDEN. */
export function editablePin(snap: DocumentSnapshot<PinDoc>, uid: string): PinDoc {
  const pin = snap.data()
  if (!pin || pin.ownerId !== uid) notFound()
  if (pin.status === 'REMOVED') notFound()
  if (pin.status !== 'ACTIVE' && pin.status !== 'HIDDEN') {
    fail('NOT_EDITABLE', 'failed-precondition', "This display can't be changed any more.")
  }
  return pin
}

/**
 * After a failed write: delete the photos this request made, unless the pin
 * now points at them (a double-tap with the same uploadId that won the race).
 */
export async function discardPhoto(pinRef: DocumentReference<PinDoc>, photo: StoredPhoto): Promise<void> {
  try {
    const current = (await pinRef.get()).data()
    if (current?.photoPath === photo.photoPath) return
  } catch (err) {
    logger.warn('Could not check pin before photo cleanup', { pinId: pinRef.id, error: String(err) })
    return
  }
  const folder = folderOf(photo.photoPath)
  if (folder) await deletePhotoFolder(folder)
}

/** Best effort: delete the stored photo folder(s) of an old pin version. */
export async function deleteOldPhotos(pin: Pick<PinDoc, 'photoPath' | 'thumbPath'>, keep?: StoredPhoto | null): Promise<void> {
  const keepFolder = keep ? folderOf(keep.photoPath) : null
  const folders = new Set([folderOf(pin.photoPath), folderOf(pin.thumbPath)])
  for (const folder of folders) {
    if (folder && folder !== keepFolder) await deletePhotoFolder(folder)
  }
}
