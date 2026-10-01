# Porchlight — App Spec

> **Porchlight** (working name) — *"Find the houses worth the drive."* Find and share decorated houses for Halloween and Christmas.
> Launch area: **Tauranga & Western Bay of Plenty, New Zealand** (Tauranga, Mount Maunganui, Pāpāmoa, Te Puke, The Lakes, Bethlehem, Welcome Bay, Ōmokoroa…).
> This is the source of truth for **what** to build. `CLAUDE.md` holds the **how** (rules and conventions).
> Last revised: 2026-10-01. **Launch target: Halloween 2026 — live by Sat Oct 17.**

---

## 1. What the app does

People search for an area or suburb (or tap "Near me") and see decorated houses there, with a photo and short description. Signed-in users also get the **map**, can add **one** display per season, and vote on whether a display is really there. Pins confirmed by other people become **Verified** and rank higher; pins people say are gone drop out of results.

### Access tiers

| | Anonymous visitor | Signed-in member | Admin |
|---|---|---|---|
| Search by town / region, "Near me" list | ✓ | ✓ | ✓ |
| Pin details, photos, "Open in Maps" directions | ✓ | ✓ | ✓ |
| **In-app map** | ✗ ("Sign in to see the map") | ✓ | ✓ |
| Add / edit / delete own display | ✗ | ✓ | ✓ |
| Vote **It's here ✓ / Not there ✗**, **Report** | ✗ | ✓ | ✓ |
| Review hidden pins, remove, ban | ✗ | ✗ | ✓ (`admin` claim) |

**Anonymous visitors are strictly read-only.** Every write needs an account.

### Product principles

1. **Looking is free.** No account needed to search and see displays.
2. **Contributing takes effort.** Account, required photo, one pin per account per season, votes only count from real accounts, daily limits. Spamming should require many real accounts and time.
3. **The community decides what's real.** Unverified → Verified by "It's here" votes; "Not there" votes remove a pin from results.
4. **Every rule is enforced on the server.** Checks in the Vue app only make the UI friendlier.
5. **Privacy is light-touch and honest.** Photos have all metadata removed. Locations are offset 25–50 m. That makes the exact house harder to pinpoint but does **not** hide it (the photo shows the house). The app says so.
6. **Run on free tiers.** Budget is close to zero. The map is the only real cost risk, so it's behind sign-in and has an off switch.

---

## 2. Tech stack (decided — do not substitute)

