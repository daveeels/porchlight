# Porchlight — Runbook

Operational steps. SPEC.md is the source of truth for behaviour; this file is
the "what to run, in what order" list. (Moderation, bans and `mapAccess`
switches get added here in Phase 3.)

## Before the private beta deploy

1. **`.env.local` is complete.** Every `VITE_FIREBASE_*` value and
   `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` must be set. A production build with any
   of them blank refuses to start (`src/config/env.ts`) rather than quietly
   using the offline demo project without App Check.
2. **Apply the `uploads/` lifecycle rule** to the real bucket (deletes client
   uploads after 1 day; the callables delete them too, this is the backstop for
   abandoned uploads):
   ```
   gcloud storage buckets update gs://<bucket> --lifecycle-file=storage.lifecycle.json
   gcloud storage buckets describe gs://<bucket> --format="default(lifecycle_config)"
   ```
3. **OAuth consent screen:** app name "Porchlight", privacy policy URL
   `https://<authDomain>/about#privacy`.
4. Deploy rules, functions and hosting:
   ```
   npm run build
   npx firebase deploy --only firestore,storage,functions,hosting
   ```
5. **Confirm App Check enforcement** on the callables: a request without an App
   Check token (e.g. `curl` to the callable URL) is rejected, and the app can
   still add a display.
6. **Real-device Google sign-in:** desktop Chrome, iOS Safari, Android Chrome.

## Phase 3 (before launch)

- Turn on Firestore and Storage App Check enforcement in the console, then check
  pin photos still load in `<img>`. Storage enforcement also stops scripted
  uploads to `uploads/` (Storage rules can't rate-limit them).
