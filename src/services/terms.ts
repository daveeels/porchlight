// Community rules (SPEC §5 users, §6). The client reads its own users/{uid}
// doc (the rules allow the owner to read it) to know whether the current
// rules are agreed; agreeing goes through the acceptTerms callable — clients
// never write Firestore.
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db, functions } from './firebase'

export interface TermsRecord {
  /** The rules version agreed to, or null if never. */
  version: string | null
  acceptedAt: Date | null
}

export interface AcceptTermsResult {
  termsVersion: string
  /** ms since the epoch */
  acceptedAt: number
}

/** users/{uid}.termsVersion / termsAcceptedAt (both null when the doc doesn't exist yet). */
export async function fetchTermsRecord(uid: string): Promise<TermsRecord> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return { version: null, acceptedAt: null }
  const version = snap.get('termsVersion') as unknown
  const at = snap.get('termsAcceptedAt') as unknown
  return {
    version: typeof version === 'string' ? version : null,
    acceptedAt: at instanceof Timestamp ? at.toDate() : null,
  }
}

/** Friendly copy for a failed acceptTerms call. */
export function acceptTermsErrorMessage(e: unknown): string {
  const err = (e ?? {}) as { code?: unknown; details?: unknown }
  const reason = ((err.details ?? {}) as { reason?: unknown }).reason
  const code = typeof err.code === 'string' ? err.code.replace(/^functions\//, '') : ''
  if (reason === 'INVALID_INPUT') return 'The community rules have just changed. Reload Porchlight and try again.'
  if (reason === 'BANNED') return "This account can't post or vote."
  if (code === 'unauthenticated') return "You've been signed out. Sign in again to carry on."
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return "You're offline or the connection dropped. Check your connection and try again."
  }
  return "Couldn't save that. Please try again."
}

/**
 * The rules form is a gate, so a call that never answers (a dropped mobile
 * connection) mustn't leave "I agree" spinning for the SDK's default 70 s:
 * give up sooner with "the connection dropped, try again". acceptTerms is a
 * single write, and agreeing twice is harmless if a slow call did land.
 */
export const ACCEPT_TERMS_TIMEOUT_MS = 20_000

export async function acceptTerms(version: string): Promise<{ version: string; acceptedAt: Date }> {
  const res = await httpsCallable<{ version: string }, AcceptTermsResult>(functions, 'acceptTerms', {
    timeout: ACCEPT_TERMS_TIMEOUT_MS,
  })({ version })
  return { version: res.data.termsVersion, acceptedAt: new Date(res.data.acceptedAt) }
}
