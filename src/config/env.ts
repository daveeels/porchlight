// Typed access to build-time env vars. Components import from here, never
// from import.meta.env directly.

function optional(name: keyof ImportMetaEnv, fallback = ''): string {
  return import.meta.env[name] || fallback
}

// The demo fallbacks below are for dev, tests and the emulators only. A
// production build with any of these blank would quietly talk to the offline
// demo project and skip App Check (so every enforceAppCheck callable fails),
// so it refuses to start instead.
const REQUIRED_IN_PRODUCTION = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
  'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY',
] as const satisfies readonly (keyof ImportMetaEnv)[]

/** The required variables that are blank (exported for tests). */
export function missingProductionEnv(values: Partial<Record<keyof ImportMetaEnv, unknown>>): string[] {
  return REQUIRED_IN_PRODUCTION.filter((name) => !values[name])
}

if (import.meta.env.PROD) {
  const missing = missingProductionEnv(import.meta.env)
  if (missing.length > 0) {
    throw new Error(`Production build is missing ${missing.join(', ')}. Set them in .env.local and rebuild.`)
  }
}

export const env = {
  useEmulators: import.meta.env.DEV && optional('VITE_USE_EMULATORS', 'true') === 'true',
  firebase: {
    apiKey: optional('VITE_FIREBASE_API_KEY', 'demo-api-key'),
    authDomain: optional('VITE_FIREBASE_AUTH_DOMAIN', 'demo-porchlight.firebaseapp.com'),
    projectId: optional('VITE_FIREBASE_PROJECT_ID', 'demo-porchlight'),
    storageBucket: optional('VITE_FIREBASE_STORAGE_BUCKET', 'demo-porchlight.appspot.com'),
    appId: optional('VITE_FIREBASE_APP_ID', 'demo-app-id'),
  },
  recaptchaSiteKey: optional('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'),
  // Build id for "Send feedback" (SPEC §5 beta). Set at build time, e.g. a hash.
  appVersion: optional('VITE_APP_VERSION', 'dev'),
  // MapLibre style URLs. OpenFreeMap's public styles need no key (SPEC §2);
  // point these at a self-hosted or paid provider to switch tiles.
  map: {
    styles: {
      HALLOWEEN: optional('VITE_MAP_STYLE_HALLOWEEN', 'https://tiles.openfreemap.org/styles/dark'),
      CHRISTMAS: optional('VITE_MAP_STYLE_CHRISTMAS', 'https://tiles.openfreemap.org/styles/positron'),
    },
  },
  // Address search on the add-display location step only (Photon: no key).
  // It positions the picker; nothing geocoded is stored (SPEC F5, §10).
  addressSearchUrl: optional('VITE_ADDRESS_SEARCH_URL', 'https://photon.komoot.io/api/'),
} as const
