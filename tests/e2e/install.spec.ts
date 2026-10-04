// SPEC F10: the install prompt card on Explore, and the production build's
// installability basics (manifest, icons, service worker, /__/ denylist).
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cards, openExplore, snap } from './helpers'

const VISITS_KEY = 'porchlight.install.visits'
const PINS_KEY = 'porchlight.install.pinsOpened'
const DISMISSED_KEY = 'porchlight.install.dismissedAt'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBSN/iOS;FBSV/18.5]'

const installCard = (page: Page) => page.getByTestId('install-prompt')

/** Pretends an earlier visit happened (set once; reloads keep the app's own counts). */
async function seedPreviousVisits(page: Page, visits = 1): Promise<void> {
  await page.addInitScript(
    ([key, n]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, n)
      } catch {
        // storage blocked
      }
    },
    [VISITS_KEY, String(visits)] as const,
  )
}

/** Dispatches a fake Chrome `beforeinstallprompt`; prompt() calls are counted on window. */
async function fireInstallPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted'): Promise<void> {
  await page.evaluate((outcome) => {
    const w = window as unknown as { __installPromptCalls: number }
    w.__installPromptCalls = 0
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
    e.prompt = () => {
      w.__installPromptCalls++
      return Promise.resolve()
    }
    e.userChoice = Promise.resolve({ outcome, platform: 'web' })
    window.dispatchEvent(e)
  }, outcome)
}

const promptCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __installPromptCalls?: number }).__installPromptCalls ?? 0)

