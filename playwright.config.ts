import { defineConfig, devices } from '@playwright/test'

// Browser E2E tests (SPEC §8 "Testing"). Run with `npm run test:e2e`, which
// starts the Auth + Firestore emulators and seeds them first (scripts/e2e.mjs).
// Screenshots land in tests/e2e/__screenshots__/ for review (not committed).

const PORT = 5180
export const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  // The dev server serves unbundled modules and WebKit on Windows is slow to
  // boot them, so the first load of a page can take 10+ s under parallel load.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'on',
    trace: 'retain-on-failure',
    locale: 'en-NZ',
    timezoneId: 'Pacific/Auckland',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'pixel', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Process env beats .env.local, so the suite always talks to the
    // demo-porchlight emulators whatever the local config says.
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-porchlight.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-porchlight',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-porchlight.appspot.com',
      VITE_FIREBASE_APP_ID: 'demo-app-id',
      VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: '',
    },
  },
})
