// Lazy Admin SDK handles. Lazy so tests can point the SDK at the emulators
// (FIRESTORE_EMULATOR_HOST etc., FIREBASE_CONFIG) before the first call.
// In Cloud Functions, initializeApp() reads FIREBASE_CONFIG for the default bucket.
import { getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

// Re-exported so tests share this package's copy of firebase-admin (the repo
// root has its own; Timestamps from one aren't accepted by the other).
export { FieldValue, GeoPoint, Timestamp } from 'firebase-admin/firestore'

export function adminApp(): App {
  return getApps()[0] ?? initializeApp()
}

export function db(): Firestore {
  return getFirestore(adminApp())
}

export function auth(): Auth {
  return getAuth(adminApp())
}

export type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>

export function bucket(): Bucket {
  return getStorage(adminApp()).bucket()
}
