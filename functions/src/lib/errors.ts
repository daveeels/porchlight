// Typed HttpsErrors for the callables. The client switches on
// `details.reason`; `message` is short, user-facing English.
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https'

export type FailReason =
  | 'BETA_ONLY'
  | 'BANNED'
  | 'RATE_LIMITED'
  | 'SUBMISSIONS_CLOSED'
  | 'ALREADY_EXISTS'
  | 'REMOVED_BY_ADMIN'
  | 'UNDER_REVIEW'
  | 'CREATE_CAP'
  | 'INVALID_INPUT'
  | 'PHOTO_INVALID'
  | 'NOT_FOUND'
  | 'NOT_EDITABLE'

export interface FailDetails {
  reason: FailReason
}

export function fail(reason: FailReason, code: FunctionsErrorCode, message: string): never {
  throw new HttpsError(code, message, { reason } satisfies FailDetails)
}

export function invalid(message: string): never {
  fail('INVALID_INPUT', 'invalid-argument', message)
}

/** The reason on an HttpsError thrown by `fail`, if any. */
export function reasonOf(err: unknown): FailReason | null {
  if (err instanceof HttpsError) {
    const details = err.details as Partial<FailDetails> | undefined
    return details?.reason ?? null
  }
  return null
}
