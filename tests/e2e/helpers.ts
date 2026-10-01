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

/** Text of each card's badge, in list order. */
export async function badgeOrder(page: Page): Promise<string[]> {
  return cards(page).locator('ion-badge').allTextContents()
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
