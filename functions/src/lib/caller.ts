// Who is calling. Built from the callable request in index.ts so the pin
// services can be called directly (and tested) without firebase-functions.
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export interface Caller {
  uid: string
  /** `admin` custom claim (scripts/setAdmin.ts). */
  admin: boolean
}

export function callerOf(req: CallableRequest): Caller | null {
  if (!req.auth) return null
  return { uid: req.auth.uid, admin: req.auth.token.admin === true }
}

/** Anonymous users are read-only (golden rule 1). */
export function requireAuth(caller: Caller | null | undefined): Caller {
  if (!caller || typeof caller.uid !== 'string' || caller.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.')
  }
  return caller
}
