// Shared bits for the Playwright suite. Seed data comes from scripts/seed.ts
// (deterministic), so the keys and ids below are stable.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export const AREA_NAME = 'Tauranga & surrounds'
/** Seeded town with ACTIVE pins (the plain "Pāpāmoa" GeoNames town). */
export const TOWN_KEY = 'papamoa-e8-nz'
export const TOWN_NAME = 'Pāpāmoa'
/** First seed spot, "The Haunted Villa" (ACTIVE). */
export const PIN_ID = 'seedUser00000000000001_HALLOWEEN_2026'
export const PIN_TITLE = 'The Haunted Villa'
/** Near the "Witches of Mauao" / "Ghosts of the Mount" seed spots. */
export const MOUNT_MAUNGANUI = { latitude: -37.6395, longitude: 176.1815 }

const SHOTS_DIR = join('tests', 'e2e', '__screenshots__')

/** Full-viewport screenshot for review: tests/e2e/__screenshots__/<project>/<name>.png */
export async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const dir = join(SHOTS_DIR, testInfo.project.name)
  mkdirSync(dir, { recursive: true })
  // Let Ionic transitions and lazy images settle.
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(dir, `${name}.png`) })
}

export function results(page: Page): Locator {
  return page.getByTestId('results')
}

export function cards(page: Page): Locator {
  return results(page).locator('[data-pin-id]')
}

export function townChips(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Towns' }).getByRole('button')
}

/** The explore page heading (place name). */
export function placeHeading(page: Page): Locator {
  return page.locator('ion-content header h1')
}

/** Longer wait for the first load of a page (dev server, cold browser). */
export const FIRST_LOAD = { timeout: 30_000 }

/** Opens a route and waits for the first page of results. */
export async function openExplore(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
}

/** Each card's status ("Verified · …" / "Unverified · …", the words behind its sticker), in list order. */
export async function badgeOrder(page: Page): Promise<string[]> {
  return cardStatus(page).allTextContents()
}

/** The screen-reader status line of each card (or of the cards in `scope`). */
export function cardStatus(page: Page, scope: Locator = cards(page)): Locator {
  return scope.getByTestId('card-status')
}

/** The town line of each card. */
export function cardTowns(page: Page): Locator {
  return cards(page).locator('.town')
}

/** Clicks "Load more" until every page of the current list is loaded. */
export async function loadAllPages(page: Page): Promise<void> {
  const more = page.locator('ion-button', { hasText: 'Load more' })
  for (let i = 0; i < 20 && (await more.count()) > 0; i++) {
    const before = await cards(page).count()
    await more.click()
    await expect.poll(() => cards(page).count()).toBeGreaterThan(before)
    await expect(page.locator('ion-button', { hasText: 'Loading…' })).toHaveCount(0)
  }
}

/**
 * Exactly one ExplorePage in the Ionic stack (a query-only history entry
 * must reuse it, CLAUDE.md rule 5) and at most one browse map.
 */
export async function expectSingleExplore(page: Page): Promise<void> {
  const explorePages = page
    .locator('ion-router-outlet > .ion-page')
    .filter({ has: page.locator('ion-segment[aria-label="View"]') })
  await expect(explorePages).toHaveCount(1)
  expect(await page.locator('.maplibregl-map').count()).toBeLessThanOrEqual(1)
}

/** The List | Map segment button that is selected ("list" or "map"). */
export async function selectedSegment(page: Page): Promise<string | null> {
  return page.locator('ion-segment[aria-label="View"]').evaluate((el) => (el as HTMLElement & { value?: string }).value ?? null)
}

/** The browse map's centre, via the dev-only test hook (useMap.ts). */
export async function browseMapCenter(page: Page): Promise<{ lat: number; lng: number } | null> {
  return page.evaluate(() => {
    const m = (window as unknown as { __porchlightMap?: { getCenter(): { lat: number; lng: number } } }).__porchlightMap
    const c = m?.getCenter()
    return c ? { lat: c.lat, lng: c.lng } : null
  })
}

/** Metres between two points (haversine). */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Pulls the open display sheet up to its top breakpoint, so the links and Report are on screen. */
export async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator('ion-modal').filter({ has: page.getByTestId('pin-counts') })
  type Sheet = HTMLElement & { setCurrentBreakpoint(b: number): Promise<void>; getCurrentBreakpoint(): Promise<number> }
  // A breakpoint set while the sheet is still sliding in is ignored: retry until it sticks.
  await expect
    .poll(async () => {
      await sheet.evaluate((m) => (m as Sheet).setCurrentBreakpoint(0.95))
      await page.waitForTimeout(300)
      return sheet.evaluate((m) => (m as Sheet).getCurrentBreakpoint())
    })
    .toBe(0.95)
  // Long descriptions push Report below the fold on small phones: scroll the sheet.
  await sheet
    .locator('ion-content')
    .evaluate((c) => (c as HTMLElement & { scrollToBottom(d?: number): Promise<void> }).scrollToBottom(0))
  await page.waitForTimeout(200)
}
