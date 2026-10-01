// Runs the Playwright suite (tests/e2e) against fresh Auth + Firestore
// emulators with seeded data: `npm run test:e2e [-- <playwright args>]`.
// A node wrapper rather than an inline npm script so the Java PATH handling
// and argument quoting work the same from Git Bash, PowerShell and cmd.
// It runs twice: outside, it starts `firebase emulators:exec`; inside (with
// --inner), it seeds and runs Playwright with the original arguments.
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawn } from 'node:child_process'

const ARGS_VAR = 'PORCHLIGHT_E2E_ARGS'

function run(cmd, args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
}

async function outer() {
  // The emulators need Java 21: use JAVA_HOME, else the usual Windows install.
  const javaDirs = [
    process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin'),
    'C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot/bin',
  ].filter((d) => d && existsSync(d))
  const env = { ...process.env, [ARGS_VAR]: JSON.stringify(process.argv.slice(2)) }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  if (javaDirs.length) env[pathKey] = [...javaDirs, env[pathKey]].join(delimiter)

  return run(
    'npx',
    ['firebase', 'emulators:exec', '--only', 'auth,firestore', '--project', 'demo-porchlight', '"node scripts/e2e.mjs --inner"'],
    env,
  )
}

async function inner() {
  const seeded = await run('npm', ['run', 'seed'])
  if (seeded !== 0) return seeded
  const args = JSON.parse(process.env[ARGS_VAR] ?? '[]')
  // Without a shell, so arguments with spaces (e.g. -g "town chips") survive.
  return new Promise((resolve) => {
    const cli = join('node_modules', '@playwright', 'test', 'cli.js')
    const child = spawn(process.execPath, [cli, 'test', ...args], { stdio: 'inherit' })
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
}

process.exit(await (process.argv[2] === '--inner' ? inner() : outer()))
