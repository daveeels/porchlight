// Creates the HALLOWEEN_<year> and CHRISTMAS_<year> event docs and fills in any
// missing config/app defaults (SPEC §3 dates, SPEC §5 shapes).
//
// Run:  npm run events:create -- --year 2026 [--project porchlight-nz] [--only HALLOWEEN] [--apply] [--overwrite]
//
// Dry run by default: prints what it would write. --apply writes.
// Existing event docs are left alone unless --overwrite (so an admin's isActive
// kill switch is never reset by accident). config/app is merged: only missing
// fields are added.
//
// A real project needs Application Default Credentials:
//   gcloud auth application-default login
// With FIRESTORE_EMULATOR_HOST set it writes to the emulator instead. A demo-*
// project always uses the emulator (defaults to 127.0.0.1:8080).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GeoPoint as ClientGeoPoint, Timestamp as ClientTimestamp } from 'firebase/firestore'
import { applicationDefault, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, GeoPoint, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { AppConfig, EventId, HolidayEvent, Season } from '../src/types/models'
import { AREAS, LAUNCH_CENTER } from '../src/config/areas'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A src/types model with client SDK Timestamp/GeoPoint swapped for the Admin SDK ones. */
export type AdminDoc<T> = T extends ClientTimestamp
  ? Timestamp
  : T extends ClientGeoPoint
    ? GeoPoint
    : T extends object
      ? { [K in keyof T]: AdminDoc<T[K]> }
      : T

export interface EventDates {
  holidayDate: Date
  submissionsOpenAt: Date
  expiresAt: Date
  purgeAt: Date
}

// All the NZ-local dates below (Oct 1, Oct 31, Nov 15, Dec 25) fall inside NZ
// daylight time (last Sunday of Sep → first Sunday of Apr), so NZ midnight is
// always 11:00 UTC the day before.
const NZDT_OFFSET_MS = 13 * 60 * 60 * 1000

/** 00:00 NZ time on the given day. `month` is 1–12. */
function nzMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - NZDT_OFFSET_MS)
}

function addUtcMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

/**
 * SPEC §3 table. Submissions open at NZ midnight; expiry is 12:00 UTC the day
 * after the last day (covers that day in every timezone); purge is +13 months.
 * `year` is the event year (Christmas: the year of Dec 25).
 */
export function eventDates(season: Season, year: number): EventDates {
  if (season === 'HALLOWEEN') {
    const expiresAt = new Date(Date.UTC(year, 10, 8, 12))
    return {
      holidayDate: nzMidnight(year, 10, 31),
      submissionsOpenAt: nzMidnight(year, 10, 1),
      expiresAt,
      purgeAt: addUtcMonths(expiresAt, 13),
    }
  }
  const expiresAt = new Date(Date.UTC(year + 1, 0, 8, 12))
  return {
    holidayDate: nzMidnight(year, 12, 25),
    submissionsOpenAt: nzMidnight(year, 11, 15),
    expiresAt,
    purgeAt: addUtcMonths(expiresAt, 13),
  }
}

export function eventIdOf(season: Season, year: number): EventId {
  return `${season}_${year}`
}

/** The events/{eventId} document for a season and event year. */
export function eventDoc(season: Season, year: number, isActive = true): AdminDoc<HolidayEvent> {
  const d = eventDates(season, year)
  return {
    season,
    seasonYear: year,
    holidayDate: Timestamp.fromDate(d.holidayDate),
    submissionsOpenAt: Timestamp.fromDate(d.submissionsOpenAt),
    expiresAt: Timestamp.fromDate(d.expiresAt),
    purgeAt: Timestamp.fromDate(d.purgeAt),
    isActive,
  }
}

/** config/app defaults (SPEC §5): members-only map, opens on Tauranga. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  mapAccess: 'ACCOUNT',
  launchCenter: { lat: LAUNCH_CENTER.lat, lng: LAUNCH_CENTER.lng, zoom: LAUNCH_CENTER.zoom },
  defaultAreaKey: AREAS[0]?.key ?? null,
}

/** Readable form of a doc for printing (Timestamps as ISO strings). */
export function printable(doc: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(doc)) {
    out[k] = v instanceof Timestamp ? v.toDate().toISOString() : v
  }
  return out
}

// ---------------------------------------------------------------------------

interface Args {
  year: number
  project: string
  only: Season | null
  apply: boolean
  overwrite: boolean
}

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

