// Grants or revokes the `admin` custom claim (SPEC §6: admin actions are
// checked by the claim in moderatePin and the Firestore rules).
//
// Run:  npm run admin -- list
//       npm run admin -- grant you@gmail.com [--apply]
//       npm run admin -- revoke you@gmail.com [--apply]
//       ... --project porchlight-nz        (real project; default: the emulator)
//
// grant/revoke are a dry run unless --apply. Other custom claims are kept.
// The new claim reaches the person's ID token on their next sign-in or token
// refresh (up to an hour): ask them to sign out and back in. revoke also
// revokes their refresh tokens so the old admin token can't be refreshed.
// The default project is demo-porchlight on the Auth emulator
// (FIREBASE_AUTH_EMULATOR_HOST, else 127.0.0.1:9099). A real project needs
// Application Default Credentials:
//   gcloud auth application-default login
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth'

const DEFAULT_PROJECT = 'demo-porchlight'
const USAGE = 'Usage: npm run admin -- <list | grant <email> | revoke <email>> [--project <id>] [--apply]'

type Command = 'list' | 'grant' | 'revoke'

interface Args {
  command: Command
  email: string | null
  project: string
  apply: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
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
  if (command !== 'list' && command !== 'grant' && command !== 'revoke') fail(USAGE)
  if (command === 'list') {
    if (rest.length) fail(USAGE)
    return { command, email: null, project, apply }
  }
  if (rest.length !== 1) fail(`${command} needs exactly one email.\n${USAGE}`)
  const email = (rest[0] as string).trim().toLowerCase()
  if (!EMAIL_RE.test(email)) fail(`"${rest[0]}" doesn't look like an email address.`)
  return { command, email, project, apply }
}

async function connect(project: string): Promise<{ auth: Auth; target: string }> {
  if (project.startsWith('demo-') && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  }
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST
  if (emulator) {
    try {
      await fetch(`http://${emulator}/`, { signal: AbortSignal.timeout(3000) })
    } catch {
      fail(`Can't reach the Auth emulator at ${emulator}. Start it with: npm run emulators`)
    }
    const app = initializeApp({ projectId: project }, 'setAdmin')
    return { auth: getAuth(app), target: `EMULATOR ${emulator} (project ${project})` }
  }
  const credential = applicationDefault()
  try {
    await credential.getAccessToken()
  } catch {
    fail(
      [
        `No Application Default Credentials found, so the script can't reach ${project}.`,
        'Sign in once with the Google Cloud CLI, using an account that can manage Firebase Auth users:',
        '  gcloud auth application-default login',
        `  gcloud auth application-default set-quota-project ${project}`,
      ].join('\n'),
    )
  }
  const app = initializeApp({ projectId: project, credential }, 'setAdmin')
  return { auth: getAuth(app), target: `PROJECT ${project}` }
}

async function listAdmins(auth: Auth): Promise<UserRecord[]> {
  const admins: UserRecord[] = []
  let pageToken: string | undefined
  do {
    const page = await auth.listUsers(1000, pageToken)
    admins.push(...page.users.filter((u) => u.customClaims?.admin === true))
    pageToken = page.pageToken
  } while (pageToken)
  return admins
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const { auth, target } = await connect(args.project)

  if (args.command === 'list') {
    const admins = await listAdmins(auth)
    console.log(`\nAdmins on ${target}: ${admins.length}`)
    for (const u of admins) console.log(`  ${u.email ?? '(no email)'}  ${u.uid}${u.disabled ? '  (disabled)' : ''}`)
    console.log('')
    return
  }

  let user: UserRecord
  try {
    user = await auth.getUserByEmail(args.email as string)
  } catch {
    fail(`No account with the email ${args.email} on ${target}. They need to sign in to Porchlight once first.`)
  }
  const claims = { ...(user.customClaims ?? {}) }
  const isAdmin = claims.admin === true
  const grant = args.command === 'grant'

  console.log(`\n${args.apply ? 'APPLYING to' : 'DRY RUN against'} ${target}`)
  console.log(`${user.email} (${user.uid}) is ${isAdmin ? '' : 'not '}an admin.`)
  if (grant === isAdmin) {
    console.log('Nothing to change.\n')
    return
  }
  console.log(grant ? 'Grant: admin = true' : 'Revoke: remove the admin claim and revoke refresh tokens')
  if (!args.apply) {
    console.log('\nDry run only. Re-run with --apply to write.\n')
    return
  }
  if (grant) claims.admin = true
  else delete claims.admin
  await auth.setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null)
  if (!grant) await auth.revokeRefreshTokens(user.uid)
  console.log(
    grant
      ? '\nDone. Ask them to sign out and back in so their token picks up the claim.\n'
      : '\nDone. Their current token stays valid for up to an hour; refreshing it now fails.\n',
  )
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
