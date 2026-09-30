// Typed access to build-time env vars. Components import from here, never
// from import.meta.env directly.

function optional(name: keyof ImportMetaEnv, fallback = ''): string {
  return import.meta.env[name] || fallback
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
  mapbox: {
    token: optional('VITE_MAPBOX_TOKEN'),
    styles: {
      HALLOWEEN: optional('VITE_MAPBOX_STYLE_HALLOWEEN', 'mapbox://styles/mapbox/dark-v11'),
      CHRISTMAS: optional('VITE_MAPBOX_STYLE_CHRISTMAS', 'mapbox://styles/mapbox/light-v11'),
    },
  },
} as const