function defaultProject(): string {
  if (process.env.FIRESTORE_EMULATOR_HOST) return 'demo-porchlight'
  const rc = resolve(ROOT, '.firebaserc')
  if (existsSync(rc)) {
    const parsed = JSON.parse(readFileSync(rc, 'utf8')) as { projects?: { default?: string } }
    if (parsed.projects?.default) return parsed.projects.default
  }
  fail('No --project given and no default project in .firebaserc.')
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    if (i === -1) return undefined
    const v = argv[i + 1]
    if (!v || v.startsWith('--')) fail(`${flag} needs a value.`)
    return v
  }
  const known = new Set(['--year', '--project', '--only', '--apply', '--overwrite'])
  for (const a of argv) {
    if (a.startsWith('--') && !known.has(a)) fail(`Unknown option ${a}.`)
  }

  const yearRaw = value('--year')
  if (!yearRaw) fail('Usage: npm run events:create -- --year 2026 [--project <id>] [--only HALLOWEEN|CHRISTMAS] [--apply] [--overwrite]')
  const year = Number(yearRaw)
  if (!Number.isInteger(year) || year < 2024 || year > 2100) fail(`--year must be a year like 2026, got "${yearRaw}".`)

  const onlyRaw = value('--only')?.toUpperCase()
  if (onlyRaw && onlyRaw !== 'HALLOWEEN' && onlyRaw !== 'CHRISTMAS') fail('--only must be HALLOWEEN or CHRISTMAS.')

  return {
    year,
    project: value('--project') ?? defaultProject(),
    only: (onlyRaw as Season | undefined) ?? null,
    apply: argv.includes('--apply'),
    overwrite: argv.includes('--overwrite'),
  }
}

async function connect(project: string): Promise<{ db: Firestore | null; target: string }> {
  if (project.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  if (emulator) {
    try {
      await fetch(`http://${emulator}/`, { signal: AbortSignal.timeout(3000) })
    } catch {
      fail(`Can't reach the Firestore emulator at ${emulator}. Start it with: npm run emulators`)
    }
    const app: App = initializeApp({ projectId: project }, 'createEvents')
    return { db: getFirestore(app), target: `EMULATOR ${emulator} (project ${project})` }
  }

  const credential = applicationDefault()
  try {
    await credential.getAccessToken()
  } catch {
    console.warn(
      [
        '',
        `No Application Default Credentials found, so the script can't reach ${project}.`,
        'Sign in once with the Google Cloud CLI, using an account that has Firestore access:',
        '  gcloud auth application-default login',
        `  gcloud auth application-default set-quota-project ${project}`,
        'Or point GOOGLE_APPLICATION_CREDENTIALS at a service-account key file.',
        '',
      ].join('\n'),
    )
    return { db: null, target: `PROJECT ${project} (not connected)` }
  }
  const app: App = initializeApp({ projectId: project, credential }, 'createEvents')
  return { db: getFirestore(app), target: `PROJECT ${project}` }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const { db, target } = await connect(args.project)
  if (args.apply && !db) process.exit(1)

  console.log(`\n${args.apply ? 'APPLYING to' : 'DRY RUN against'} ${target}\n`)

  const seasons: Season[] = args.only ? [args.only] : ['HALLOWEEN', 'CHRISTMAS']
  if (seasons.includes('CHRISTMAS') && !args.only) {
    console.log(
      'Note: once CHRISTMAS_<year> exists the season switcher appears (SPEC §3). For the Halloween-only\n' +
        'launch, run with --only HALLOWEEN and create Christmas in Phase 4.\n',
    )
  }

  for (const season of seasons) {
    const id = eventIdOf(season, args.year)
    const doc = eventDoc(season, args.year)
    const ref = db?.collection('events').doc(id)
    const exists = ref ? (await ref.get()).exists : null
    const action =
      exists === null ? 'create-or-skip (unknown: not connected)'
      : !exists ? 'create'
      : args.overwrite ? 'overwrite'
      : 'skip (exists; use --overwrite to replace)'
    console.log(`events/${id}: ${action}`)
    console.log(printable(doc))
    if (args.apply && ref && (!exists || args.overwrite)) await ref.set(doc)
  }

  const configRef = db?.collection('config').doc('app')
  const current = configRef ? ((await configRef.get()).data() ?? {}) : null
  const missing: Partial<AppConfig> = {}
  for (const [k, v] of Object.entries(DEFAULT_APP_CONFIG)) {
    if (current === null || !(k in current)) (missing as Record<string, unknown>)[k] = v
  }
  const missingKeys = Object.keys(missing)
  console.log(
    `\nconfig/app: ${
      current === null ? 'merge defaults for missing fields (unknown: not connected)'
      : missingKeys.length ? `add missing fields ${missingKeys.join(', ')}`
      : 'nothing to add (all fields set)'
    }`,
  )
  if (missingKeys.length) console.log(missing)
  if (args.apply && configRef && missingKeys.length) await configRef.set(missing, { merge: true })

  console.log(args.apply ? '\nDone.\n' : '\nDry run only. Re-run with --apply to write.\n')
}

function isEntryPoint(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  return norm(resolve(entry)) === norm(fileURLToPath(import.meta.url))
}

if (isEntryPoint()) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
