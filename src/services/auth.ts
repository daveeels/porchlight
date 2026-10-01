// Firebase Auth (SPEC F4, F11). Google via signInWithPopup, called
// synchronously from the tap handler so the browser doesn't block the popup.
// Email link (passwordless): the link lands on /auth/complete. No Dynamic
// Links (shut down), so no dynamicLinkDomain / linkDomain.
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth'
import { auth } from './firebase'

export type { User }

/** Call directly from a tap handler with no await before it. */
export function signInWithGoogle(): Promise<void> {
  return signInWithPopup(auth, new GoogleAuthProvider()).then(() => undefined)
}

/** Emails a sign-in link that opens `continueUrl` (a page on this site). */
export function sendEmailSignInLink(email: string, continueUrl: string): Promise<void> {
  return sendSignInLinkToEmail(auth, email, { url: continueUrl, handleCodeInApp: true })
}

/** True if `href` is a Firebase email sign-in link (or the page it lands on). */
export function isEmailSignInLink(href: string): boolean {
  return isSignInWithEmailLink(auth, href)
}

/** Finishes email-link sign-in. `email` must be the address the link was sent to. */
export function signInWithEmailSignInLink(email: string, href: string): Promise<void> {
  return signInWithEmailLink(auth, email, href).then(() => undefined)
}

export function signOutUser(): Promise<void> {
  return signOut(auth)
}

export function watchAuth(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb)
}