/** Lets a would-be card render before asserting it didn't. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600)
}

test.describe('Android/Chrome one-tap install', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'beforeinstallprompt is Chromium-only')

  test('never on the first visit; on the 2nd visit Install calls prompt()', async ({ page, context }, testInfo) => {
    await openExplore(page)
    await fireInstallPrompt(page)
    await settle(page)
    await expect(installCard(page)).toHaveCount(0)

    // A new tab is a new session, so it's the 2nd visit.
    const second = await context.newPage()
    await openExplore(second)
    await fireInstallPrompt(second)
    const card = installCard(second)
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-mode', 'native')
    await expect(card.getByRole('heading', { name: 'Add Porchlight to your home screen' })).toBeVisible()
    await snap(second, testInfo, 'install-native')

    await card.getByTestId('install-button').click()
    await expect.poll(() => promptCalls(second)).toBe(1)
    await expect(card).toHaveCount(0)
  })

  test('shows after the 3rd pin is opened in the first visit', async ({ page }) => {
    await openExplore(page)
    await fireInstallPrompt(page)

    for (let i = 0; i < 3; i++) {
      await expect(installCard(page)).toHaveCount(0)
      const card = cards(page).nth(i)
      const id = await card.getAttribute('data-pin-id')
      await card.click()
      await expect(page).toHaveURL(new RegExp(`[?&]pin=${id}`))
      await page.keyboard.press('Escape')
      await expect(page).not.toHaveURL(/[?&]pin=/)
    }

    expect(await page.evaluate((k) => localStorage.getItem(k), PINS_KEY)).toBe('3')
    await expect(installCard(page)).toBeVisible()
  })
})

test.describe('iPhone Safari guide', () => {
  test.use({ userAgent: IPHONE_SAFARI })

  test('shows Share → Add to Home Screen after real use', async ({ page }, testInfo) => {
    await seedPreviousVisits(page)
    await openExplore(page)
    const card = installCard(page)
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-mode', 'ios')
    // One compact row; "How?" shows the steps.
    await expect(card).not.toContainText('Tap Share')
    await snap(page, testInfo, 'install-ios-collapsed')
    await card.getByTestId('install-how').click()
    await expect(card).toContainText('Tap Share')
    await expect(card).toContainText('Add to Home Screen')
    await expect(card.getByTestId('install-button')).toHaveCount(0)
    await snap(page, testInfo, 'install-ios')
  })

  test('dismissed stays hidden, across reloads and new visits', async ({ page, context }) => {
    await seedPreviousVisits(page)
    await openExplore(page)
    await installCard(page).getByRole('button', { name: 'Dismiss' }).click()
    await expect(installCard(page)).toHaveCount(0)
    expect(await page.evaluate((k) => localStorage.getItem(k), DISMISSED_KEY)).toMatch(/^\d+$/)

    await page.reload()
    await openExplore(page)
    await settle(page)
    await expect(installCard(page)).toHaveCount(0)

    const later = await context.newPage()
    await openExplore(later)
    await settle(later)
    await expect(installCard(later)).toHaveCount(0)
  })
})

test.describe('in-app browser', () => {
  test.use({ userAgent: IPHONE_FACEBOOK })

  test('inside Facebook’s browser: open in Safari first', async ({ page }, testInfo) => {
    await seedPreviousVisits(page, 5)
    await openExplore(page)
    const card = installCard(page)
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-mode', 'in-app')
    await card.getByTestId('install-how').click()
    await expect(card).toContainText('Open Porchlight in Safari first')
    const open = card.getByTestId('install-open-browser')
    await expect(open).toBeVisible()
    const href = await open.evaluate((el) => String((el as HTMLElement & { href?: string }).href ?? ''))
    expect(href).toMatch(/^x-safari-https:\/\/localhost:\d+\//)
    await snap(page, testInfo, 'install-in-app')
  })
})

test.describe('already installed', () => {
  test('never shows in display-mode: standalone', async ({ page, browserName }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window)
      window.matchMedia = (q: string) => {
        if (!q.includes('display-mode: standalone')) return real(q)
        const noop = () => {}
        return {
          matches: true,
          media: q,
          onchange: null,
          addListener: noop,
          removeListener: noop,
          addEventListener: noop,
          removeEventListener: noop,
          dispatchEvent: () => false,
        } as unknown as MediaQueryList
      }
    })
    await seedPreviousVisits(page, 5)
    await openExplore(page)
    expect(await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)).toBe(true)
    if (browserName === 'chromium') await fireInstallPrompt(page)
    await settle(page)
    await expect(installCard(page)).toHaveCount(0)
  })
})

// --------------------------------------------------------------------------
// Production build: what Chrome's installability check needs. Built with the
// Vite API into node_modules/.tmp (not dist/) and served by `vite preview`.

test.describe('production build installability', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(({ browserName }) => browserName !== 'chromium', 'service worker checks run once, in Chromium')

  const PORT = 4179
  const ORIGIN = `http://localhost:${PORT}`
  const OUT_DIR = resolve('node_modules/.tmp/pwa-preview')
  let close: (() => Promise<void>) | null = null

  test.beforeAll(async ({ browserName }, testInfo) => {
    if (browserName !== 'chromium') return
    testInfo.setTimeout(300_000)
    mkdirSync(OUT_DIR, { recursive: true })
    // Same offline demo config as the dev-server suite (PORCHLIGHT_DEMO_BUILD
    // lets vite.config's production-project check allow this throwaway build).
    Object.assign(process.env, {
      PORCHLIGHT_DEMO_BUILD: '1',
      VITE_USE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-porchlight.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-porchlight',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-porchlight.appspot.com',
      VITE_FIREBASE_APP_ID: 'demo-app-id',
      VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: '',
    })
    const vite = await import('vite')
    await vite.build({ logLevel: 'error', build: { outDir: OUT_DIR, emptyOutDir: true } })
    const server = await vite.preview({
      logLevel: 'error',
      build: { outDir: OUT_DIR },
      preview: { port: PORT, strictPort: true, host: 'localhost' },
    })
    close = () => server.close()
  })

  test.afterAll(async () => {
    await close?.()
  })

  test('manifest is linked and complete, icons are served', async ({ page, request }) => {
    await page.goto(ORIGIN)
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()
    const res = await request.get(new URL(href!, ORIGIN).toString())
    expect(res.ok()).toBe(true)
    const manifest = (await res.json()) as {
      name: string
      short_name: string
      start_url: string
      scope: string
      display: string
      background_color: string
      theme_color: string
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
    }
    expect(manifest).toMatchObject({
      name: 'Porchlight',
      short_name: 'Porchlight',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#17120f',
      theme_color: '#17120f',
    })
    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? 'any'}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))

    const iconUrls = [
      ...manifest.icons.map((i) => i.src),
      (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'))!,
      (await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href'))!,
    ]
    for (const src of iconUrls) {
      const icon = await request.get(new URL(src, ORIGIN).toString())
      expect(icon.ok(), src).toBe(true)
      expect(icon.headers()['content-type'], src).toMatch(/^image\//)
    }

    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
      'content',
      'black-translucent',
    )
  })

  test('service worker registers, serves the shell and never answers /__/', async ({ page, request }) => {
    await page.goto(ORIGIN)
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toBe(`${ORIGIN}/`)

    const sw = await (await request.get(`${ORIGIN}/sw.js`)).text()
    expect(sw).toContain('denylist:[/^\\/__\\//]')
    expect(sw).not.toMatch(/maplibre-gl/) // shell only, no map library
    expect(sw).not.toMatch(/openfreemap|firestore\.googleapis/) // no runtime caching of tiles / Firestore

    // Once the worker controls the page, app routes come from the precached
    // shell; Firebase's /__/ routes always reach the server.
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    const appRoute = await page.goto(`${ORIGIN}/a/tauranga`)
    expect(appRoute?.fromServiceWorker()).toBe(true)
    const authRoute = await page.goto(`${ORIGIN}/__/auth/handler`)
    expect(authRoute?.fromServiceWorker()).toBe(false)
  })
})
