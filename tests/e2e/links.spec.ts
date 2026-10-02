// Share links (SPEC §7): /a/, /t/ and /p/ are redirect routes onto the single
// ExplorePage at /, never a second page or map.
import { expect, test, type Page } from '@playwright/test'
import { AREA_NAME, FIRST_LOAD, PIN_ID, PIN_TITLE, TOWN_KEY, TOWN_NAME, cards, openExplore, placeHeading, snap } from './helpers'

async function expectOneExplorePage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/^[^?]*\/(\?|$)/)
  await expect(page.locator('ion-router-outlet > .ion-page')).toHaveCount(1)
  await expect(page.locator('ion-segment-button', { hasText: 'Map' })).toHaveCount(1)
}

test('/a/tauranga lands on the explore page for the area', async ({ page }) => {
  await openExplore(page, '/a/tauranga')
  await expect(page).toHaveURL(/\/\?area=tauranga$/)
  await expect(placeHeading(page)).toHaveText(AREA_NAME)
  await expectOneExplorePage(page)
})

test('/t/<town> lands on the explore page for the town', async ({ page }) => {
  await openExplore(page, `/t/${TOWN_KEY}`)
  await expect(page).toHaveURL(new RegExp(`/\\?town=${TOWN_KEY}$`))
  await expect(placeHeading(page)).toHaveText(TOWN_NAME)
  // The context line is "<area> · <n> spooky houses".
  await expect(page.locator('ion-content header p')).toHaveText(new RegExp(`^${AREA_NAME} · `))
  await expectOneExplorePage(page)
})

test('/p/<pin> opens the explore page with the pin sheet', async ({ page }, testInfo) => {
  await page.goto(`/p/${PIN_ID}`)
  await expect(page).toHaveURL(new RegExp(`/\\?pin=${PIN_ID}$`))
  await expect(page.locator('ion-modal').getByRole('heading', { name: PIN_TITLE })).toBeVisible(FIRST_LOAD)
  await expect(cards(page).first()).toBeAttached()
  await expect(placeHeading(page)).toHaveText(AREA_NAME)
  await expectOneExplorePage(page)
  await snap(page, testInfo, 'deep-link-pin')
})

test('an unknown pin link shows a friendly message', async ({ page }) => {
  await page.goto('/p/nobody_HALLOWEEN_2026')
  await expect(page.locator('ion-modal').getByText("This display isn't available")).toBeVisible(FIRST_LOAD)
})

test('an unknown path shows the not-found page', async ({ page }, testInfo) => {
  await page.goto('/nope/nothing')
  await expect(page.getByText('Nothing here')).toBeVisible(FIRST_LOAD)
  await snap(page, testInfo, 'not-found')
})
