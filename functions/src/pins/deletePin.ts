// deletePin (SPEC §6). Owner sets the pin to REMOVED with removedBy 'OWNER'
// and its photos are deleted. hiddenReason is KEPT, so a reported pin can't be
// deleted and re-added to escape review — and a pin hidden for REPORTS keeps
// its photos for the moderator (moderatePin / purgeExpiredPins delete them).
// The create cap still applies. No beta gate: deleting only removes data, so
// a tester taken off config/testers can still delete their display.
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'
import { db, Timestamp } from '../lib/admin.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { assertNotBanned, lookupAuthUser, userFromSnap, type UserDoc } from '../lib/users.js'
import { parseDeletePinInput } from '../lib/validation.js'
import { pinIdFor, type PinDoc } from './model.js'
import { deleteOldPhotos, editablePin, refs } from './shared.js'

export interface DeletePinResult {
  pinId: string
}

export async function deletePin(callerIn: Caller | null, data: unknown): Promise<DeletePinResult> {
  const caller = requireAuth(callerIn)
  const input = parseDeletePinInput(data)
  const uid = caller.uid
  const authInfo = await lookupAuthUser(uid)

  const pinId = pinIdFor(uid, input.eventId)
  const r = refs(uid, input.eventId, pinId)
  const old = await db().runTransaction(async (tx) => {
    const [userSnap, pinSnap] = (await tx.getAll(r.user as DocumentReference, r.pin as DocumentReference)) as [
      DocumentSnapshot<UserDoc>?,
      DocumentSnapshot<PinDoc>?,
    ]
    if (!userSnap || !pinSnap) throw new Error('getAll returned too few snapshots')
    const { user, exists: userExists } = userFromSnap(userSnap, authInfo.authCreatedAt)
    assertNotBanned(user)
    const pin = editablePin(pinSnap, uid)
    tx.update(r.pin, { status: 'REMOVED', removedBy: 'OWNER', updatedAt: Timestamp.now() })
    if (!userExists) tx.set(r.user, user)
    return pin
  })

  if (old.hiddenReason !== 'REPORTS') await deleteOldPhotos(old)
  return { pinId }
}