| Area | Choice | Notes |
|---|---|---|
| Frontend | Vue 3 + TypeScript (strict) + Vite 8 | `<script setup lang="ts">` everywhere. **Pin TypeScript `~6.0`** — `vue-tsc` needs TypeScript's JS API, which TypeScript 7 (native) doesn't provide. Node ≥ 22.12 for dev. |
| UI components | **Ionic Vue 9** | Native-feel navigation, bottom sheets (`IonModal` breakpoints), safe areas. **No PrimeVue.** |
| Styling | Tailwind CSS v4 (utilities only) | **No Preflight** (breaks Ionic). Ionic CSS goes in a cascade layer *below* utilities (see below). Utilities can't reach inside Ionic's shadow DOM — use `--ion-*` variables or `::part`. |
| State | Pinia | `useAppConfigStore`, `useSeasonStore`, `useAuthStore`, `usePinsStore`, `useMapStore` (+ `useAdminStore` later) |
| Map | **MapLibre GL JS** + **OpenFreeMap** public vector tiles | Free, no API key, no usage limits — but no SLA. Styles: OpenFreeMap `dark` (Halloween), `positron` (Christmas, Phase 4); style URLs live in config (`VITE_MAP_STYLE_HALLOWEEN` / `VITE_MAP_STYLE_CHRISTMAS`, defaults in `src/config/env.ts`). Text layers must use `text-font: ['Noto Sans Regular']` (the only fontstack OpenFreeMap's glyph server has). Built-in GeoJSON clustering. Keep the OSM / OpenMapTiles attribution visible. **No Leaflet, never `tile.openstreetmap.org`.** Escape hatch if OpenFreeMap is down or slow: self-host OpenFreeMap or Protomaps, or switch to a paid MapLibre-compatible provider — only the style URLs change. Keep all map code inside `useMap`. |
| Geo queries | Geohash via `geofire-common` | Firestore Standard edition |
| Place lookup | GeoNames dataset + hand-defined launch areas, bundled in Functions | Free, storable. No geocoding API (commercial geocoders' terms don't allow storing results). |
| Auth | Firebase Auth — **Google** (Halloween launch), + **Email link** (Phase 4), + **Sign in with Apple** (Phase 6, required by Apple once Google is offered on iOS) | No passwords |
| Database | Cloud Firestore | Clients read, **never write** (§6) |
| Files | Cloud Storage for Firebase | |
| Server logic | Cloud Functions for Firebase (2nd gen, TypeScript, Node 22) | Callables for all writes. `"engines": { "node": "22" }` |
| Anti-bot | Firebase App Check | reCAPTCHA Enterprise on web; App Attest / Play Integrity on native |
| Hosting | Firebase Hosting + `vite-plugin-pwa` | Web/PWA first. **Whenever `vite-plugin-pwa` is enabled, set `workbox.navigateFallbackDenylist: [/^\/__\//]`** — otherwise the service worker answers Firebase's `/__/auth/handler` with `index.html` and Google sign-in breaks. |
| Native (later) | Capacitor 8 | Phase 6 |
| Payments (later) | Stripe Checkout, web only | Phase 5 |
| Tests | Vitest, `@firebase/rules-unit-testing`, Functions tests against the emulator | |

**Region: `us-central1` for everything** (Firestore, Storage bucket, Functions). Cloud Storage's no-cost allowance only applies to buckets in a few US regions, and keeping one region avoids cross-region charges. Users are in NZ, so expect ~150–200 ms per request — fine for this app, and worth it to stay on free tiers. (Moving to `australia-southeast1` later means a new project; decide before launch if latency ever matters more than cost.)

**Time zone:** users are in `Pacific/Auckland` (NZDT, UTC+13 in Oct–Apr). Event instants are stored in UTC; show dates in the user's local time.

`src/theme/tailwind.css` must start like this so Tailwind utilities beat Ionic:
```css
@layer theme, ionic, utilities;
@import "@ionic/vue/css/core.css" layer(ionic);
/* ...every other @ionic/vue/css/*.css file, also layer(ionic) */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```
Do not import Ionic's CSS anywhere else (e.g. `main.ts`), or it becomes unlayered and wins again.

**Firebase plan: Blaze (pay-as-you-go) is required** — Cloud Functions and Storage need it. At launch scale it should cost ~$0 (see §9). Budget alerts notify but don't stop spending; see §9 for the safety switches.

---

## 3. Seasons and events

A **season** is the holiday type. An **event** is one year's run of a season. Pins belong to an event, so each year starts clean.

```
season:  'HALLOWEEN' | 'CHRISTMAS'
eventId: 'HALLOWEEN_2026', 'CHRISTMAS_2026', ...
```

- For Christmas, the event year is the year of Dec 25. A pin added on Jan 3 2027 belongs to `CHRISTMAS_2026`.
- Event dates live in the `events` collection, not in code:

| Event | Submissions open | Expires (archived) | Purge (deleted) |
|---|---|---|---|
| HALLOWEEN_YYYY | Oct 1 | Nov 8, 12:00 UTC (covers Nov 7 in every timezone; = Nov 9 01:00 NZDT) | +13 months |
| CHRISTMAS_YYYY | Nov 15 | Jan 8 (next year), 12:00 UTC (covers Jan 7 in every timezone) | +13 months |

**How the current event is chosen:**
- The client computes `eventId` with the pure function `seasonDates.eventIdFor(season, now)` (Christmas uses `year - 1` in January) and sends it to the server.
- The server never trusts that value. It reads `events/{eventId}` and requires `isActive && submissionsOpenAt <= now < expiresAt`.
- `isActive` is an admin kill switch that closes submissions early. It does not hide pins.
- Event docs are created by `scripts/createEvents.ts` (prod) and `scripts/seed.ts` (emulator).
- `seasonDates.ts` must use the same dates as the table above. Unit tests pin them.

### Which season shows on first load

0. A season is only usable if `events/{eventIdFor(season, now)}` exists and `now < expiresAt`. Ignore a saved choice that isn't usable. If no season is usable, show the off-season landing.
1. If the user picked a usable season before → use that (saved in `localStorage`).
2. Else by date: **Sep 15 – Nov 7 → Halloween**, **Nov 8 – Jan 7 → Christmas**.
3. Else (Jan 8 – Sep 14) → off-season landing ("See you in October").
4. In-season but the by-date season isn't usable (e.g. Nov 8 before the Christmas event exists) → use another usable season if there is one, else the off-season landing.

The season switcher is only shown when more than one event doc exists. **For the Halloween launch only Halloween exists**, so no switcher.

### Theming per season

The active season sets `data-season="HALLOWEEN|CHRISTMAS"` on `<html>`. Everything keys off that:

| | Halloween ("Spooky Map") | Christmas ("Festive Lights") — Phase 4 |
|---|---|---|
| Palette | Orange / purple on dark | Red / green on light/snowy |
| Map style | OpenFreeMap `dark` | OpenFreeMap `positron` |
| Markers | pumpkin (verified), faded pumpkin (unverified) | tree (verified), faded tree (unverified) |

Switching season calls `map.setStyle()` on the **existing** map. On `style.load`, re-add **images** (icons added with `addImage`), sources and layers, since `setStyle` wipes all three. Never destroy and recreate the map: each new instance refetches the style, glyphs and tiles (free on OpenFreeMap, but billable on any paid provider we might switch to).

---

## 4. Features

### Halloween launch (Phases 0–3)

**F1. Explore (home, everyone)**
- **Places have two levels:**
  - **Area** — a broad, hand-defined region people think of as one place, e.g. **"Tauranga & surrounds"** (covers Tauranga city, Mount Maunganui, Pāpāmoa, Te Puke, The Lakes, Bethlehem, Welcome Bay, Ōmokoroa). Defined in `functions/data/areas.json`.
  - **Town** — the suburb or town from GeoNames, e.g. "Pāpāmoa Beach", "The Lakes", "Te Puke".
- **Search box.** On open, the app loads `placeIndex/{eventId}` (one document listing every area and town that has pins, with counts) and filters it as the user types — areas first, then towns. Nothing is queried per keystroke. Shows context under each result ("Pāpāmoa Beach · Tauranga & surrounds"). Match ignoring macrons (typing "papamoa" finds "Pāpāmoa").
- **Home screen for the launch** opens straight on the **Tauranga & surrounds** area list (from `config/app.defaultAreaKey`), with **town chips** across the top (All · Mount Maunganui · Pāpāmoa · Te Puke · …) to narrow down.
- **Popular places** list under the search box (top areas/towns by pin count, from the same doc). The row is hidden while town chips are showing (an area or a town in an area is selected) so the two chip rows don't stack; it shows for Near me and when nothing is selected. Focusing the empty search box always lists popular places.
- **"Near me"** button: asks for location, then loads the precision-5 geohash cell containing the user plus its 8 neighbours (same per-cell query and cache as F2). Sorted by distance, shown all at once, capped at 100, no cursor. "Verified only" filters on `pin.verified`.
- **Results list (area or town):** card per pin with thumbnail, title, town, ✓ Verified badge or "Unverified", and "It's here" count. Sorted by `rankScore` (verified first). 20 per page; "Load more" uses `startAfter(lastDocSnapshot)`, and results are de-duplicated by id across pages (scores can change between pages).
- **"Verified only"** on area/town lists: because `rankScore` puts verified pins first, stop at the first result where `!pin.verified && !pin.isFeatured`, drop any featured-but-unverified pins before that point, and stop "Load more" once it's reached.
- **Shareable links:** `/a/:areaKey` (e.g. `/a/tauranga`), `/t/:townKey` and `/p/:pinId` are for posting in local groups. They are **redirect routes** to `/?area=…`, `/?town=…` and `/?pin=…` (see §7), so they never create a second ExplorePage or map.
- Picking an area, town or pin inside the app only changes the query on `/` (`router.replace({ query })`). The Share button builds the short URL itself.
- A place from `placeIndex` may briefly show zero results (counts are refreshed nightly). Show the normal empty state.
- Pins outside every defined area still work: they get a town but `areaKey: null`, and are found by town search, near me and the map.
- For signed-in users, a **List | Map** segment at the top switches to F2. Anonymous users see the Map segment with a "Sign in to see the map" prompt.

**F2. Map (signed-in only, and only if `config/app.mapAccess` allows it)**
- `ExplorePage` is the root of the Ionic navigation stack. The map component is created the first time the Map segment is opened, then kept alive with `v-show` (never `v-if`) and never destroyed. Call `map.resize()` when it becomes visible and on `ionViewDidEnter`. Never `navigateRoot`/`router.replace` away from `ExplorePage`.
- Centered on the user's location (if permitted), else the launch town from config.
- Pins load only at **zoom ≥ 11**. Below that, show "Zoom in to see displays".
- Re-query on `moveend`, debounced 400 ms, using **fixed geohash cells** (not `geohashQueryBounds` — its ranges change on every pan and can't be cache keys):
  - Cover the viewport with geohash cells: precision 4 at zoom 11–12.99, precision 5 at zoom ≥ 13, at most 9 cells.
  - If precision 5 needs more than 9 cells, fall back to precision 4 before showing the zoom hint.
  - Per cell: `where('eventId','==',id).where('status','==','ACTIVE').orderBy('geohash').startAt(cell).endAt(cell + '~').limit(200)`.
  - Cache key `${eventId}:${cell}`, kept 5 minutes. Only fetch cells not in the cache.
  - If a cell returns exactly 200, show "Zoom in for more".
- Clustered. Verified pins full-color, unverified faded. "Verified only" toggle filters client-side.
- Map attribution (OpenFreeMap © OpenMapTiles, © OpenStreetMap) stays visible; MapLibre's compact attribution button on narrow screens is fine.
- Tapping a pin opens the detail sheet (F3).

**F3. Pin detail sheet** — `IonModal`, breakpoints `[0, 0.4, 0.9]`
- Photo, title, description, town, ✓ Verified / Unverified, counts ("12 people say it's here").
- "Open in Maps" link (to the offset location). Note: "Location is approximate."
- Signed in: **It's here ✓**, **Not there ✗**, **Report** (reason picker). Shows the user's current vote.
- Anonymous: the same buttons open "Sign in to vote".
- Not shown on your own pin: vote/report buttons.

**F4. Sign in (Google + email link)**
- `/sign-in` offers **"Continue with Google"** and **"Email me a sign-in link"** (F11). Google: Use `signInWithPopup` (not redirect), called **directly in the tap handler with no `await` before it**, or the browser blocks the popup. Sign-in prompts elsewhere (vote, map, add) navigate to `/sign-in`; they don't open the popup after async work.
- **Serve the app from the same domain as the Firebase `authDomain`.** For launch that's `<project>.firebaseapp.com`: share only those links, and on load, if `location.host` isn't `authDomain`, `location.replace` to the same path on `authDomain` (Hosting also serves `<project>.web.app`). Otherwise Safari and Chrome's third-party storage blocking can break sign-in.
- After sign-in, go back with `router.back()` (never `push('/')`) to where the user was. Exception: when the `/submit` / `/me` auth guard sent them (`/sign-in?redirect=<path>`), `router.replace` to that path (same-site paths only), so the guarded page replaces `/sign-in` and Explore stays at the root.
- Test in iOS Safari *and* in the installed home-screen app — popups behave differently there.
- **In-app browsers** (Facebook, Instagram, Messenger — detected from the user agent): Google refuses to sign in inside them. The sign-in page shows, above the buttons: *"To sign in with Google, open Porchlight in your browser."*
  - Android: an **"Open in Chrome"** button using an `intent://<host><path>#Intent;scheme=https;package=com.android.chrome;end` URL.
  - iPhone: try `x-safari-https://<host><path>`; always also show a 2-step picture guide (**⋯ → Open in external browser**).
  - The Google button is still shown but de-emphasised; **email sign-in works in the in-app browser** and is the suggested option there.
  - "Open in Maps" from an in-app browser must open the real Maps app (Android `geo:` / Google Maps intent; iPhone `maps://` with a Google Maps web fallback).
- **Facebook Login is deferred** (known risk; see §11 #9).

**F5. Add my display** (signed in)
Flow: location → photo → details → preview → submit → success.
- **Location:** "Use my current location" + drag the pin on a small map to adjust. This picker map is the **only** other map instance allowed; create it when the step opens, remove it when it closes. No address search. Show: "Your pin will be shown about 25–50 m from where you place it."
- **Photo:** required. The client decodes, resizes (long edge ≤ 1600 px, `createImageBitmap(file, { imageOrientation: 'from-image' })`) and re-encodes to **JPEG** before upload. Accept JPEG/PNG/WebP. HEIC only where the browser can decode it (iOS Safari usually hands over a JPEG). If decoding fails: "This photo format isn't supported — try a screenshot or JPEG." Max 10 MB after re-encode.
- **Details:** title 3–60 chars (required), description 0–500 chars (optional). Plain text. Tip: "Don't include your house number or car plates."
- **Consent:** required checkbox "This is my house, or I have the owner's permission to share it."
- **Errors:** already have a pin this season (link to My Pin), submissions closed, rate limited, upload failed.
- New pins go live immediately as **Unverified**.

**F6. My Pin** (signed in)
- The current event's pin and its status in plain words: Live – Unverified / Live – Verified / Hidden – under review / Hidden – people said it's not there / Removed by you / Removed by a moderator / Archived.
- Edit title, description, photo. **Location can't be edited** (delete and re-add).
- Delete pin. Sign out.

**F7. Votes and verification**
- One vote per user per pin: `HERE` or `NOT_THERE`. A user **can change** their vote (displays go up and come down). Can't vote on your own pin.
- **Counted votes:** a vote counts toward the numbers only if, at the time of voting, the account signed in with Google, *or* the account is ≥ 24 h old. (Google accounts are costly to mass-create; email-link accounts must age first.)
- **Verified** when `hereVotes >= 3 && hereVotes >= 2 * notThereVotes`. Can be lost again if "Not there" votes grow.
- **Dropped from results** when `notThereVotes >= T && notThereVotes > hereVotes` → status HIDDEN, `hiddenReason: 'NOT_THERE'`. T = 3, or 8 if `moderation.decision == 'APPROVED'` (same as reports), so an admin approval isn't undone by the next vote.
- Only ACTIVE → HIDDEN is automatic. **A hidden pin comes back only through admin APPROVE** (voting is closed while hidden). The RUNBOOK lists NOT_THERE-hidden pins for review.
- **Vote rounds:** a pin has a `voteRound`. When its photo changes, the round goes up and the counts reset (people verified the old photo). Votes from an older round are treated as no vote.

**F8. Report**
- Separate from voting; for abuse. One report per user per pin. Can't be undone.
- Reasons: `NOT_A_DISPLAY`, `INAPPROPRIATE`, `PRIVACY`, `SPAM`, `OTHER`.
- **3 counted reports** → status HIDDEN, `hiddenReason: 'REPORTS'`. If an admin already approved the pin, the threshold is **8**.
- After reporting: "Thanks, we'll take a look."

**F9. About / legal** (required for Google sign-in consent screen too)
- How it works, how verification works, privacy (offset, photo cleaning, auto-expiry), community guidelines (what counts as a display), terms, privacy policy, contact email for takedown requests.
- **Support Porchlight:** "Buy a bad decision 🍻" → `config/app.donateUrl` (Ko-fi, https://ko-fi.com/dewetellis). Also in the account menu, and as a quiet line at the end of results lists: *"Porchlight is free and made by a local. Like it? Buy De Wet a bad decision 🍻"*. A null `donateUrl` hides all three. Donations happen on Ko-fi's site (stated in the privacy section).

**F10. Installable (the preferred way to use Porchlight)**
- Web app manifest + icons (name "Porchlight", standalone display, season theme colour) so it installs to the home screen. A full offline service worker comes in Phase 4.
- **Install prompt:** a dismissible "Add Porchlight to your home screen" card, shown once after real use (e.g. 2nd visit, or after opening 3 pins) — never on first load, never inside an in-app browser, never when already installed (`display-mode: standalone`). Dismissal remembered in `localStorage` for 14 days.
  - Android/Chrome: one-tap install via the captured `beforeinstallprompt` event.
  - iPhone/Safari: a 2-step guide (**Share → Add to Home Screen**).
- No Apple developer fee is needed: iPhone users install the PWA from Safari. Android can later be published to Google Play as a Trusted Web Activity (one-time US$25) — optional.
- If `vite-plugin-pwa` is used for the manifest, its service worker **must** have `workbox.navigateFallbackDenylist: [/^\/__\//]` from day one.

### After launch

| When | Feature |
|---|---|
| Before Nov 8 | `archiveExpiredPins` running |
| **Phase 4 — Christmas update (by Nov 15)** | Christmas theme + season switcher · **F12 Light tours** · custom domain + email sender · full PWA offline · in-app admin queue · `purgeExpiredPins` |
| Phase 5 — Money (web only) | Featured pin ($3.99/pin/event) · one-off "Supporter" extras (saved favourites, no sponsor banners) · sponsors · `mapAccess: 'PAID'` option (built, **off**) |
| Phase 6 — Native apps | Capacitor iOS/Android · Sign in with Apple · account deletion · store listings |

**F11. Email link sign-in (Phase 3 — brought forward)**
- Email field → "Check your inbox" + resend. Hint: *"Can't see it? Check your spam or junk folder."* (until a custom sender domain exists). Link lands on `/auth/complete`, which finishes sign-in and returns the user where they were.
- Opened on another device/browser (no saved email) → ask for the email again. Expired/used link → clear message + "send a new link".
- Email saved in `localStorage` only between send and complete. Never in the URL.
- Default Firebase sender for the beta; a custom sender domain (SPF/DKIM) in Phase 4 improves deliverability.
- Email-link accounts' votes/reports count only after 24 h (F7).
- Firebase console: Authentication → Sign-in method → Email/Password with **Email link (passwordless)** enabled.

**F12. Light tours (Phase 4 — free)**
- "Add to tour" on any pin; **"Make me a tour"** picks the best 6–8 verified pins within ~5 km of the user.
- Stops ordered on the device (nearest-neighbour + 2-opt on straight-line distance), 🚗 drive / 🚶 walk toggle, numbered stops joined by straight lines on our map, estimated distance and time.
- **"Start tour in Google Maps"**: a Maps URL with the ordered stops as waypoints (no API key). ~9 stops per link → split longer tours into parts. Apple Maps handles multi-stop poorly → stop-by-stop fallback.
- Stops are the offset (25–50 m) locations; the photo identifies the house.
- Later: road-following lines (e.g. OpenRouteService free tier), saved and shareable tours.

### Out of scope (don't build unless asked)

Other holidays (config makes them easy later), passwords, Facebook Login (deferred, §11 #9), multiple photos, comments/chat, push notifications, offline pins, translations, public user profiles, analytics dashboards, address search/geocoding.

---

## 5. Data model (Firestore)

All timestamps are Firestore `Timestamp`, written by the server. Never strings. Document IDs are not repeated inside documents; the client adds `id` when mapping (`{ id: snap.id, ...snap.data() }`).

### `config/app` — public read, admin write
```ts
interface AppConfig {
  mapAccess: 'PUBLIC' | 'ACCOUNT' | 'PAID' | 'OFF';  // default 'ACCOUNT'. 'PAID' only valid from Phase 5.
  launchCenter: { lat: number; lng: number; zoom: number };  // Tauranga: { lat: -37.6878, lng: 176.1651, zoom: 11 }
  defaultAreaKey: string | null;                              // 'tauranga' — the list the home screen opens on
  launchMode: 'BETA' | 'LIVE';                                // default 'BETA' until launch day
  feedbackEmail: string;                                      // where "Send feedback" goes
  donateUrl: string | null;                                   // 'https://ko-fi.com/dewetellis'; null hides donate links
}

// config/testers — admin write, NO client read (server checks it)
interface TesterList {
  emails: string[];             // lowercased Google account emails allowed to write during BETA
}
```
**Beta mode** (`launchMode: 'BETA'`):
- Everyone can browse, exactly as when live.
- Every write callable that adds or changes content (`createPin`, `updatePin`, `castVote`, `reportPin`) first checks the caller's verified email (from `getAuth().getUser(uid)`, before the transaction) is in `config/testers.emails`, or the caller is an admin. Otherwise `permission-denied`: "Porchlight is in private beta — posting opens soon." `deletePin` has **no** beta gate: deleting only removes data, so a tester taken off the list can still delete their display.
- The client shows a small **Beta** badge in the header and a **Send feedback** item in the account menu. It opens a `mailto:` to `feedbackEmail` with the subject "Porchlight beta feedback" and a body pre-filled with the current URL, app version (build hash), browser user agent, screen size and signed-in state.
- `index.html` has `<meta name="robots" content="noindex">` while in beta (a build-time flag, `VITE_NOINDEX=true`).
- Launch day = set `launchMode: 'LIVE'`, rebuild without `VITE_NOINDEX`, and delete any obviously-test pins with `scripts/moderate.ts` (testers' real displays stay).

`mapAccess` is a **cost lever, not security** (the map needs no key, and Firestore reads are the real cost). `'OFF'` is the emergency switch if map-driven reads spike or the tile provider is down: the app falls back to list-only for everyone. The client reads it on start.

### `events/{eventId}` — public read, admin write
```ts
interface HolidayEvent {
  season: Season;               // 'HALLOWEEN' | 'CHRISTMAS'
  seasonYear: number;
  holidayDate: Timestamp;
  submissionsOpenAt: Timestamp;
  expiresAt: Timestamp;         // pins archived after this
  purgeAt: Timestamp;           // pins + photos deleted after this
  isActive: boolean;
}
```

### `pins/{pinId}` — `pinId = ${ownerId}_${eventId}`
The fixed ID is what makes "one pin per user per event" impossible to break.
```ts
type PinStatus = 'ACTIVE' | 'HIDDEN' | 'REMOVED' | 'ARCHIVED';
// ACTIVE   = live (verified or not)
// HIDDEN   = hidden by reports or "not there" votes; see hiddenReason
// REMOVED  = removed by admin, or deleted by owner; see removedBy
// ARCHIVED = event is over

interface DisplayPin {
  ownerId: string;              // never shown in the UI
  eventId: string;
  season: Season;
  seasonYear: number;
  title: string;
  description: string | null;
  photoPath: string;            // photos/{pinId}/{uploadId}/full.webp (versioned per upload)
  thumbPath: string;            // photos/{pinId}/{uploadId}/thumb.webp
  photoUrl: string;             // download URL made by the server; used directly in <img>
  thumbUrl: string;
  geo: GeoPoint;                // ALREADY OFFSET. The exact point is never stored.
  geohash: string;              // from `geo`, precision 9
  place: {                      // looked up from the OFFSET point
    areaKey: string | null;     // from areas.json, e.g. 'tauranga'; null if outside every area
    area: string | null;        // 'Tauranga & surrounds'
    townKey: string;            // GeoNames slug, e.g. 'papamoa-beach-e8-nz' (name-admin1code-cc)
    town: string;               // 'Pāpāmoa Beach'
    region: string;             // 'Bay of Plenty'
    countryCode: string;        // 'NZ'
  };
  status: PinStatus;
  hiddenReason: 'REPORTS' | 'NOT_THERE' | null;
  removedBy: 'OWNER' | 'ADMIN' | null;
  consentAt: Timestamp;
  voteRound: number;            // starts at 0; +1 when the photo changes (F7)
  hereVotes: number;            // counted votes in the current round only
  notThereVotes: number;
  verified: boolean;            // hereVotes >= 3 && hereVotes >= 2 * notThereVotes
  reportsCount: number;         // counted reports only
  rankScore: number;            // (isFeatured ? 100000 : 0) + (verified ? 10000 : 0) + hereVotes - notThereVotes
  isFeatured: boolean;          // Phase 5
  featuredUntil: Timestamp | null;
  moderation: {
    decision: 'NONE' | 'APPROVED' | 'REJECTED';
    reviewedBy: string | null;
    reviewedAt: Timestamp | null;
    note: string | null;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;         // copied from the event
  purgeAt: Timestamp;           // copied from the event
}
```
**Every field is server-written.** No email or display name is stored on a pin. (`ownerId` is a Firebase uid; it's readable by technical users but reveals nothing personal.)

Photos are written with `Cache-Control: public, max-age=31536000, immutable`. Each upload gets a new path, so browsers never show a stale photo.

### `pins/{pinId}/votes/{uid}` — doc ID = voter's uid
```ts
{ value: 'HERE' | 'NOT_THERE'; counted: boolean; round: number; createdAt: Timestamp; updatedAt: Timestamp }
// A vote doc whose round != pin.voteRound counts as "no vote".
```

### `pins/{pinId}/reports/{uid}` — doc ID = reporter's uid
```ts
{ reason: ReportReason; counted: boolean; createdAt: Timestamp }
```

### `placeIndex/{eventId}` — public read, server write
```ts
{
  areas: Record<string /* areaKey */, { area: string; count: number }>;
  towns: Record<string /* townKey */, { town: string; areaKey: string | null; region: string; countryCode: string; count: number }>;
  updatedAt: Timestamp;
}
```
- After its transaction commits, `createPin` does a **best-effort** merge-set that increments `towns[townKey].count` and (if in an area) `areas[areaKey].count` with `FieldValue.increment(1)`, so a new place shows up immediately. It is **not** part of the transaction (one hot doc would cause contention during bursts). A failure is only logged.
- Counts may include hidden/removed pins until `rebuildPlaceIndex` (nightly) recounts ACTIVE pins for every event with `now < purgeAt`. Archived events rebuild to empty.
- One document stays well under Firestore's 1 MB limit for thousands of towns.

### `users/{uid}` — owner can read, server writes
```ts
{ createdAt: Timestamp; banned: boolean; pinCreatesByEvent: Record<string, number>; stripeCustomerId?: string }
```
No email here — Firebase Auth holds it.
- **Created lazily.** Any callable creates `users/{uid}` inside its transaction if missing (`banned: false`, `pinCreatesByEvent: {}`, `createdAt` = Auth `metadata.creationTime`). There is no auth trigger (2nd-gen Functions don't have a non-blocking one).
- **Counted vote/report** = `getAuth().getUser(uid)`: `providerData` includes `google.com`, *or* `metadata.creationTime` ≥ 24 h ago.
- **Call `getAuth().getUser(uid)` once, before the transaction**, in every callable that needs it. Pass `countedIfNew` and `authCreatedAt` into the transaction. Never call Auth inside a transaction (it retries).
- **Ban** = set `banned: true`, `getAuth().updateUser(uid, { disabled: true })`, `revokeRefreshTokens(uid)`, set the user's pins to REMOVED with `removedBy: 'ADMIN'`.

### `rateLimits/{uid}` — server only
```ts
{ day: string /* 'YYYY-MM-DD' UTC */; createPin: number; updatePin: number; castVote: number; reportPin: number }
```
Inside each callable's transaction: if `day != today`, reset all counters and set `day = today`. Then check the limit and increment.

### `moderationActions/{autoId}` — admin read, server write (audit log)
```ts
{ pinId: string; adminUid: string; action: 'APPROVE' | 'REMOVE' | 'RESTORE' | 'BAN_USER'; note: string | null; createdAt: Timestamp }
```

### Phase 5
```ts
// sponsors/{sponsorId} — public read when active, admin write
{ name; logoPath; linkUrl; placement: 'BANNER' | 'MARKER'; geo?: GeoPoint; geohash?: string;
  seasons: Season[]; startsAt: Timestamp; endsAt: Timestamp; active: boolean }

// payments/{checkoutSessionId} — webhook writes, owner reads own
{ uid; product: 'FEATURED_PIN' | 'SUPPORTER' | 'MAP_ACCESS'; pinId?; eventId?; amountCents; currency;
  status: 'PAID' | 'REFUNDED'; stripeEventIds: string[]; createdAt: Timestamp }
```

### Indexes
- `pins`: `eventId ASC, status ASC, geohash ASC` — map and "near me"
- `pins`: `eventId ASC, status ASC, place.areaKey ASC, rankScore DESC` — area list
- `pins`: `eventId ASC, status ASC, place.townKey ASC, rankScore DESC` — town list
- `pins`: `status ASC, expiresAt ASC` — archive job
- `purgeAt` (purge job) uses the automatic single-field index — **don't list it** in `firestore.indexes.json` (single-field entries make `firebase deploy` fail).
- **No Firestore TTL policy.** TTL would delete pin docs before their photos and never deletes subcollections. `purgeExpiredPins` handles deletion.

### Storage layout
| Path | Who writes | Who reads |
|---|---|---|
| `uploads/{uid}/{uploadId}` | Owner, create only. Rule: `request.auth.uid == uid && resource == null && request.resource.contentType == 'image/jpeg' && request.resource.size < 10 * 1024 * 1024` (`resource == null`: no overwriting an existing upload) | Nobody (server only) |
| `photos/{pinId}/{uploadId}/full.webp`, `thumb.webp` | Server only | Public **get** only (`allow get`, never `list`: listing would reveal every pinId, so the owner's uid, and HIDDEN pins' photos; the random `uploadId` makes paths unguessable) |

`uploads/` is also cleaned by a **bucket lifecycle rule** (delete after 1 day, prefix `uploads/`) — a GCS bucket setting, not part of `storage.rules`. It lives in `storage.lifecycle.json`; apply it with `gcloud storage buckets update gs://<bucket> --lifecycle-file=storage.lifecycle.json`.

### Place data
**Towns (GeoNames):**
- Download GeoNames `NZ.zip` (all NZ places) + `admin1CodesASCII` (CC-BY 4.0 — credit GeoNames on the About page).
- `scripts/buildPlaces.ts` keeps populated places (feature class `P`) **including `PPLX` (suburbs — wanted here, since areas do the broad grouping)**, drops `PPLH` (historical) and `PPLQ` (abandoned), and writes `functions/data/places.json` (geonameid, name — prefer the macron spelling from alternate names when GeoNames has one, admin1 name, country, lat, lng, slug).
- Slug = `${asciiName}-${admin1Code}-${countryCode}` lowercased and slugified; add `-${geonameid}` on collision.
- `functions/src/lib/places.ts`: **nearest place** to the offset point (simple grid bucket lookup). Loaded once per function instance.

**Areas (hand-defined):** `functions/data/areas.json`, also copied to `src/config/areas.ts` for the client:
```json
[{ "key": "tauranga", "name": "Tauranga & surrounds",
   "center": { "lat": -37.70, "lng": 176.20 }, "radiusKm": 30 }]
```
A pin belongs to the first area whose circle contains its offset point. 30 km around that center covers Tauranga city, Mount Maunganui, Pāpāmoa, Te Puke, The Lakes/Tauriko, Welcome Bay and Ōmokoroa. More areas can be added later (e.g. Rotorua, Whakatāne) without code changes.

**Coverage:** a pin's offset point must be within **15 km** of a place in `places.json` (NZ only), else `createPin` rejects it with `INVALID_INPUT` ("Porchlight only covers New Zealand for now."). This keeps a pin in Sydney or mid-ocean from being filed under a NZ town.

**Tests:** points in Mount Maunganui, Pāpāmoa, Te Puke, The Lakes and Ōmokoroa all get `areaKey: 'tauranga'` and a sensible town. A point in Rotorua gets `areaKey: null`.

---

## 6. How each rule is enforced

**Core architecture:** clients **read** Firestore directly and **write nothing**. Every write goes through a Cloud Function using the Admin SDK. Firestore rules deny all client writes.

**App Check rollout:**
- **Phase 0:** register App Check (reCAPTCHA Enterprise) and initialise it in the client. Dev uses a debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`).
- **Phase 2:** every callable uses `enforceAppCheck: true`.
- **Phase 3:** turn on Firestore and Storage enforcement in the console, then confirm pin photos still load in `<img>`.

Firestore rules summary:
```
config/app:            read: true;                                             write: false
events/{id}:           read: true;                                             write: false
placeIndex/{id}:       read: true;                                             write: false
pins/{id}:             get  if resource == null || resource.data.status == 'ACTIVE' || isOwner() || isAdmin();
                       list if resource.data.status == 'ACTIVE' || isOwner() || isAdmin();   write: false
pins/{id}/votes/{u}:   read if request.auth.uid == u || isAdmin();             write: false
pins/{id}/reports/{u}: read if request.auth.uid == u || isAdmin();             write: false
users/{uid}:           read if request.auth.uid == uid;                        write: false
moderationActions:     read if isAdmin();                                      write: false
payments/{id}:         read if request.auth.uid == resource.data.uid;          write: false   (Phase 5)
sponsors/{id}:         read if resource.data.active == true || isAdmin();      write: false   (Phase 5)
rateLimits:            no client access
```
`isAdmin()` = `request.auth.token.admin == true`. `isOwner()` = `request.auth.uid == resource.data.ownerId`. The `resource == null` case lets MyPinPage `get` its own not-yet-created pin and see "doesn't exist" instead of `permission-denied`. Every pin query **must** include `where('status', '==', 'ACTIVE')` or the rules reject it. Sponsor queries must include `where('active', '==', true)`.

### Cloud Functions

| Function | Type | Phase | Does |
|---|---|---|---|
| `createPin` | callable | 2 | See below |
| `updatePin` | callable | 2 | See below |
| `deletePin` | callable | 2 | Owner sets pin to REMOVED, `removedBy: 'OWNER'`, deletes photos — except when `hiddenReason == 'REPORTS'`: those photos are kept for the moderator (`moderatePin` REMOVE or `purgeExpiredPins` deletes them). **Keeps `hiddenReason`.** Frees the slot (create cap still applies). No beta gate (§5). The rest of the doc stays (hidden) until `purgeExpiredPins`. |
| `castVote` | callable | 3 | See below |
| `reportPin` | callable | 3 | See below |
| `moderatePin` | callable | 3 | Admin only. Actions below. Always appends to `moderationActions`. |
| `rebuildPlaceIndex` | scheduled, daily 02:00 UTC | 3 | Recount ACTIVE pins per town for active events, overwrite `placeIndex/{eventId}`. |
| `archiveExpiredPins` | scheduled, daily 00:30 UTC | **by Nov 7** | ACTIVE/HIDDEN pins with `expiresAt <= now` → ARCHIVED, batches of 500. |
| `purgeExpiredPins` | scheduled, daily 01:00 UTC | 4 | Pins with `purgeAt <= now`: `bucket.deleteFiles({ prefix: 'photos/' + pinId + '/' })`, then `firestore.recursiveDelete(pinRef)`. |
| `createCheckoutSession`, `stripeWebhook` | callable / HTTPS | 5 | |
| `deleteAccount` | callable | 6 | Delete Auth user, mark pins REMOVED (`OWNER`), delete photos. |

**Function settings:** `createPin`/`updatePin` run `sharp`: `memory: '1GiB'`, `timeoutSeconds: 60`. All functions `minInstances: 0`, region `us-central1`. The lockfile is made on Windows, so check the deploy installs the Linux sharp binary (`@img/sharp-linux-x64`); if not, add it as an optional dependency in `functions/package.json`.

**Input validation (every callable, before anything else):**
- `lat` / `lng`: finite numbers in [-90, 90] / [-180, 180]; the offset point must be in coverage (§5 "Place data").
- `uploadId`: matches `^[A-Za-z0-9_-]{10,40}$`. Storage paths are always built from `auth.uid`, never from input.
- `eventId`: matches `^(HALLOWEEN|CHRISTMAS)_\d{4}$` and the `events` doc exists.
- `pinId`: matches `^[A-Za-z0-9]{20,40}_(HALLOWEEN|CHRISTMAS)_\d{4}$`.
- `title` 3–60, `description` 0–500 after trimming. Reject control characters and invisible format characters (Unicode `Cf`: zero-width spaces, bidi overrides, soft hyphens — only the zero-width joiner is allowed, for emoji), then URLs and words on a basic profanity list (checked with format characters stripped, so `evil\u200b.com` is caught).
- If input validation fails after auth, the caller's upload (if the `uploadId` itself is well-formed) is still deleted.
- `consentOwnerOrPermission` must be `true` (createPin).
- Any key the callable doesn't expect (location on `updatePin`, server-only fields) → `INVALID_INPUT`.

**Transactions:** read everything first, then write. Never run `sharp`, `getAuth()` calls or other slow work inside a transaction (they retry). Counters are updated from values read in the same transaction (e.g. `pin.hereVotes + 1`); Firestore re-runs the transaction with fresh reads on conflict, so this stays correct.

**`createPin(input: { eventId, uploadId, lat, lng, title, description?, consentOwnerOrPermission })`**
1. Require auth. Validate input. Call `getAuth().getUser(uid)` (for lazy user creation). Beta gate. Then run the step 5 checks **read-only** (no transaction, nothing written), so a call that would fail anyway (rate limit, existing pin, closed event, cap) never runs `sharp`. Step 3's offset and coverage check also run before the photo.
2. **Photo, outside any transaction:** read `uploads/{uid}/{uploadId}`. `sharp(buf, { limitInputPixels: 50e6 })`; reject unless `metadata().format` is jpeg, png or webp. Re-encode (sharp drops all metadata) to `full.webp` (1600 px) and `thumb.webp` (400 px) at `photos/{pinId}/{uploadId}/`. Get download URLs from `firebase-admin/storage`. **This is the real EXIF strip.**
3. **Offset location:** random bearing 0–360°, random distance 25–50 m, converted with the `cos(latitude)` correction for longitude. Geohash and **town lookup use the offset point**. **Never store or log the exact coordinates** (don't log the request payload).
4. Re-create over a REMOVED pin: `recursiveDelete` its old `votes` and `reports` subcollections and old photos (skip if the pin is blocked by the checks below).
5. **One transaction.** Read: `users/{uid}` (create lazily), `rateLimits/{uid}`, `events/{eventId}`, `pins/{uid}_{eventId}`. Check:
   - not banned
   - `createPin` < 3 today (`resource-exhausted`)
   - event `isActive` and `submissionsOpenAt <= now < expiresAt` (`failed-precondition`: "Submissions closed")
   - existing pin not ACTIVE/HIDDEN (`already-exists`)
   - existing pin not `removedBy: 'ADMIN'` (`permission-denied`)
   - existing pin not `hiddenReason: 'REPORTS'` (`permission-denied`: "This display is under review") — stops delete-and-re-add to escape reports
   - `pinCreatesByEvent[eventId] < 3`

   Write: the pin (ACTIVE, `verified: false`, `voteRound: 0`, all counts 0, `rankScore: 0`, `hiddenReason/removedBy: null`, `moderation.decision: 'NONE'`, dates from the event), `pinCreatesByEvent[eventId] + 1`, rate-limit + 1.
6. After commit: best-effort `placeIndex` increment (§5). If the transaction failed, delete the photos from step 2. Always delete the upload at the end.

**`updatePin(input: { eventId, title?, description?, uploadId? })`**
- Owner only. Status ACTIVE or HIDDEN. Reject if `now >= expiresAt`. `updatePin` < 10 today. Not while `hiddenReason == 'REPORTS'` (`NOT_EDITABLE`, "under review"): the reported title, description and photo stay as they are until a moderator decides. These checks also run read-only before the photo is processed (as in `createPin` step 1), and again in the transaction.
- New `uploadId` → same photo step as create (new versioned path); delete old photos after the write succeeds.
- **Any change resets `moderation.decision` to `'NONE'`** (stops approve-then-swap).
- **A photo change starts a new vote round**, in the same transaction as the pin write: `voteRound + 1`, `hereVotes = notThereVotes = 0`, `verified = false`, `rankScore = isFeatured ? 100000 : 0`. People verified the old photo, not the new one. Afterwards, delete the votes whose `round` is older than the new round, as cleanup only (a vote cast right after the edit is kept) — correctness comes from the round number, so a vote cast mid-edit can't be counted twice. Title/description edits keep votes.
- A HIDDEN pin stays HIDDEN after an edit. Location can't change.

**`castVote(input: { pinId, value: 'HERE' | 'NOT_THERE' })`**
1. Before the transaction: `getAuth().getUser(uid)` → `countedIfNew` (Google provider or account ≥ 24 h), `authCreatedAt`.
2. Transaction — read `users/{uid}`, `rateLimits/{uid}`, the pin, `votes/{uid}`. An existing vote whose `round != pin.voteRound` is treated as no vote.
3. Check: not banned, `castVote` < 40 today, pin ACTIVE, caller isn't the owner. Same value as the current-round vote → no-op.
4. `counted` = the current-round vote's `counted` if changing, else `countedIfNew`.
5. If counted: remove the old value from its counter (if any), add the new one.
6. Recompute `verified`, `rankScore`. If the "not there" rule in F7 is met → status HIDDEN, `hiddenReason: 'NOT_THERE'`.
7. Write the vote doc (with `round = pin.voteRound`), pin, rate limit.

**`reportPin(input: { pinId, reason })`**
1. Before the transaction: `getAuth().getUser(uid)` → `countedIfNew`, `authCreatedAt`.
2. Transaction — read `users/{uid}`, `rateLimits/{uid}`, the pin, `reports/{uid}`.
3. Check: not banned, `reportPin` < 20 today, pin ACTIVE, not owner, no existing report. `counted = countedIfNew`. If counted: `reportsCount + 1`.
4. If `reportsCount >= threshold` (3, or 8 when `moderation.decision == 'APPROVED'`) → HIDDEN, `hiddenReason: 'REPORTS'`.
5. Write the report doc, pin, rate limit.

**`moderatePin(input: { pinId, action, note? })`** — admin only (`auth.token.admin === true`)

| Action | From → to | Also sets |
|---|---|---|
| `APPROVE` | HIDDEN → ACTIVE | `decision = 'APPROVED'`, `hiddenReason = null` |
| `REMOVE` | ACTIVE/HIDDEN → REMOVED (also an owner-REMOVED pin with `hiddenReason: 'REPORTS'`) | `removedBy = 'ADMIN'`, `decision = 'REJECTED'`; deletes the photos |
| `RESTORE` | REMOVED (by admin) → ACTIVE | `removedBy = null`, `decision = 'APPROVED'` |
| `BAN_USER` | owner's pins → REMOVED | Ban procedure (§5 `users`) |

Each action sets `moderation.reviewedBy`, `reviewedAt`, `note`. Until the admin UI (Phase 4), admins run `scripts/moderate.ts`, which calls this function. **Never hand-edit pin fields in the console.**

### Rule → where it's enforced

| Rule | Enforced by |
|---|---|
| Anonymous = read only | Rules: `write: false` everywhere; callables require `auth` |
| Private beta: only testers write | `config/testers` check in every write callable except `deletePin` while `launchMode == 'BETA'` |
| One pin per user per event | Fixed doc ID + transaction in `createPin` |
| Max 3 creates per event; admin-removed stays removed | `createPin` transaction |
| Rate limits (create 3, update 10, vote 40, report 20 per day) | `rateLimits/{uid}` in each callable |
| Photo required, metadata stripped | `createPin`/`updatePin` with `sharp`; Storage rules limit type and size |
| Location offset | `createPin` only; location not editable |
| One vote / one report per user per pin | Doc ID = uid |
| Only real accounts move the numbers | `counted` flag (Google or ≥ 24 h) |
| Verified / not-there / report thresholds | `castVote`, `reportPin` |
| Admin actions | `admin` custom claim (`scripts/setAdmin.ts`); checked in `moderatePin` and rules |
| Map only for members | Client, based on `config/app.mapAccess` (cost control, not security) |
| Auto-archive | `archiveExpiredPins`; queries filter by current `eventId` |
| Featured status | Only `stripeWebhook` writes it (Phase 5) |
| Scripted abuse | App Check on Firestore, Storage, callables |

---

## 7. Screens and routes

| Route | Screen | Phase |
|---|---|---|
| `/` | **ExplorePage** — place search, popular places, near me, results list, List \| Map segment. Reads `?area=`, `?town=` and `?pin=`; with none, opens `config/app.defaultAreaKey` | 1 |
| `/a/:areaKey` | Redirect route: `redirect: to => ({ path: '/', query: { area: to.params.areaKey } })` | 1 |
| `/t/:townKey` | Redirect route: `redirect: to => ({ path: '/', query: { town: to.params.townKey } })` | 1 |
| `/p/:pinId` | Redirect route: `redirect: to => ({ path: '/', query: { pin: to.params.pinId } })` | 1 |
| `/sign-in` | **SignInPage** — "Continue with Google" (+ email link in Phase 4) | 1 |
| `/submit` | **SubmitPinPage** — add/edit flow (auth-guarded) | 2 |
| `/me` | **MyPinPage** — my pin, status, edit/delete, sign out | 2 |
| `/about` | **AboutPage** — privacy policy and terms first (Phase 2, needed for the Google consent screen); how it works, verification, guidelines, contact, GeoNames credit (Phase 3) | 2–3 |
| `/auth/complete` | Email link completion | 4 |
| `/admin` | **AdminQueuePage** (admin-guarded) | 4 |
| `/feature/:pinId`, `/supporter`, `/checkout/result` | Payment pages | 5 |
| `*` | NotFoundPage | 1 |

**Empty and error states:** off-season, town has no displays yet, no displays near you, zoom in to see displays, location permission denied, offline, sign-in cancelled/popup blocked, already have a pin, submissions closed, rate limited, map temporarily unavailable (`mapAccess: 'OFF'`).

**Mobile rules:** design at 375 px first. Tap targets ≥ 44 × 44 px. No horizontal scroll. Pin details always in a bottom sheet.

---

## 8. Build plan

Today is **Thu Oct 1, 2026**. The code is built by Claude Code agents, so phases run back to back as fast as they pass their checks — the dates below are targets, not waits. **Security rules in §6 are never cut to save time.**

| When | Milestone |
|---|---|
| Oct 1–3 | Phases 0–3 built; browser (E2E) tests passing |
| ~Oct 3–4 | **Private beta** live at `porchlight-nz.firebaseapp.com` (`launchMode: 'BETA'`) |
| ~Oct 4–12 | Beta testing by the owner + 3–5 testers (mix of iPhone and Android); bugs fixed as they come in |
| ~Oct 13–15 | Feature freeze, flip to `LIVE`, announce |
| Oct 31 | Halloween |

### Testing (every phase)
- **Unit** (Vitest), **rules** (`@firebase/rules-unit-testing`), **functions** (callables against the emulator).
- **Browser E2E** (Playwright, headless Chromium + WebKit) against the emulators with seeded data, at **iPhone 13** and **Pixel 7** viewports. Covers: open `/a/tauranga`, search "papamoa", town chips, verified-only, open a pin sheet, Near me (mocked geolocation), sign-in (Auth emulator Google popup), add a display (with a GPS-tagged test photo), my pin edit/delete, vote/change vote, report, map tab (signed out → prompt; signed in → map container renders). Screenshots saved to `tests/e2e/__screenshots__/` for review. Command: `npm run test:e2e`.
- Every fix is followed by the full suite, so a fix can't silently break something else.
- **Beta testers** cover what automation can't: real phones, mobile data, iPhone photos, the home-screen app, confusing wording.

### Phase 0 — Foundations (Oct 1–3)
- Scaffold Vite + Vue + TS; add Ionic Vue, Pinia, Vue Router, Tailwind v4 (no Preflight, layer order from §2), maplibre-gl, firebase, geofire-common, Vitest, rules-unit-testing.
- Firebase project on Blaze, **everything in `us-central1`**. Budget alerts at $5 and $20. `firebase init`: Firestore, Storage, Functions (TS, Node 22), Hosting (SPA), emulators.
- `src/services/firebase.ts`: emulators in dev, App Check init (debug token in dev).
- Map: MapLibre GL JS with OpenFreeMap's public `dark` style — no account or key.
- `.env.example`, git repo.

**Done when:** `npm run dev` shows an Ionic page · `npm run build` has no TS errors · emulators run and the app connects to them · a placeholder deploys to `<project>.firebaseapp.com`.

### Phase 1 — Explore: list, search, map (Oct 4–8)
- Types, season config, `seasonDates.ts` + tests (Oct 31, Nov 7/8, Dec 25, Dec 31, Jan 7/8).
- `scripts/buildPlaces.ts` + `functions/src/lib/places.ts` + tests (a few known points → expected towns).
- `useAppConfigStore`, `useSeasonStore` (with the usable-season rule, §3) + `data-season` theming.
- Google provider enabled. `authService` (`signInWithPopup`), `useAuthStore`, SignInPage, and the `authDomain` host redirect (F4) — needed so the map can be tested signed-in.
- `functions/data/areas.json` (+ `src/config/areas.ts`) with the Tauranga area.
- ExplorePage: place search over `placeIndex` (areas + towns, macron-insensitive), opens on the Tauranga area with town chips, popular places, near me, area/town results with cursor paging, verified-only toggle, `?area=`/`?town=`/`?pin=` handling and the `/a/`, `/t/`, `/p/` redirect routes.
- Map segment: `useMap` (single instance, `v-show`), fixed-cell queries + cache, clustering, verified/unverified icons, sign-in prompt for anonymous, `mapAccess` handling.
- Pin detail sheet (read-only parts).
- `scripts/seed.ts` (config, events, placeIndex, ~50 pins across Tauranga, Mount Maunganui, Pāpāmoa and Te Puke, plus a few in Rotorua outside the area) and `scripts/createEvents.ts`.
- Read rules + rules tests (anonymous can read ACTIVE pins, config, events, placeIndex; can't read HIDDEN; can't write anything; a signed-in user can `get` their own non-existent pin and sees exists=false; `isAdmin()` via a test claim).

**Done when:** the home screen opens on Tauranga & surrounds with its pins verified-first · town chips narrow it to e.g. Pāpāmoa · typing "papamoa" finds Pāpāmoa · opening `/a/tauranga`, `/t/<town>` and `/p/<pin>` lands on the single ExplorePage (no second map) · near me lists by distance · signed-out users see the map prompt, signed-in users see a clustered map · panning only queries after `moveend` · setting `mapAccess: 'OFF'` hides the map for everyone · rules tests pass · 375 px layout passes the 44 px check.

### Phase 2 — Sign in + add a display (Oct 9–13)
- Minimal `/about` with privacy policy and terms, then the Google OAuth consent screen (app name, privacy policy URL). Route guard for `/submit` and `/me`.
- `src/lib/image.ts`. Storage rules for `uploads/`. Bucket lifecycle rule.
- `createPin`, `updatePin`, `deletePin` with validation, rate limits, `sharp`, offset, town lookup, `placeIndex` increment. `enforceAppCheck: true`.
- SubmitPinPage (location picker map, photo, details, consent) and MyPinPage.

**Done when:** Google sign-in works on desktop Chrome, iOS Safari and Android Chrome · a submitted pin appears in its town's list and on the map as Unverified · stored point is 25–50 m from the chosen point (unit test) · a GPS-tagged photo uploaded directly with the SDK comes out with no EXIF · a second pin for the same event fails with a friendly message · two simultaneous `createPin` calls produce one pin · an admin-removed pin can't be re-created · all tests pass.

### Phase 3 — Votes, reports, moderation, launch (Oct 14–17)
- `castVote`, `reportPin` + the buttons in the detail sheet. Verified badge and ranking live.
- `moderatePin`, `scripts/setAdmin.ts`, `scripts/moderate.ts`, `docs/RUNBOOK.md` (how to review HIDDEN pins, ban, flip `mapAccess`).
- `rebuildPlaceIndex`.
- Rest of the About page, manifest + icons (if `vite-plugin-pwa` is used: `navigateFallbackDenylist: [/^\/__\//]`).
- Turn on Firestore + Storage App Check enforcement.
- Beta mode: `launchMode`, `config/testers` checks in all write callables, Beta badge, Send feedback, `noindex` flag, `scripts/setTesters.ts` (add/remove tester emails).
- **F11 email link sign-in** (brought forward), **in-app browser guidance** on `/sign-in` (F4), **install prompt** (F10), donate link (F9).
- Then a **design + usability polish pass** before beta invites: 2–3 visual directions mocked as screenshots for the owner to pick; persona walkthroughs (first-time visitor from a Facebook link, parent on a phone in the dark, older non-techy user, first-time poster); a 5-second first-visit welcome; copy review (short, friendly, Kiwi).
- Playwright E2E suite (see Testing above) passing on both viewports.
- Deploy the **private beta**; real-device smoke test (iPhone Safari, Android Chrome, installed home-screen app).
- **Launch** after beta testing (§8 launch plan).

**Done when:** 3 counted "It's here" votes verify a pin; changing a vote moves the counts correctly · 3 counted "Not there" votes (outnumbering "here") drop a pin from results, and after admin APPROVE the next vote doesn't re-hide it · a photo change resets votes and a mid-edit vote isn't double-counted · Google sign-in still works with the service worker installed · 3 counted reports hide a pin; self-vote and double-report are rejected · an email-link-style account younger than 24 h votes but isn't counted (function test with a fake provider) · requests without App Check are rejected in prod **and photos still load** · a new user goes from link to live pin in under 3 minutes on a real phone.

**If beta testing finds more than can be fixed by ~Oct 15, cut in this order** (never security): installable manifest → `/p/` share links → edit pin (delete + re-add instead) → popular places list. Don't let launch slip past Oct 20.

### Launch plan
- **Launch in Tauranga & surrounds only.** 30 pins in one area beats 3 across a country. `config/app.defaultAreaKey = 'tauranga'`.
- Get 10–20 real displays in before announcing (friends, neighbours, your own).
- Share `/a/tauranga` in local Facebook groups (Tauranga / Pāpāmoa / Mount / Te Puke community pages), neighbourhood WhatsApp groups, and school newsletters.
- During Oct 17–31: bug fixes and moderation only, no new features.

### Before Nov 7
- `archiveExpiredPins` deployed and tested against seeded expired pins.

### Phase 4 — Christmas update (by Nov 15)
- OpenFreeMap `positron` style, Christmas palette/icons, `CHRISTMAS_2026` event doc, season switcher.
- F12 Light tours.
- Custom email sender domain (SPF/DKIM) for F11 links.
- Optional custom domain (add to Auth authorized domains, and use as `authDomain`).
- Full PWA service worker with offline fallback (keep the `/__/` denylist).
- AdminQueuePage (UI over `moderatePin`).
- `purgeExpiredPins`.

### Phase 5 — Money (web only)
Stripe Checkout via `createCheckoutSession`; `stripeWebhook` verifies the signature, is idempotent via `payments/{sessionId}`, and is the **only** writer of `isFeatured`/`featuredUntil` and supporter status. Featured pin, Supporter extras, sponsors (admin-created, always labelled "Sponsored"), donation link, `mapAccess: 'PAID'` support (left off). Stripe secrets in Secret Manager.

### Phase 6 — Native apps (Capacitor 8)
- `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/app`; `@capacitor-firebase/authentication` for Google, Apple and email link.
- **Sign in with Apple** is required on iOS once Google sign-in is offered.
- Email links on native: Firebase Dynamic Links is shut down (Aug 2025). Use the Hosting domain for iOS Universal Links / Android App Links, `ActionCodeSettings.linkDomain`, handle `appUrlOpen`. JS SDK must use `initializeAuth(app, { persistence: indexedDBLocalPersistence })`. Never set `dynamicLinkDomain`.
- The map needs no key on native either (OpenFreeMap has no origin restrictions). If we've moved to a paid tile provider by then, allow the WebView origins (`capacitor://localhost` / `https://localhost`).
- App Check native providers via `@capacitor-firebase/app-check`.
- **Hide all purchase and donation UI in native builds** (store rules require in-app purchase for digital goods). Recheck store rules at submission.
- Account deletion, report + block (Apple 1.2), terms acceptance, App Privacy / Data Safety forms. Apple may question the map requiring sign-in; the list view working without an account helps.

---

## 9. Costs and safety switches

Budget is close to zero. Expected cost for a one-town Halloween launch: **about $0**.

| Service | Free allowance (approx.) | Launch-scale use | Risk and mitigation |
|---|---|---|---|
| Map (MapLibre GL JS + OpenFreeMap) | Free: no key, no usage limits | Members only; one map per session | No SLA — if it's down or slow, `mapAccess: 'OFF'` and point the style URLs at self-hosted OpenFreeMap / Protomaps or a paid provider. Never `tile.openstreetmap.org`. |
| Firestore | 50k reads + 20k writes per day | A search + 3 pages ≈ 60 reads; map viewport ≈ tens–hundreds | Zoom ≥ 11, cell cache, `limit`, no `onSnapshot` on lists/map |
| Cloud Functions | ~2M invocations/month | Only writes call functions | `minInstances: 0` |
| Cloud Storage | No-cost allowance in US regions | Thumbnails ~30 KB, full photos ~200 KB | Client resize, 10 MB cap, lifecycle on `uploads/` |
| Hosting | Small daily transfer allowance | App bundle per visitor | Keep the bundle small; lazy-load the map code |
| Google sign-in | Free | — | — |
| Domain | Optional (~$10/year) | Use free `firebaseapp.com` for launch | — |

**Safety switches, cheapest first:**
1. Budget alerts at $5 and $20 (email).
2. `config/app.mapAccess = 'OFF'` → list-only for everyone, instantly, no deploy.
3. Map tiles misbehaving → change `VITE_MAP_STYLE_*` to another provider and redeploy.
4. Optional hard stop: a budget → Pub/Sub → function that disables billing on the project. This **takes the whole app offline**; only use it if an unexpected bill is worse than downtime.

---

## 10. Privacy and safety

- **The offset is not a privacy guarantee.** The photo plus street-level imagery identifies the house. Say so in the submit flow and on the About page.
- **Anyone can submit any house**, with the consent checkbox. Mitigations: `PRIVACY` report reason, takedown contact on About, admin remove.
- **Photos:** all metadata removed server-side. Guidelines ask users not to show house numbers, plates or faces. Automated blurring and SafeSearch are out of scope for launch.
- **No public profiles.** Pins never show who posted them. Emails live only in Firebase Auth.
- **Town only**, never street, is derived and stored.
- **Data retention:** pins and photos deleted ~13 months after the event. An owner's delete hides the pin and deletes its photo at once (a reported pin's photo is kept for the moderator); the rest of the pin doc stays, hidden, until the purge, to enforce per-season limits. The privacy policy says exactly this.
- **Third parties:** map tiles load straight from OpenFreeMap, which sees the viewer's IP and the map area (including the area around a house in the location picker). The privacy policy names it. The beta tester email list lives only in `config/testers` (server-read).
- **Law:** NZ **Privacy Act 2020** (Information Privacy Principles; notifiable privacy breaches go to the Privacy Commissioner). The privacy policy must say what's collected (Google account email, approximate location, photos), why, where it's stored (Google Cloud, USA), how long (~13 months), and how to ask for access or deletion.
- **Halloween and kids:** don't show who submitted a pin; set a minimum age in the terms.

---

## 11. Open decisions

Defaults are what gets built unless you change them.

| # | Question | Default |
|---|---|---|
| 1 | Launch area | ✅ Tauranga & surrounds, Bay of Plenty, NZ (30 km radius) |
| 2 | App name | **Porchlight** (working) — confirm before the Firebase project is created (project ID is permanent) |
| 3 | Custom domain | None for launch — use `<project>.firebaseapp.com` |
| 4 | Can anyone submit a house, or only the homeowner? | Anyone, with the consent checkbox and takedown path |
| 5 | Verified threshold | 3 counted "It's here" votes, at least 2× the "Not there" votes |
| 6 | Map access | `ACCOUNT` (free with sign-in); `PAID` built later but off |
| 7 | Featured pin price | NZ$4.99 per pin per event, web only (Phase 5) |
| 8 | Christmas expiry | Jan 8, 12:00 UTC (covers Jan 7 in every timezone) |
| 9 | Facebook Login | **Deferred.** Known risk: links shared in Facebook groups open in Facebook's in-app browser, where Google sign-in fails. Mitigated for launch by email sign-in + "open in browser" guidance + the install prompt. Revisit before launch (~Oct 13). |
| 10 | Donations | ✅ Ko-fi "Buy a bad decision" (https://ko-fi.com/dewetellis) |
