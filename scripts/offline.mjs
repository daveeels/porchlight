// `npm run offline`: the whole app on this machine, no real data touched.
//   1. starts the Firebase emulators (offline demo-porchlight project; data
//      kept in .emulator-data between runs),
//   2. loads the demo Tauranga displays (npm run seed),
//   3. starts the app with `vite --mode offline` (.env.offline) and opens it.
// Ctrl+C stops everything (the emulators save their data first).
// Sign in with the emulator's fake Google picker: "Add new account", e.g.
// tester@example.com (already on the tester list).
import { spawn, execSync } from 'node:child_process'

const isWin = process.platform === 'win32'
const children = []

function run(cmd, args) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: isWin })
  children.push(child)
  return child
}

async function waitFor(url, label, seconds = 120) {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      await fetch(url)
      return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${label} did not start within ${seconds}s`)
}

function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null) continue
    if (isWin && c.pid) {
      try {
        execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: 'ignore' })
      } catch {}
    } else c.kill('SIGINT')
  }
}

const emulators = run('node', ['scripts/emulators.mjs'])
emulators.on('exit', () => {
  stopAll()
  process.exit(0)
})

try {
  console.log('\n[offline] Starting the Firebase emulators…')
  await waitFor('http://127.0.0.1:8080/', 'Firestore emulator')
  await waitFor('http://127.0.0.1:9099/', 'Auth emulator')
  console.log('\n[offline] Loading the demo Tauranga displays…')
  execSync('npm run seed', { stdio: 'inherit' })
  console.log('\n[offline] Starting the app (offline mode)…\n')
  run('npx', ['vite', '--mode', 'offline', '--open'])
} catch (e) {
  console.error(`\n[offline] ${e instanceof Error ? e.message : e}`)
  stopAll()
  process.exit(1)
}

process.on('SIGINT', () => {
  // The emulators get Ctrl+C from the shared console and export their data,
  // then exit, which stops the rest (see above).
})
