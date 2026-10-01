// Client-side checks for the details step (SPEC F5). UX only — the server
// validates again (and also rejects profanity).
import type { PinWriteReason } from '@/services/pinWrites'

export const TITLE_MIN = 3
export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 500

export const CONSENT_TEXT = "This is my house, or I have the owner's permission to share it."

const URL_LIKE = /(https?:\/\/|www\.)\S/i

export function titleError(title: string): string | null {
  const t = title.trim()
  if (t.length < TITLE_MIN) return `Give it a title of at least ${TITLE_MIN} characters.`
  if (t.length > TITLE_MAX) return `Keep the title to ${TITLE_MAX} characters or fewer.`
  if (URL_LIKE.test(t)) return "Titles can't include links."
  return null
}

export function descriptionError(description: string): string | null {
  const d = description.trim()
  if (d.length > DESCRIPTION_MAX) return `Keep the description to ${DESCRIPTION_MAX} characters or fewer.`
  if (URL_LIKE.test(d)) return "Descriptions can't include links."
  return null
}

/**
 * Submit failures that retrying the same form can't fix (the server would say
 * the same again). The preview hides its submit button for these.
 */
export const FINAL_SUBMIT_REASONS: readonly PinWriteReason[] = [
  'BETA_ONLY',
  'ALREADY_EXISTS',
  'SUBMISSIONS_CLOSED',
  'RATE_LIMITED',
  'BANNED',
  'REMOVED_BY_ADMIN',
  'UNDER_REVIEW',
  'CREATE_CAP',
  'NOT_EDITABLE',
  'NOT_FOUND',
]
