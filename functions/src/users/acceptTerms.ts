// acceptTerms (SPEC §5 users, §6). Records that the caller agreed to the
// current community rules: users/{uid}.termsVersion + termsAcceptedAt
// (server Timestamp). createPin, updatePin, castVote and reportPin refuse
// with TERMS_REQUIRED until then. Idempotent: agreeing again to the same
// version keeps the first date. No beta gate (browsing members are asked
// right after their first sign-in) and no rate limit (one small doc, and a
// repeat call writes nothing).
// 1. auth + validate input; getAuth().getUser BEFORE the transaction
// 2. one transaction: read users/{uid} (created lazily), check not banned,
//    write the version and date unless they're already current.
import type { DocumentReference } from 'firebase-admin/firestore'
import { db, Timestamp } from '../lib/admin.js'
import { requireAuth, type Caller } from '../lib/caller.js'
import { TERMS_VERSION } from '../lib/terms.js'
import { assertNotBanned, lookupAuthUser, userFromSnap, type UserDoc } from '../lib/users.js'
import { parseAcceptTermsInput } from '../lib/validation.js'

export interface AcceptTermsResult {
  termsVersion: string
  /** When the caller agreed to this version (ms since the epoch). */
  acceptedAt: number
}

export async function acceptTerms(callerIn: Caller | null, data: unknown): Promise<AcceptTermsResult> {
  const caller = requireAuth(callerIn)
  parseAcceptTermsInput(data)
  const uid = caller.uid
  const authInfo = await lookupAuthUser(uid)
  const ref = db().doc(`users/${uid}`) as DocumentReference<UserDoc>

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const { user, exists } = userFromSnap(snap, authInfo.authCreatedAt)
    assertNotBanned(user)
    if (user.termsVersion === TERMS_VERSION && user.termsAcceptedAt instanceof Timestamp) {
      return { termsVersion: TERMS_VERSION, acceptedAt: user.termsAcceptedAt.toMillis() }
    }
    const acceptedAt = Timestamp.now()
    if (exists) tx.update(ref, { termsVersion: TERMS_VERSION, termsAcceptedAt: acceptedAt })
    else tx.set(ref, { ...user, termsVersion: TERMS_VERSION, termsAcceptedAt: acceptedAt })
    return { termsVersion: TERMS_VERSION, acceptedAt: acceptedAt.toMillis() }
  })
}
