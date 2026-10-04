// Starts the local emulators for `npm run dev`: `npm run emulators`.
// A node wrapper (as scripts/e2e.mjs) so the env var and Java PATH work the
// same from Git Bash, PowerShell and cmd. Data is kept in .emulator-data.
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawn } from 'node:child_process'

// Loading functions/lib takes <1 s, but on a busy machine the emulator's
// default 10 s discovery timeout can pass, and then every callable 404s (the
// browser reports it as a CORS error). Seconds; firebase-tools reads it.
const env = {
  ...process.env,
  FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60',
}

// The emulators need Java 21: use JAVA_HOME, else the usual Windows install.
const javaDirs = [
  process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin'),
  'C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot/bin',
].filter((d) => d && existsSync(d))
const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
if (javaDirs.length) env[pathKey] = [...javaDirs, env[pathKey]].join(delimiter)

const child = spawn(
  'npx',
  [
    'firebase',
    'emulators:start',
    '--project',
    'demo-porchlight',
    '--import=.emulator-data',
    '--export-on-exit=.emulator-data',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env, shell: process.platform === 'win32' },
)
// Ctrl+C reaches the emulators directly (same console); wait for their export.
process.on('SIGINT', () => {})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
