// Helpers shared by castVote / reportPin.
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'
import { db } from '../lib/admin.js'
import { fail } from '../lib/errors.js'
import type { RateLimitDoc } from '../lib/rateLimit.js'
import type { UserDoc } from '../lib/users.js'
import type { PinDoc } from '../pins/model.js'

export function engagementRefs(uid: string, pinId: string) {
  const firestore = db()
  return {
    user: firestore.doc(`users/${uid}`) as DocumentReference<UserDoc>,
    rateLimit: firestore.doc(`rateLimits/${uid}`) as DocumentReference<Partial<RateLimitDoc>>,
    pin: firestore.doc(`pins/${pinId}`) as DocumentReference<PinDoc>,
  }
}

/**
 * A pin someone else can vote on or report: it exists, is ACTIVE (voting is
 * closed while HIDDEN; only an admin APPROVE brings it back) and isn't theirs.
 */
export function engageablePin(snap: DocumentSnapshot<PinDoc>, uid: string, what: 'vote' | 'report'): PinDoc {
  const pin = snap.data()
  if (!pin) fail('NOT_FOUND', 'not-found', "We couldn't find that display.")
  if (pin.status !== 'ACTIVE') {
    fail('NOT_VOTABLE', 'failed-precondition', "This display isn't taking votes or reports right now.")
  }
  if (pin.ownerId === uid) {
    fail(
      'OWN_PIN',
      'failed-precondition',
      what === 'vote' ? "You can't vote on your own display." : "You can't report your own display.",
    )
  }
  return pin
}
