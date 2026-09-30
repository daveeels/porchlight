import { defineConfig } from 'vitest/config'

// Security rules tests. Run through `npm run test:rules`, which starts the
// Firestore and Storage emulators first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
})
