# CLAUDE.md — Porchlight

**Porchlight** (working name) — a Vue 3 web app / PWA (later iOS/Android via Capacitor) for finding and sharing decorated houses for Halloween and Christmas. Launching in **Tauranga & surrounds, NZ**. Anyone can search by area or suburb; signed-in members get the map, add a display, and vote on whether displays are real.

**Read [docs/SPEC.md](docs/SPEC.md) before starting any feature.** It defines the features, data model, enforcement rules and build phases. If this file and the spec disagree, the spec wins — flag it.

## Current phase

Phase 2 — Sign in + add a display (Phase 1 done). **Halloween launch target: Sat Oct 17, 2026.** (Update this line as phases complete. See SPEC §8.)

Deadline mindset: build the smallest thing that meets each phase's "done when". Don't add features beyond the current phase. **Never cut the security rules to save time.**

## Stack (decided — don't substitute or add alternatives)

- Vue 3 + TypeScript (strict, **pinned `~6.0`** — TS 7 breaks `vue-tsc`) + Vite 8. Always `<script setup lang="ts">`. Node ≥ 22.12.
- **Ionic Vue 9** for UI components. No PrimeVue, no other component library.
- **Tailwind CSS v4, utilities only.** Never enable Preflight (it breaks Ionic). Ionic's CSS is imported only in `src/theme/tailwind.css`, inside `layer(ionic)`, below `utilities` (exact code in SPEC §2).
- Pinia: `useAppConfigStore`, `useSeasonStore`, `useAuthStore`, `usePinsStore`, `useMapStore` (`useAdminStore` in Phase 4).
- **MapLibre GL JS** with **OpenFreeMap** public vector tiles (free, no key, no limits, no SLA), all map code inside the `useMap` composable. Style URLs live in config (`src/config/env.ts`, overridable via `VITE_MAP_STYLE_*`); text layers use `text-font: ['Noto Sans Regular']`. Escape hatch: self-host OpenFreeMap/Protomaps or a paid provider — only the style URLs change. No Leaflet, no Google Maps, no `tile.openstreetmap.org`.
- Firebase: Auth (**Google** at launch; email link Phase 4; Apple Phase 6), Firestore, Storage, Cloud Functions 2nd gen (TypeScript, Node 22), Hosting, App Check. Blaze plan. **Region `us-central1` for everything.**
- Geohash queries with `geofire-common`. Place lookup from bundled GeoNames towns (`functions/data/places.json`) plus hand-defined areas (`functions/data/areas.json`), never a geocoding API.
- Tests: Vitest (unit), `@firebase/rules-unit-testing` (rules), Functions tests against the emulator.

## Golden rules

