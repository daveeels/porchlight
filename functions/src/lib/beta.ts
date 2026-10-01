// Private beta gate (SPEC §5 "Beta mode"). While config/app.launchMode is
// 'BETA' (or unset — fail closed), every write callable requires the caller's
// verified email to be on config/testers.emails, or the admin claim.
// Uses the AuthInfo looked up BEFORE the transaction.
import { db } from './admin.js'
import type { Caller } from './caller.js'
import { fail } from './errors.js'
import type { AuthInfo } from './users.js'

export type LaunchMode = 'BETA' | 'LIVE'

export const BETA_MESSAGE = 'Porchlight is in private beta — posting opens soon.'

export async function assertCanWrite(caller: Caller, authInfo: AuthInfo): Promise<void> {
  if (caller.admin) return
  const [appSnap, testersSnap] = await db().getAll(db().doc('config/app'), db().doc('config/testers'))
  const launchMode = appSnap?.get('launchMode') as unknown
  if (launchMode === 'LIVE') return
  const emails = testersSnap?.get('emails') as unknown
  const allowed =
    authInfo.verifiedEmail !== null &&
    Array.isArray(emails) &&
    emails.some((e) => typeof e === 'string' && e.trim().toLowerCase() === authInfo.verifiedEmail)
  if (!allowed) fail('BETA_ONLY', 'permission-denied', BETA_MESSAGE)
}
