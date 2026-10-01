// SPEC §8 Phase 1 "Done when": the explore page, search, chips, verified-only
// and the pin sheet, signed out.
import { expect, test } from '@playwright/test'
import {
  AREA_NAME,
  TOWN_NAME,
  badgeOrder,
  cards,
  loadAllPages,
  openExplore,
  placeHeading,
  snap,
  townChips,
} from './helpers'

test('home opens on Tauranga & surrounds with seeded pins, verified first', async ({ page }, testInfo) => {
  await openExplore(page)
  await expect(placeHeading(page)).toHaveText(AREA_NAME)
  await expect(page.locator('html')).toHaveAttribute('data-season', 'HALLOWEEN')
  await snap(page, testInfo, 'home')

  await loadAllPages(page)
  const badges = await badgeOrder(page)
  // 46 ACTIVE seed pins in the area (Rotorua and HIDDEN/REMOVED ones excluded).
  expect(badges).toHaveLength(46)
  expect(badges[0]).toContain('Verified')
  const firstUnverified = badges.findIndex((b) => b.includes('Unverified'))
  expect(firstUnverified).toBeGreaterThan(0)
  expect(badges.slice(firstUnverified).every((b) => b.includes('Unverified'))).toBe(true)
  await expect(cards(page).filter({ hasText: 'Sulphur City Spooks' })).toHaveCount(0)
  await expect(cards(page).filter({ hasText: 'Totally Real Display' })).toHaveCount(0)
  await snap(page, testInfo, 'home-all-pages')
})

test('search "papamoa" finds Pāpāmoa and narrows the list', async ({ page }, testInfo) => {
  await openExplore(page)
  const areaCount = await cards(page).count()

  await page.locator('ion-searchbar input').fill('papamoa')
  const options = page.locator('ion-item.result')
  await expect(options.first()).toBeVisible()
  // Macron-insensitive: every Pāpāmoa place matches, the plain town among them.
  await expect(options.filter({ hasText: 'Pāpāmoa Beach' })).toHaveCount(1)
  const town = options.filter({ has: page.locator('span.font-medium', { hasText: /^Pāpāmoa$/ }) })
  await expect(town).toHaveCount(1)
  await snap(page, testInfo, 'search-papamoa')

  await town.click()
  await expect(page).toHaveURL(/\?town=papamoa-e8-nz$/)
  await expect(placeHeading(page)).toHaveText(TOWN_NAME)
  await expect(cards(page).first()).toBeVisible()
  const n = await cards(page).count()
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThan(areaCount)
  for (const town of await cards(page).locator('ion-label > p').allTextContents()) expect(town.trim()).toBe(TOWN_NAME)
  await snap(page, testInfo, 'town-papamoa')
})

test('town chips narrow the list and "All" restores it', async ({ page }, testInfo) => {
  await openExplore(page)
  const areaFirst = await cards(page).first().getAttribute('data-pin-id')
  const all = townChips(page).filter({ hasText: /^All$/ })
  await expect(all).toHaveAttribute('aria-pressed', 'true')

  const chip = townChips(page).filter({ hasText: /^Te Puke$/ })
  await chip.click()
  await expect(page).toHaveURL(/\?town=te-puke-e8-nz$/)
  await expect(placeHeading(page)).toHaveText('Te Puke')
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(all).toHaveAttribute('aria-pressed', 'false')
  await expect(cards(page)).toHaveCount(5)
  for (const town of await cards(page).locator('ion-label > p').allTextContents()) expect(town.trim()).toBe('Te Puke')
  await snap(page, testInfo, 'chip-te-puke')

  await all.click()
  await expect(page).toHaveURL(/\?area=tauranga$/)
  await expect(placeHeading(page)).toHaveText(AREA_NAME)
  await expect(cards(page)).toHaveCount(20)
  await expect(cards(page).first()).toHaveAttribute('data-pin-id', areaFirst ?? '')
})

test('Verified only hides unverified displays', async ({ page }, testInfo) => {
  await openExplore(page)
  await loadAllPages(page)
  const badges = await badgeOrder(page)
  const verified = badges.filter((b) => b.includes('Verified') && !b.includes('Unverified')).length
  expect(badges.length).toBeGreaterThan(verified)

  await page.getByRole('switch', { name: 'Verified only' }).click()
  await expect(cards(page)).toHaveCount(verified)
  await expect(cards(page).locator('ion-badge', { hasText: 'Unverified' })).toHaveCount(0)
  await snap(page, testInfo, 'verified-only')

  await page.getByRole('switch', { name: 'Verified only' }).click()
  await expect(cards(page)).toHaveCount(badges.length)
})

test('tapping a card opens the detail sheet; closing it clears ?pin', async ({ page }, testInfo) => {
  await openExplore(page)
  const card = cards(page).first()
  const id = await card.getAttribute('data-pin-id')
  const title = (await card.locator('h3').textContent())?.trim() ?? ''
  await card.click()

  await expect(page).toHaveURL(new RegExp(`[?&]pin=${id}`))
  const sheet = page.locator('ion-modal')
  await expect(sheet.getByRole('heading', { name: title })).toBeVisible()
  const photo = sheet.getByRole('img', { name: `Photo of ${title}` })
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await expect(sheet.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute('href', /google\.com\/maps/)
  await snap(page, testInfo, 'pin-sheet')

  await page.keyboard.press('Escape')
  await expect(sheet.getByRole('heading', { name: title })).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]pin=/)
  await expect(page).toHaveURL(/\?area=tauranga$|\/$/)
})
