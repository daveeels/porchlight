// Email link sign-in helpers for SignInPage / AuthCompletePage (SPEC F11).
import { safeRedirect } from '@/lib/redirect'

/** "Resend" stays disabled this long after each send. */
export const RESEND_COOLDOWN_SECONDS = 60

/** A light check before calling Firebase (which validates properly). */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function codeOf(e: unknown): string {
  return (e as { code?: string } | null)?.code ?? ''
}

/** Sending the link failed. */
export function sendLinkErrorMessage(e: unknown): string {
  switch (codeOf(e)) {
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return "That email address doesn't look right. Check it and try again."
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return "We've sent too many sign-in emails just now. Wait a few minutes, then try again."
    case 'auth/network-request-failed':
      return "You're offline or the connection dropped. Check your connection and try again."
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-continue-uri':
      return "Email sign-in isn't available right now. Try Continue with Google."
    default:
      return "Couldn't send the email. Please try again."
  }
}

export type LinkFailure = 'expired' | 'wrong-email' | 'offline' | 'other'

/** Why finishing sign-in from a link failed. */
export function linkFailure(e: unknown): LinkFailure {
  switch (codeOf(e)) {
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
    case 'auth/argument-error':
      return 'expired'
    case 'auth/invalid-email':
    case 'auth/user-mismatch':
      return 'wrong-email'
    case 'auth/network-request-failed':
      return 'offline'
    default:
      return 'other'
  }
}

/**
 * Where to come back to after an email link: the auth guard's ?redirect=,
 * else the page the user was on before /sign-in (vue-router keeps it in
 * history.state.back). The link opens in a new tab, so router.back() can't
 * be used there.
 */
export function returnPath(redirectQuery: unknown, historyState: unknown): string | null {
  const fromGuard = safeRedirect(redirectQuery)
  if (fromGuard) return fromGuard
  const back = (historyState as { back?: unknown } | null)?.back
  return safeRedirect(back)
}
