// Firebase Auth (SPEC F4). Google via signInWithPopup, called synchronously
// from the tap handler so the browser doesn't block the popup.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
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

export function signOutUser(): Promise<void> {
  return signOut(auth)
}

export function watchAuth(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb)
}
