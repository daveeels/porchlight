// Production smoke test: build what we deploy, serve it, and open it in
// Chromium and WebKit. The E2E suite runs against the Vite dev server, which
// doesn't bundle, so bundling bugs (like the 2026-10-02 Rolldown chunk cycle
// that blanked the app) only show up in a real production build.
//
// Run before every hosting deploy:  npm run smoke:prod
// It reads public config from the real project (no writes).
import { spawn, execSync } from 'node:child_process'
import { chromium, webkit, devices } from '@playwright/test'

const PORT = 4179
const URL = `http://localhost:${PORT}/`

execSync('npm run build:beta', { stdio: 'inherit' })

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: true,
  stdio: 'ignore',
})

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview did not start')
}

let failed = false
try {
  await waitForServer()
  for (const [name, browserType, device] of [
    ['pixel', chromium, devices['Pixel 7']],
    ['iphone', webkit, devices['iPhone 13']],
  ]) {
    const browser = await browserType.launch()
    const page = await (await browser.newContext({ ...device })).newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    // The live beta must talk to the real project, never the emulator one
    // (2026-10-04: .env.local said demo-porchlight and that shipped).
    page.on('request', (r) => {
      if (r.url().includes('demo-porchlight')) errors.push(`request to the demo project: ${r.url().slice(0, 90)}`)
    })
    await page.goto(URL, { waitUntil: 'load', timeout: 60_000 })
    const header = page.locator('ion-header').getByText('Porchlight', { exact: false }).first()
    const ok = await header.isVisible({ timeout: 20_000 }).catch(() => false)
    await page.waitForTimeout(3000)
    // The signed-out header pill must be readable (2026-10-02: it rendered
    // cream-on-cream in production only).
    const pill = await page.evaluate(() => {
      const b = document.querySelector('ion-button.sign-in')
      const n = b?.shadowRoot?.querySelector('.button-native')
      if (!n) return 'missing'
      const cs = getComputedStyle(n)
      return cs.color === cs.backgroundColor ? `unreadable (${cs.color} on ${cs.backgroundColor})` : 'ok'
    })
    if (pill !== 'ok') errors.push(`Sign in pill ${pill}`)
    if (!ok || errors.length) {
      failed = true
      console.error(`✘ ${name}: header visible=${ok}; page errors: ${errors.join(' | ') || 'none'}`)
    } else {
      console.log(`✔ ${name}: app rendered, no page errors`)
    }
    await browser.close()
  }
} finally {
  preview.kill()
  if (process.platform === 'win32' && preview.pid) {
    try {
      execSync(`taskkill /pid ${preview.pid} /T /F`, { stdio: 'ignore' })
    } catch {}
  }
}

if (failed) {
  console.error('\nProduction smoke test FAILED — do not deploy.')
  process.exit(1)
}
console.log('\nProduction smoke test passed.')
