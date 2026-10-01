# Porchlight — Runbook

Operational steps. SPEC.md is the source of truth for behaviour; this file is
the "what to run, in what order" list.

All scripts below default to the **local emulators** (project
`demo-porchlight`; start them with `npm run emulators`). Add
`--project porchlight-nz` for the real project, which needs Application Default
Credentials once per machine:

```
gcloud auth application-default login
gcloud auth application-default set-quota-project porchlight-nz
```

Anything that changes data is a **dry run unless `--apply`** — read the dry
run, then re-run with `--apply`.

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
4. Deploy rules, functions and hosting. **Beta builds use `build:beta`**,
   which adds `<meta name="robots" content="noindex">` (SPEC §5 beta mode) —
   plain `npm run build` is for launch day only:
   ```
   npm run build:beta
   npx firebase deploy --only firestore,storage,functions,hosting
   ```
   Check: `curl -s https://<authDomain>/ | grep noindex` prints the meta tag.
5. **Confirm App Check enforcement** on the callables: a request without an App
   Check token (e.g. `curl` to the callable URL) is rejected, and the app can
   still add a display.
6. **Real-device Google sign-in:** desktop Chrome, iOS Safari, Android Chrome.
7. **Sign-in emails (F11).** The 60 s resend cooldown is only in the app, so
   a script could call the Auth API to flood someone's inbox or use up the
   project's daily email quota (which would stop email sign-in on launch
   night):
   - Firebase console → **App Check → APIs → Authentication**: check the
     metrics, then **Enforce** (if the console doesn't offer it for this
     project, it needs the Identity Platform upgrade — note it and move on).
   - Check the daily email-sending limits for Authentication (Firebase docs
     "Auth limits") against the expected launch-night sign-ups.
   - **Project settings → General → Public-facing name** = `Porchlight`, and
     Authentication → **Templates** → Email address sign-in: sender name
     `Porchlight`. The default "Sign in to porchlight-nz" email looks like
     spam to parents. Send yourself a link and check it reads well.

## Testers and admins

**Beta testers** (`config/testers.emails`; only these accounts — plus admins —
can add displays, vote or report while `launchMode` is `BETA`):

```
npm run testers -- list --project porchlight-nz
npm run testers -- add friend@gmail.com other@gmail.com --project porchlight-nz --apply
npm run testers -- remove friend@gmail.com --project porchlight-nz --apply
```

The email must be the **verified** email of the account they sign in with
(their Google address, or the address they use for the email link). Taking
someone off the list doesn't delete their display; they can still delete it.

**Admins** (the `admin` custom claim, checked by `moderatePin` and the
Firestore rules). The person must have signed in to Porchlight once first.

```
npm run admin -- list --project porchlight-nz
npm run admin -- grant you@gmail.com --project porchlight-nz --apply
npm run admin -- revoke someone@gmail.com --project porchlight-nz --apply
```

After a grant, they **sign out and back in** (the claim rides in the ID token,
refreshed hourly). A revoke also revokes their refresh tokens; their current
token can stay valid for up to an hour.

## Daily moderation (≈ 5 minutes, every day from beta to Halloween)

Votes and reports hide pins automatically; **nothing un-hides on its own**. A
moderator decides every HIDDEN pin.

1. **List the queue:**
   ```
   npm run moderate -- queue --project porchlight-nz [--event HALLOWEEN_2026]
   ```
   For each HIDDEN pin it prints the title, town, `hiddenReason`, the counted
   here / not-there / report numbers, every report reason (and how many were
   counted), and the photo URL. It also lists pins **the owner deleted while
   hidden for REPORTS** (their photos are kept for you).
2. **Look at the photo** (open the URL). For `NOT_THERE`, compare with the
   town/street if you can; for `REPORTS`, read the reasons — `PRIVACY` and
   `INAPPROPRIATE` first.
3. **Decide** (dry run first, then add `--apply`; `--note` is stored only in
   the admin-only audit log `moderationActions`, never on the pin;
   `--by you@gmail.com` records your uid as the reviewer, otherwise `cli`).
   `moderation.reviewedBy` is readable by anyone on ACTIVE pins, so don't put
   names or emails in `--by` other than an admin's sign-in email:
   | Situation | Command |
   |---|---|
   | Real display, hidden unfairly | `npm run moderate -- approve <pinId> --note "checked" --apply` |
   | Not a display, private info, offensive, spam | `npm run moderate -- remove <pinId> --note "why" --apply` |
   | Abusive account (spam, repeated bad pins) | `npm run moderate -- ban <pinId> --note "why" --apply` |
   | Removed by mistake | `npm run moderate -- restore <pinId> --note "why" --apply` |
   | Just look at one pin | `npm run moderate -- show <pinId>` |

   What each does (same code as the `moderatePin` callable; every action is
   appended to `moderationActions`):
   - **approve** — HIDDEN → ACTIVE, `decision: APPROVED`. From now on it takes
     **8** counted "not there" votes (outnumbering "here") or 8 counted reports
     to hide it again. Any edit by the owner resets the approval.
   - **remove** — REMOVED by ADMIN, `decision: REJECTED`, photos deleted. The
     owner can't re-add a display this season.
   - **ban** — bans the pin's **owner**: `users/{uid}.banned`, Auth account
     disabled and signed out, and **all** their pins removed (photos deleted).
     Re-running a ban is safe. A ban does **not** undo the banned account's
     votes and reports on other people's pins: after banning a troll, run
     `queue` again and review the `NOT_THERE` and `REPORTS` pins hidden
     around the same time (approve the real ones). Vote/report docs don't
     store the voter in a field yet, so there's no automatic reversal.
   - **restore** — admin-REMOVED → ACTIVE. The photos were deleted by the
     remove, so the photo will be broken until the owner uploads a new one
     (My Pin → edit) — tell them, or remove again.
