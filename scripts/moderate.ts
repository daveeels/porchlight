// Moderation from the command line until the admin UI (Phase 4). It runs the
// SAME logic as the moderatePin callable (applyModeration in
// functions/src/moderation/moderatePin.ts), so pins get moderation.* set and
// every action is appended to moderationActions. Never hand-edit pins.
//
// Run:  npm run moderate -- queue [--event HALLOWEEN_2026]
//       npm run moderate -- show <pinId>
//       npm run moderate -- approve <pinId> [--note "..."] [--apply]
//       npm run moderate -- remove  <pinId> [--note "..."] [--apply]
//       npm run moderate -- restore <pinId> [--note "..."] [--apply]
//       npm run moderate -- ban     <pinId> [--note "..."] [--apply]   (bans the pin's owner)
//       ... --by you@gmail.com     (recorded as the reviewer; must have the admin claim.
//                                   Default: "cli". moderation.reviewedBy is readable on
//                                   ACTIVE pins, so never put a name or email there.)
//       ... --project porchlight-nz [--bucket <name>]   (real project; default: the emulator)
//
// Actions are a dry run unless --apply. The default project is demo-porchlight
// on the emulators (Firestore 8080, Auth 9099, Storage 9199). A real project
// needs Application Default Credentials:
//   gcloud auth application-default login
import { applicationDefault } from 'firebase-admin/app'
import { auth, db } from '../functions/src/lib/admin.js'
import { reasonOf } from '../functions/src/lib/errors.js'
import { parseModeratePinInput, type ModerationAction } from '../functions/src/lib/validation.js'
import { applyModeration } from '../functions/src/moderation/moderatePin.js'
import type { PinDoc } from '../functions/src/pins/model.js'

const DEFAULT_PROJECT = 'demo-porchlight'
const USAGE = [
  'Usage: npm run moderate -- queue [--event <eventId>]',
  '       npm run moderate -- show <pinId>',
  '       npm run moderate -- <approve | remove | restore | ban> <pinId> [--note "..."] [--by <admin email>] [--apply]',
  '       ... [--project <id>] [--bucket <name>]',
].join('\n')

const ACTIONS: Record<string, ModerationAction> = {
  approve: 'APPROVE',
  remove: 'REMOVE',
  restore: 'RESTORE',
  ban: 'BAN_USER',
}

const EXPLAIN: Record<ModerationAction, string> = {
  APPROVE: 'HIDDEN → ACTIVE, decision APPROVED (votes/reports now need 8 to hide it again)',
  REMOVE: 'ACTIVE/HIDDEN → REMOVED by ADMIN, decision REJECTED, photos deleted (owner cannot re-add this season)',
  RESTORE: 'REMOVED by ADMIN → ACTIVE, decision APPROVED (photos deleted by REMOVE are NOT restored)',
  BAN_USER:
    "bans the OWNER: users/{uid}.banned, Auth account disabled + signed out, ALL their pins REMOVED by ADMIN with photos deleted",
}

interface Args {
  command: 'queue' | 'show' | ModerationAction
  pinId: string | null
  note: string | null
  by: string | null
  event: string | null
  project: string
  bucket: string | null
  apply: boolean
}

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  const opts: Omit<Args, 'command' | 'pinId'> = {
    note: null,
    by: null,
    event: null,
    project: DEFAULT_PROJECT,
    bucket: null,
    apply: false,
  }
  const value = (i: number, name: string): string => {
    const v = argv[i]
    if (v === undefined || v.startsWith('--')) fail(`${name} needs a value.`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a === '--apply') opts.apply = true
    else if (a === '--note') opts.note = value(++i, '--note')
    else if (a === '--by') opts.by = value(++i, '--by').trim().toLowerCase()
    else if (a === '--event') opts.event = value(++i, '--event')
    else if (a === '--project') opts.project = value(++i, '--project')
    else if (a === '--bucket') opts.bucket = value(++i, '--bucket')
    else if (a.startsWith('--')) fail(`Unknown option ${a}.\n${USAGE}`)
    else positional.push(a)
  }
  const [cmd, ...rest] = positional
  if (cmd === 'queue') {
    if (rest.length) fail(USAGE)
    return { command: 'queue', pinId: null, ...opts }
  }
  const command = cmd === 'show' ? 'show' : cmd ? ACTIONS[cmd] : undefined
  if (!command || rest.length !== 1) fail(USAGE)
  return { command, pinId: rest[0] as string, ...opts }
}

/** Points functions/src/lib/admin.ts (lazy) at the emulators or the real project. */
async function connect(args: Args): Promise<string> {
  const project = args.project
  const bucket = args.bucket ?? (project.startsWith('demo-') ? `${project}.appspot.com` : `${project}.firebasestorage.app`)
  process.env.GCLOUD_PROJECT = project
  process.env.GOOGLE_CLOUD_PROJECT = project
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: project, storageBucket: bucket })

  if (project.startsWith('demo-')) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199'
    process.env.STORAGE_EMULATOR_HOST ??= `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  if (emulator) {
    try {
      await fetch(`http://${emulator}/`, { signal: AbortSignal.timeout(3000) })
    } catch {
      fail(`Can't reach the Firestore emulator at ${emulator}. Start it with: npm run emulators`)
    }
    return `EMULATOR ${emulator} (project ${project})`
  }
  try {
    await applicationDefault().getAccessToken()
  } catch {
    fail(
      [
        `No Application Default Credentials found, so the script can't reach ${project}.`,
        'Sign in once with the Google Cloud CLI, using an account with Firestore, Storage and Auth access:',
        '  gcloud auth application-default login',
        `  gcloud auth application-default set-quota-project ${project}`,
      ].join('\n'),
    )
  }
  return `PROJECT ${project} (bucket ${bucket})`
}

