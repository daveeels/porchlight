// users/{uid} helpers (SPEC §5). The doc is created lazily inside a callable's
// transaction; the Auth lookup happens once, BEFORE the transaction.
import type { UserRecord } from 'firebase-admin/auth'
import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { auth, Timestamp } from './admin.js'
import { fail } from './errors.js'
import { TERMS_VERSION } from './terms.js'

export interface UserDoc {
  createdAt: Timestamp
  banned: boolean
  pinCreatesByEvent: Record<string, number>
  stripeCustomerId?: string
  /** The community rules version agreed to (acceptTerms); see lib/terms.ts. */
  termsVersion?: string
  termsAcceptedAt?: Timestamp
}

/** What the callables need from Auth, looked up once outside the transaction. */
export interface AuthInfo {
  uid: string
  /** Lowercased, or null when the account has no verified email. */
  verifiedEmail: string | null
  /** Auth `metadata.creationTime`, used for lazy users/{uid} creation. */
  authCreatedAt: Timestamp
  /** Whether a NEW vote/report from this account counts (Google, or ≥ 24 h old). */
  countedIfNew: boolean
}

export const COUNTED_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000

function creationDate(user: UserRecord): Date {
  const parsed = new Date(user.metadata.creationTime)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

/** Counted vote/report rule (SPEC §5): Google provider, or account ≥ 24 h old. */
export function isCountedAccount(user: UserRecord, now: Date = new Date()): boolean {
  if (user.providerData.some((p) => p.providerId === 'google.com')) return true
  return now.getTime() - creationDate(user).getTime() >= COUNTED_ACCOUNT_AGE_MS
}

export function authInfoOf(user: UserRecord, now: Date = new Date()): AuthInfo {
  return {
    uid: user.uid,
    verifiedEmail: user.email && user.emailVerified ? user.email.toLowerCase() : null,
    authCreatedAt: Timestamp.fromDate(creationDate(user)),
    countedIfNew: isCountedAccount(user, now),
  }
}

/** `getAuth().getUser(uid)`. Call once per request, never inside a transaction. */
export async function lookupAuthUser(uid: string): Promise<AuthInfo> {
  let user: UserRecord
  try {
    user = await auth().getUser(uid)
  } catch {
    throw new HttpsError('unauthenticated', 'Sign in to continue.')
  }
  if (user.disabled) fail('BANNED', 'permission-denied', "This account can't post right now.")
  return authInfoOf(user)
}

export function newUserDoc(authCreatedAt: Timestamp): UserDoc {
  return { createdAt: authCreatedAt, banned: false, pinCreatesByEvent: {} }
}

/** The stored doc, or a fresh one (to be written in the same transaction) if missing. */
export function userFromSnap(snap: DocumentSnapshot, authCreatedAt: Timestamp): { user: UserDoc; exists: boolean } {
  if (!snap.exists) return { user: newUserDoc(authCreatedAt), exists: false }
  const data = snap.data() as Partial<UserDoc>
  return {
    user: {
      ...newUserDoc(authCreatedAt),
      ...data,
      banned: data.banned === true,
      pinCreatesByEvent: data.pinCreatesByEvent ?? {},
    } as UserDoc,
    exists: true,
  }
}

export function assertNotBanned(user: UserDoc): void {
  if (user.banned) fail('BANNED', 'permission-denied', "This account can't post right now.")
}

export const TERMS_MESSAGE = 'Please read and agree to the community rules first.'

/**
 * Posting, editing, voting and reporting need the current community rules
 * agreed (acceptTerms). Deleting your own display and moderation don't.
 */
export function assertTermsAccepted(user: UserDoc): void {
  if (user.termsVersion !== TERMS_VERSION) fail('TERMS_REQUIRED', 'failed-precondition', TERMS_MESSAGE)
}
