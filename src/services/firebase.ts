// The only module that initialises Firebase. Other services import the
// instances from here.
import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { env } from '@/config/env'

export const FUNCTIONS_REGION = 'us-central1'

export const app = initializeApp(env.firebase)

if (import.meta.env.DEV) {
  // Prints a debug token in the console; register it in the Firebase console
  // (App Check → Manage debug tokens) to call the real project from localhost.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

if (env.recaptchaSiteKey && !env.useEmulators) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const storage = getStorage(app)
export const functions = getFunctions(app, FUNCTIONS_REGION)

if (env.useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