1. **Anonymous users are read-only. Clients never write to Firestore.** All writes go through callable Cloud Functions using the Admin SDK. `firestore.rules` has `write: false` everywhere. Client-side checks are for UX only.
2. **Never trust client input.** Validate every callable input again on the server (auth, banned, rate limit, event window, ID formats, lengths).
3. **Never store or log exact coordinates.** The 25–50 m offset (random bearing, `cos(lat)` correction) happens once, in `createPin`. Geohash and town come from the offset point. Location isn't editable.
4. **Photos are cleaned on the server** with `sharp` in `createPin`/`updatePin`. The client re-encode only saves bandwidth.
5. **One browse map per session.** One MapLibre `Map`, created the first time the Map segment opens, then kept with `v-show` — never `v-if`, never destroyed. Switch seasons with `map.setStyle()` and re-add images, sources and layers on `style.load`. Keep the OSM / OpenMapTiles attribution visible. `ExplorePage` (`/`) stays at the root of the Ionic stack: area/town/pin selection only changes its query (`?area=`, `?town=`, `?pin=`), `/a/`, `/t/` and `/p/` are redirect routes, and returning from sign-in uses `router.back()` (or `router.replace` to the guard's `?redirect=`). The only other map allowed is the add-display location picker, created while that step is open.
6. **The map is for members only**, and obeys `config/app.mapAccess` (`'OFF'` = list-only for everyone). This is cost control, not security.
7. **Queries are bounded.** Every pin query filters `eventId ==` and `status == 'ACTIVE'`. Area/town lists: `orderBy('rankScore','desc').limit(20)` with cursors. Map/near-me: fixed geohash cells, zoom ≥ 11, debounced 400 ms, cached as `${eventId}:${cell}`, `limit(200)` per cell. Place search filters the single `placeIndex` doc on the client (macron-insensitive) — never query per keystroke. No `onSnapshot` on lists or the map.
8. **Timestamps are Firestore `Timestamp`s**, written by the server. Never date strings.
9. **Pin doc ID is `${uid}_${eventId}`; vote and report doc IDs are the voter's uid.** That's what enforces one pin / one vote / one report per user.
10. **Server-only fields** (status, counts, verified, rankScore, isFeatured, geo, geohash, place, dates, photo paths/URLs, moderation) are never accepted from the client.
11. **Transactions read everything first, then write.** Never run `sharp`, `getAuth()` or other slow work inside a transaction (they retry). Order: validate → Auth lookup / process photo → transaction → best-effort side writes (e.g. `placeIndex`) → clean up on failure.
12. **Admins moderate only through `moderatePin`** (script now, admin UI in Phase 4), never by hand-editing documents.
13. **Never put secrets in client code.** Client env vars are `VITE_*` and public by design (Firebase config, map style URLs, reCAPTCHA site key). Stripe secrets go in Secret Manager via `defineSecret`.
14. **No email or display name in Firestore.** Pins never show who posted them.

## Code layout

```
src/
  config/      env.ts, seasons.ts (palette, map style, icons per season)
  types/       pin.ts, event.ts, vote.ts, config.ts — mirror SPEC §5 exactly
  lib/         pure functions, fully unit-tested (seasonDates, geo cells, image)
  services/    the ONLY place that imports the Firebase SDK (firebase, auth, pins, places, votes, storage)
  stores/      Pinia stores
  composables/ useMap, useGeolocation, usePhotoPicker
  components/  explore/, map/, pin/, season/, common/
  views/       one file per route (SPEC §7)
  theme/       variables.css (Ionic vars per [data-season]), tailwind.css
functions/
  src/         one file per Cloud Function
  src/lib/     validation, offset, places lookup, rate limits, counted-vote check
  data/        places.json (generated by scripts/buildPlaces.ts)
scripts/       seed.ts, createEvents.ts, buildPlaces.ts, setAdmin.ts, moderate.ts
tests/         unit/, rules/, functions/
docs/          SPEC.md, RUNBOOK.md
```

- Components never call Firebase directly — go through `services/` or a store.
- Offset, validation and threshold logic live only in `functions/src/lib/`. Don't duplicate them in the client.
- Keep `src/types` in sync with SPEC §5. If a field changes, update SPEC.md in the same change.

## UI conventions

- Mobile-first at 375 px. Tap targets ≥ 44 × 44 px. No horizontal scroll.
- Pin details always open in an `IonModal` bottom sheet (breakpoints `[0, 0.4, 0.9]`).
- Anonymous users see write actions (vote, report, add, map) as prompts to sign in, not hidden.
- Season theme comes from `data-season` on `<html>`, driving Ionic CSS variables. No hardcoded season colors in components.
- Every async screen has loading, empty and error states (SPEC §7).
- Google sign-in uses `signInWithPopup`, called directly in the tap handler on `/sign-in` with no `await` before it. The app is served from the same domain as `authDomain` (redirect other hosts to it on load).
- In native builds, hide purchase and donation UI (`Capacitor.getPlatform() !== 'web'`).

## Commands

```
npm run dev          # Vite dev server (connects to emulators when VITE_USE_EMULATORS=true)
npm run emulators    # local Firebase emulators, project demo-porchlight (needs Java 21)
npm run build        # vue-tsc type check + Vite build
npm run typecheck
npm test             # Vitest unit tests (tests/unit)
npm run test:rules   # security rules tests against the emulators (tests/rules)
npm --prefix functions run build
```

Emulators use the offline `demo-porchlight` project, so no real Firebase project is needed for local work. No git remote: commit only when the user asks.

## Definition of done for any task

- TypeScript builds with no errors. Unit, rules and function tests pass.
- New rules or callables have tests for the "reject" cases (anonymous, wrong user, duplicate, over limit, bad input).
- Works at 375 px wide.
- If behavior differs from SPEC.md, update the spec or ask first.

## Don't

- Don't add a library that overlaps the stack (UI kit, map library, state manager, date library) without asking.
- Don't use `tile.openstreetmap.org`, Google Maps, or any geocoding API for storing places.
- Don't add a map access token or a Mapbox dependency — the map is MapLibre + OpenFreeMap (no key). Change providers by changing the style URLs in config.
- Don't use Firebase Dynamic Links or set `dynamicLinkDomain` (shut down Aug 2025).
- Don't add a Firestore TTL policy on pins (it orphans photos and subcollections — `purgeExpiredPins` does deletion).
- Don't let a service worker handle `/__/*` routes (breaks Firebase auth) — set `navigateFallbackDenylist: [/^\/__\//]` whenever `vite-plugin-pwa` is on.
- Don't list single-field indexes in `firestore.indexes.json` (deploy fails).
- Don't add Stripe or other payments inside native builds.
- Don't build anything listed as out of scope in SPEC §4 unless asked.
