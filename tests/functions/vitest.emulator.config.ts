import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Cloud Functions tests against the Auth, Firestore and Storage emulators:
// the pin services in functions/src/pins are called directly with the Admin
// SDK. Run through `npm run test:functions`, which starts the emulators first.
// Files are *.spec.ts so the plain `npm test` run (tests/functions/**/*.test.ts)
// never picks them up without emulators.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    name: 'functions-emulator',
    environment: 'node',
    include: ['tests/functions/emulator/**/*.spec.ts'],
    setupFiles: ['tests/functions/emulator/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
