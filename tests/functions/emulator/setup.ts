// Point the Admin SDK (functions/node_modules copy) at the emulators before
// anything initialises it. `firebase emulators:exec` sets the *_EMULATOR_HOST
// variables; refuse to run against anything else.
const PROJECT_ID = 'demo-porchlight'

for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  if (!process.env[name]) {
    throw new Error(`${name} is not set — run these tests with: npm run test:functions`)
  }
}

process.env.GCLOUD_PROJECT = PROJECT_ID
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` })
if (!process.env.STORAGE_EMULATOR_HOST) {
  process.env.STORAGE_EMULATOR_HOST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
}
