// 375 px layout check (CLAUDE.md UI conventions, SPEC §7 mobile rules): no
// horizontal page scroll and every visible tap target at least 44 x 44.
import { expect, test, type Page } from '@playwright/test'
import { FIRST_LOAD, PIN_ID, openExplore, snap } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

interface Offender {
  what: string
  width: number
  height: number
}

/**
 * Elements wider than the viewport (outside intentional sideways scrollers
 * like the chip rows), plus the scroll width of the page and of every
 * ion-content scroller.
 */
async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > vw) out.push(`html scrollWidth ${document.documentElement.scrollWidth}`)
    for (const c of document.querySelectorAll('ion-content')) {
      const el = await (c as HTMLElement & { getScrollElement(): Promise<HTMLElement> }).getScrollElement()
      if (el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1) {
        out.push(`ion-content scrollWidth ${el.scrollWidth} > ${el.clientWidth}`)
      }
    }
    const inScroller = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
      }
      return false
    }
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
        out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`)
      }
    }
    return out
  })
}

/** Visible tap targets (light DOM) smaller than 44 x 44. */
async function smallTargets(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const selector = [
      'ion-button',
      'ion-back-button',
      'ion-chip',
      'ion-segment-button',
      'ion-toggle',
      'ion-item[button]',
      'button',
      'a[href]',
      '[role="button"]',
    ].join(',')
    const out: Offender[] = []
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      // Only what's on screen and not inside a hidden page or closed overlay.
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
      if (el.closest('.ion-page-hidden, [aria-hidden="true"]')) continue
      // Known exception: a text link inside a sentence (WCAG 2.5.8 inline exception).
      if (el.tagName === 'A' && el.closest('p')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue
      if (r.width < 43.5 || r.height < 43.5) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
        out.push({ what: `${el.tagName.toLowerCase()} "${label}"`, width: Math.round(r.width), height: Math.round(r.height) })
      }
    }
    return out
  })
}

async function checkLayout(page: Page): Promise<void> {
  expect(await horizontalOverflow(page), 'horizontal overflow').toEqual([])
  expect(await smallTargets(page), 'tap targets under 44 x 44').toEqual([])
}

test('explore list at 375 px', async ({ page }, testInfo) => {
  await openExplore(page)
  await checkLayout(page)
  await snap(page, testInfo, '375-home')

  // Scroll to the bottom ("Load more") and check again.
  await page.locator('ion-content').evaluate((c: HTMLElement & { scrollToBottom(d?: number): Promise<void> }) =>
    c.scrollToBottom(0),
  )
  await checkLayout(page)
  await snap(page, testInfo, '375-home-bottom')
})

test('search results at 375 px', async ({ page }, testInfo) => {
  await openExplore(page)
  await page.locator('ion-searchbar input').fill('pa')
  await expect(page.locator('ion-item.result').first()).toBeVisible()
  await checkLayout(page)
  await snap(page, testInfo, '375-search')
})

test('town page at 375 px', async ({ page }, testInfo) => {
  await openExplore(page, '/t/te-puke-e8-nz')
  await checkLayout(page)
  await snap(page, testInfo, '375-town')
})

test('pin sheet at 375 px', async ({ page }, testInfo) => {
  await page.goto(`/p/${PIN_ID}`)
  const sheet = page.locator('ion-modal')
  await expect(sheet.getByRole('link', { name: 'Open in Maps' })).toBeVisible(FIRST_LOAD)
  await checkLayout(page)
  await snap(page, testInfo, '375-pin-sheet')
})

test('map prompt at 375 px', async ({ page }, testInfo) => {
  await openExplore(page)
  await page.locator('ion-segment-button', { hasText: 'Map' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to see the map' })).toBeVisible()
  await checkLayout(page)
  await snap(page, testInfo, '375-map-prompt')
})

test('sign-in page at 375 px', async ({ page }, testInfo) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible(FIRST_LOAD)
  await checkLayout(page)
  await snap(page, testInfo, '375-sign-in')
})
