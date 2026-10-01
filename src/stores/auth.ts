import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { safeRedirect } from '@/lib/redirect'
import {
  isEmailSignInLink,
  sendEmailSignInLink,
  signInWithEmailSignInLink,
  signInWithGoogle,
  signOutUser,
  watchAuth,
  type User,
} from '@/services/auth'

/**
 * SPEC F11: the address an email link was sent to, kept in localStorage only
 * between sending the link and finishing sign-in. Never put it in a URL.
 */
export const EMAIL_FOR_SIGN_IN_KEY = 'porchlight.emailForSignIn'

function readStoredEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY)
  } catch {
    return null
  }
}

function writeStoredEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email)
    else localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY)
  } catch {
    // Storage blocked: /auth/complete will ask for the email instead.
  }
}

/**
 * The page the email link opens: /auth/complete on this site, with the
 * same-site path to return to afterwards (dropped if missing or unsafe).
 */
export function emailLinkContinueUrl(origin: string, redirect: string | null): string {
  const url = new URL('/auth/complete', origin)
  const target = safeRedirect(redirect)
  if (target) url.searchParams.set('redirect', target)
  return url.toString()
}

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<User | null>(null)
  /** True after the first auth state is known. */
  const ready = ref(false)
  const isSignedIn = computed(() => !!user.value)
  const uid = computed(() => user.value?.uid ?? null)
  let started: Promise<void> | null = null

  /** Starts watching auth (idempotent); resolves once the initial state is known. */
  function init(): Promise<void> {
    if (started) return started
    started = new Promise<void>((resolve) => {
      watchAuth((u) => {
        user.value = u
        ready.value = true
        resolve()
      })
    })
    return started
  }

  /** Call directly from a tap handler (no await before it) or the popup is blocked. */
  function signIn(): Promise<void> {
    return signInWithGoogle()
  }

  /**
   * Emails a sign-in link that returns to `redirect` (a same-site path) once
   * opened, and remembers the address on this device for /auth/complete.
   */
  async function sendEmailLink(email: string, redirect: string | null): Promise<void> {
    const address = email.trim()
    await sendEmailSignInLink(address, emailLinkContinueUrl(window.location.origin, redirect))
    writeStoredEmail(address)
  }

  /** The address a link was sent to from this browser, if it's still pending. */
  function pendingEmail(): string | null {
    return readStoredEmail()
  }

  function isEmailLink(href: string): boolean {
    return isEmailSignInLink(href)
  }

  /** Finishes email-link sign-in, then forgets the saved address. */
  async function completeEmailLink(email: string, href: string): Promise<void> {
    await signInWithEmailSignInLink(email.trim(), href)
    writeStoredEmail(null)
  }

  function signOut(): Promise<void> {
    return signOutUser()
  }

  return {
    user,
    ready,
    isSignedIn,
    uid,
    init,
    signIn,
    sendEmailLink,
    pendingEmail,
    isEmailLink,
    completeEmailLink,
    signOut,
  }
})
