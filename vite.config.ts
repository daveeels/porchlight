/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'

// SPEC F10: installable PWA. Icons come from scripts/buildIcons.ts
// (npm run icons:build). The service worker precaches the app shell only;
// full offline support is Phase 4.
const pwa: Partial<VitePWAOptions> = {
  // autoUpdate: a new deploy's worker takes over on the next load without a
  // "new version" UI. With 'prompt' and no UI the old worker would wait until
  // every tab closed, and installed iPhone apps rarely close, so beta fixes
  // would reach users days late. Nothing is reloaded under the user.
  registerType: 'autoUpdate',
  injectRegister: 'script-defer',
  // No service worker in `vite` dev (or the dev-server E2E suite).
  devOptions: { enabled: false },
  includeAssets: ['icons/favicon.svg', 'icons/favicon-32.png', 'icons/favicon-16.png', 'icons/apple-touch-icon.png'],
  manifest: {
    id: '/',
    name: 'Porchlight',
    short_name: 'Porchlight',
    description: 'Find the decorated houses worth the drive this Halloween and Christmas, around Tauranga.',
    lang: 'en-NZ',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#17120f',
    theme_color: '#17120f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // App shell only: the built JS/CSS/HTML (icons come from includeAssets and
    // the manifest). No runtimeCaching, so map tiles, Firestore, Storage
    // photos and Firebase APIs always go to the network. MapLibre (members-only
    // map, ~1 MB) and the emulator seed photos aren't precached.
    // Plus the self-hosted Latin / Latin Extended fonts (not the woff
    // fallbacks or other scripts' subsets), so the installed app keeps its type offline.
    globPatterns: ['**/*.{js,css,html}', 'assets/*-latin-*.woff2'],
    globIgnores: ['**/maplibre-gl*', 'seed/**'],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    navigateFallback: '/index.html',
    // MANDATORY (SPEC §2/F10): Firebase Auth's /__/auth/handler and /__/
    // config must reach Hosting, never the cached index.html.
    navigateFallbackDenylist: [/^\/__\//],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
  },
}

// SPEC §5 beta mode: while VITE_NOINDEX=true (env or .env*), or for
// `npm run build:beta` (--mode beta), index.html gets
// <meta name="robots" content="noindex">. Launch day uses `npm run build`.
function noindex(): Plugin {
  let enabled = false
  return {
    name: 'porchlight-noindex',
    configResolved(config) {
      enabled = config.env.VITE_NOINDEX === 'true' || config.mode === 'beta'
    },
    transformIndexHtml() {
      if (!enabled) return
      return [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' }]
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), VitePWA(pwa), noindex()],
  build: {
    rolldownOptions: {
      output: {
        // 2026-10-02 production outage: Rolldown hoisted its __export helper
        // into our own `pins` chunk, which Ionic's hardware-back-button chunk
        // imports, while `pins` (indirectly) imports Ionic — a chunk cycle,
        // so Ionic ran before the helper existed ("e is not a function") and
        // the app was a blank screen. Libraries get their own chunks so they
        // never depend on app chunks, and strict execution order keeps any
        // remaining cycles safe. The dev server doesn't bundle, so only a
        // production build can show this — see tests/e2e/prod-smoke.
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name: 'ionic', test: /node_modules[\\/](@ionic|@stencil|ionicons)[\\/]/ },
            { name: 'vue', test: /node_modules[\\/](vue|@vue|vue-router|pinia)[\\/]/ },
            { name: 'firebase', test: /node_modules[\\/](firebase|@firebase|idb|tslib)[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'happy-dom', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        // Pure server-side libraries in functions/src/lib (offset, places, thresholds).
        test: { name: 'functions', environment: 'node', include: ['tests/functions/**/*.test.ts'] },
      },
    ],
  },
})