function age(ts: { toMillis(): number } | null | undefined): string {
  if (!ts) return '?'
  const h = Math.round((Date.now() - ts.toMillis()) / 3_600_000)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

async function reportReasons(pinId: string): Promise<string> {
  const reports = await db().collection(`pins/${pinId}/reports`).get()
  if (reports.empty) return 'none'
  const tally = new Map<string, { all: number; counted: number }>()
  for (const r of reports.docs) {
    const reason = String(r.get('reason'))
    const t = tally.get(reason) ?? { all: 0, counted: 0 }
    t.all += 1
    if (r.get('counted') === true) t.counted += 1
    tally.set(reason, t)
  }
  return [...tally].map(([reason, t]) => `${reason} ×${t.all} (${t.counted} counted)`).join(', ')
}

async function describePin(pinId: string, pin: PinDoc): Promise<void> {
  console.log(`\n• ${pinId}`)
  console.log(`  "${pin.title}" — ${pin.place?.town ?? '?'}${pin.place?.area ? ` · ${pin.place.area}` : ''}`)
  console.log(
    `  status ${pin.status}${pin.hiddenReason ? ` (${pin.hiddenReason})` : ''}${pin.removedBy ? `, removedBy ${pin.removedBy}` : ''}` +
      ` · decision ${pin.moderation?.decision ?? 'NONE'}`,
  )
  console.log(
    `  here ${pin.hereVotes} · not there ${pin.notThereVotes} · reports ${pin.reportsCount} (counted)` +
      ` · round ${pin.voteRound} · created ${age(pin.createdAt)}`,
  )
  console.log(`  reports: ${await reportReasons(pinId)}`)
  if (pin.description) console.log(`  description: ${pin.description}`)
  console.log(`  photo: ${pin.photoUrl}`)
}

async function queue(event: string | null): Promise<void> {
  let hidden = db().collection('pins').where('status', '==', 'HIDDEN')
  if (event) hidden = hidden.where('eventId', '==', event)
  // Owner deleted a pin while it was hidden for reports: photos kept for review.
  let ownerRemoved = db()
    .collection('pins')
    .where('status', '==', 'REMOVED')
    .where('removedBy', '==', 'OWNER')
    .where('hiddenReason', '==', 'REPORTS')
  if (event) ownerRemoved = ownerRemoved.where('eventId', '==', event)

  const [h, o] = await Promise.all([hidden.get(), ownerRemoved.get()])
  console.log(`\nHIDDEN pins${event ? ` in ${event}` : ''}: ${h.size}`)
  for (const doc of h.docs) await describePin(doc.id, doc.data() as PinDoc)
  if (o.size) {
    console.log(`\nDeleted by the owner while reported (photos kept, decide REMOVE or leave): ${o.size}`)
    for (const doc of o.docs) await describePin(doc.id, doc.data() as PinDoc)
  }
  console.log(
    '\nNext: npm run moderate -- approve|remove|ban <pinId> --note "why" --apply\n' +
      '(NOT_THERE pins: check the photo/street before approving; REPORTS pins: check the report reasons.)\n',
  )
}

/**
 * The reviewer uid: --by must be an admin; otherwise a fixed CLI marker.
 * moderation.reviewedBy is public on ACTIVE pins, so no OS user name here.
 */
async function reviewer(by: string | null): Promise<string> {
  if (!by) return 'cli'
  try {
    const user = await auth().getUserByEmail(by)
    if (user.customClaims?.admin !== true) fail(`${by} doesn't have the admin claim (npm run admin -- grant ${by}).`)
    return user.uid
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') fail(`No account with the email ${by}.`)
    throw err
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const target = await connect(args)
  console.log(`\nConnected to ${target}`)

  if (args.command === 'queue') return queue(args.event)

  // Same input validation as the callable.
  const input = parseModeratePinInput({
    pinId: args.pinId,
    action: args.command === 'show' ? 'APPROVE' : args.command,
    note: args.note,
  })
  const snap = await db().doc(`pins/${input.pinId}`).get()
  if (!snap.exists) fail(`No pin ${input.pinId}.`)
  await describePin(input.pinId, snap.data() as PinDoc)
  if (args.command === 'show') return console.log('')

  const adminUid = await reviewer(args.by)
  console.log(`\n${args.apply ? 'APPLYING' : 'DRY RUN'}: ${input.action} as ${adminUid}${input.note ? ` — note "${input.note}"` : ''}`)
  console.log(`  ${EXPLAIN[input.action]}`)
  if (!args.apply) {
    console.log('\nDry run only. Re-run with --apply to do it.\n')
    return
  }
  const result = await applyModeration(input, adminUid)
  console.log(`\nDone. ${result.pinId} is now ${result.status}. Logged to moderationActions.\n`)
}

main().catch((err: unknown) => {
  const reason = reasonOf(err)
  if (reason) fail(`${reason}: ${(err as Error).message}`)
  console.error(err)
  process.exit(1)
})
