/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: string
  readonly VITE_MAP_STYLE_HALLOWEEN: string
  readonly VITE_MAP_STYLE_CHRISTMAS: string
  readonly VITE_ADDRESS_SEARCH_URL: string
  readonly VITE_USE_EMULATORS: string
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Set before App Check initialises in dev (SPEC §6).
declare var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
