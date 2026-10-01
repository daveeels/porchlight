// Manages config/testers.emails — the Google accounts allowed to write while
// config/app.launchMode is 'BETA' (SPEC §5 "Beta mode").
//
// Run:  npm run testers -- list
//       npm run testers -- add a@b.com c@d.com [--apply]
//       npm run testers -- remove a@b.com [--apply]
//       ... --project porchlight-nz        (real project; default: the emulator)
//
// add/remove are a dry run unless --apply. Emails are stored lowercased.
// The default project is demo-porchlight on the Firestore emulator
// (FIRESTORE_EMULATOR_HOST, else 127.0.0.1:8080). A real project needs
// Application Default Credentials:
//   gcloud auth application-default login
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'

const DEFAULT_PROJECT = 'demo-porchlight'
const USAGE =
  'Usage: npm run testers -- <list | add <email...> | remove <email...>> [--project <id>] [--apply]'

type Command = 'list' | 'add' | 'remove'

interface Args {
  command: Command
  emails: string[]
  project: string
  apply: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) fail(`"${raw}" doesn't look like an email address.`)
  return email
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  let project = DEFAULT_PROJECT
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a === '--apply') apply = true
    else if (a === '--project') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) fail('--project needs a value.')
      project = v
    } else if (a.startsWith('--')) fail(`Unknown option ${a}.\n${USAGE}`)
    else positional.push(a)
  }
  const [command, ...rest] = positional
  if (command !== 'list' && command !== 'add' && command !== 'remove') fail(USAGE)
  if (command === 'list' && rest.length) fail(USAGE)
  if (command !== 'list' && rest.length === 0) fail(`${command} needs at least one email.\n${USAGE}`)
  return { command, emails: [...new Set(rest.map(normalizeEmail))], project, apply }
}

async function connect(project: string): Promise<{ db: Firestore; target: string }> {
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
    const app = initializeApp({ projectId: project }, 'setTesters')
    return { db: getFirestore(app), target: `EMULATOR ${emulator} (project ${project})` }
  }
  const credential = applicationDefault()
  try {
    await credential.getAccessToken()
  } catch {
    fail(
      [
        `No Application Default Credentials found, so the script can't reach ${project}.`,
        'Sign in once with the Google Cloud CLI, using an account that has Firestore access:',
        '  gcloud auth application-default login',
        `  gcloud auth application-default set-quota-project ${project}`,
      ].join('\n'),
    )
  }
  const app = initializeApp({ projectId: project, credential }, 'setTesters')
  return { db: getFirestore(app), target: `PROJECT ${project}` }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const { db, target } = await connect(args.project)
  const ref = db.doc('config/testers')
  const current = ((await ref.get()).get('emails') as unknown) ?? []
  const emails = Array.isArray(current) ? current.filter((e): e is string => typeof e === 'string') : []

  if (args.command === 'list') {
    console.log(`\nconfig/testers on ${target}: ${emails.length} email(s)`)
    for (const e of [...emails].sort()) console.log(`  ${e}`)
    console.log('')
    return
  }

  const has = new Set(emails)
  const changes =
    args.command === 'add' ? args.emails.filter((e) => !has.has(e)) : args.emails.filter((e) => has.has(e))
  const skipped = args.emails.filter((e) => !changes.includes(e))

  console.log(`\n${args.apply ? 'APPLYING to' : 'DRY RUN against'} ${target}`)
  console.log(`${args.command === 'add' ? 'Add' : 'Remove'}: ${changes.length ? changes.join(', ') : '(nothing)'}`)
  if (skipped.length) {
    console.log(`Skip (${args.command === 'add' ? 'already a tester' : 'not a tester'}): ${skipped.join(', ')}`)
  }
  if (!args.apply) {
    console.log('\nDry run only. Re-run with --apply to write.\n')
    return
  }
  if (changes.length) {
    const op = args.command === 'add' ? FieldValue.arrayUnion(...changes) : FieldValue.arrayRemove(...changes)
    await ref.set({ emails: op }, { merge: true })
  }
  console.log('\nDone.\n')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