4. **Never hand-edit pin documents in the console.** Counters, statuses and
   the audit log only stay right when changes go through `moderatePin`.
5. **Takedown emails** (from the About page contact): `show` the pin, then
   `remove` with a note such as "takedown request <date>".

Nightly jobs (UTC) also run on their own — check their logs in the console
(Functions → Logs) if something looks off:
- `archiveExpiredPins` 00:30 — ACTIVE/HIDDEN pins past the event's `expiresAt`
  → ARCHIVED.
- `rebuildPlaceIndex` 02:00 — recounts ACTIVE pins per area/town into
  `placeIndex/{eventId}` (search counts can be a day stale until then).

## Switches

**Launch day — flip `launchMode` to LIVE** (anyone signed in can post, vote and
report):
1. Remove obvious test pins: `npm run moderate -- queue` / `show`, then
   `remove <pinId> --note "beta test pin" --apply` (testers' real displays stay).
2. Firestore console → `config/app` → set `launchMode` to `LIVE`. It takes
   effect on the next callable; no deploy.
3. Rebuild and deploy hosting **without** `VITE_NOINDEX=true` so search engines
   can index the site:
   ```
   npm run build
   npx firebase deploy --only hosting --project porchlight-nz
   ```
4. Back out: set `launchMode` to `BETA` (writes are limited to testers again
   at once).

**Map emergency switch — `mapAccess: 'OFF'`** (map-driven reads spike, or
OpenFreeMap is down/slow): Firestore console → `config/app` → `mapAccess` =
`OFF`. The app falls back to list-only for everyone on next load; no deploy.
Set it back to `ACCOUNT` afterwards. If the tiles themselves are the problem,
change `VITE_MAP_STYLE_*` to another provider, rebuild and redeploy hosting.

**Budget alerts** at $5 and $20 email the owner (Billing → Budgets & alerts).

## App Check enforcement (Phase 3, before launch)

Callables already enforce App Check in production (`enforceAppCheck`). Turn on
Firestore and Storage enforcement too:

1. Firebase console → **App Check → APIs**. Check the **metrics** for Cloud
   Firestore and Cloud Storage first: nearly all requests should be
   "verified". Unverified traffic from your own devices means a debug token or
   an old app build — fix that first.
2. **Cloud Firestore → Enforce.** **Cloud Storage → Enforce.** (Enforcement can
   take up to ~15 minutes to apply.)
3. Check on a real phone (signed out **and** signed in): the Tauranga list
   loads, **pin photos and thumbnails still load in `<img>`**, the map loads,
   a tester can add a display and vote.
4. Check a request without App Check fails, e.g.
   `curl -X POST https://us-central1-porchlight-nz.cloudfunctions.net/castVote -H "Content-Type: application/json" -d '{"data":{}}'`
   → 401/permission error.
5. If photos break: App Check → APIs → Cloud Storage → **Unenforce** (instant
   rollback), then investigate. Storage enforcement also stops scripted
   uploads to `uploads/` (Storage rules can't rate-limit them).
6. Local dev keeps working with the debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`);
   register any new debug token under App Check → Apps → Manage debug tokens.

## Storage lifecycle rule (`uploads/`)

Client uploads in `uploads/` are deleted by the callables, and after **1 day**
by a bucket lifecycle rule as a backstop (`storage.lifecycle.json`). It's a
bucket setting, not part of `storage.rules`, so `firebase deploy` doesn't apply
it. Apply/check it once per bucket (and again if the file changes):

```
gcloud storage buckets update gs://porchlight-nz.firebasestorage.app --lifecycle-file=storage.lifecycle.json
gcloud storage buckets describe gs://porchlight-nz.firebasestorage.app --format="default(lifecycle_config)"
```

Don't add a rule (or a Firestore TTL policy) for `photos/` or pins:
`purgeExpiredPins` (Phase 4) deletes those in the right order.

## After a functions deploy that failed and was retried

If a 2nd-gen function fails on its **first** deploy and is then retried, the retry is an *update*, which does **not** grant the public invoker role. The function then rejects every browser call before our code runs, and the browser reports it as a **CORS error** (`No 'Access-Control-Allow-Origin' header`). This happened to `createPin`/`updatePin` on 2026-10-01.

Check every callable answers its CORS preflight:

```
for f in createPin updatePin deletePin castVote reportPin moderatePin; do
  printf "%-12s " $f
  curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
    -H "Origin: https://porchlight-nz.firebaseapp.com" -H "Access-Control-Request-Method: POST" \
    "https://us-central1-porchlight-nz.cloudfunctions.net/$f"
done
```

All should print `204`. For any that don't, grant `roles/run.invoker` to `allUsers` on that Cloud Run service (Cloud Run → service → Permissions → Add principal `allUsers`, role *Cloud Run Invoker*). This is the normal setting for Firebase callables: auth, the beta gate and App Check are still enforced inside the function.
