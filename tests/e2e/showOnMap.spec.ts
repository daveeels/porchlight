// "Show on map" from a display's card (SPEC F3): signed in, the card closes,
// the Map segment opens and the one browse map flies to the pin with a
// pulsing ring; Back returns to the list. Signed out it reads "Sign in to see
// it on the map" and signing in lands on the map at that house. /p/<id>?view=map
// opens straight on the map. (mapAccess OFF hides it: unit-tested, since
// flipping config/app would race the other specs.)
import { expect, test, type Page } from '@playwright/test'
import {
  FIRST_LOAD,
  cards,
  expectSingleExplore,
  metresBetween,
  openExplore,
  raiseSheet,
  selectedSegment,
  snap,
} from './helpers'
import { completeGoogleSignIn, pinLocation, signInDirect, testerEmail } from './phase2'

/** Opens the n-th card on the list; returns its id and title. */
async function openCard(page: Page, n = 0): Promise<{ id: string; title: string }> {
  const card = cards(page).nth(n)
  const id = (await card.getAttribute('data-pin-id')) ?? ''
  const title = ((await card.locator('.title').textContent()) ?? '').trim()
  await card.click()
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeVisible(FIRST_LOAD)
  return { id, title }
}

/** What the one browse map shows: distance from the pin, and the ring (layer, host mark, announcement). */
async function mapState(page: Page, pinId: string, pin: { lat: number; lng: number }) {
  const s = await page.evaluate((id) => {
    const m = (
      window as unknown as {
        __porchlightMap?: { getLayer(id: string): unknown; getCenter(): { lat: number; lng: number } }
      }
    ).__porchlightMap
    const host = document.querySelector('[data-testid="browse-map"]')
    const status = [...document.querySelectorAll('[role="status"]')].some((el) => /on the map$/.test(el.textContent ?? ''))
    const c = m?.getCenter()
    return {
      center: c ? { lat: c.lat, lng: c.lng } : null,
      layer: !!m?.getLayer('pl-highlight'),
      marked: host?.getAttribute('data-highlight') === id,
      status,
    }
  }, pinId)
  return { near: !!s.center && metresBetween(s.center, pin) < 50, layer: s.layer, marked: s.marked, status: s.status }
}

/** The map is showing, centred within ~50 m of the pin, with the ring on it (all at once). */
async function expectMapAtPin(page: Page, pinId: string): Promise<void> {
  const pin = await locate(pinId)
  // Checked first and together: the ring only shows for a few seconds.
  await expect
    .poll(() => mapState(page, pinId, pin), FIRST_LOAD)
    .toEqual({ near: true, layer: true, marked: true, status: true })
  await expect.poll(() => selectedSegment(page)).toBe('map')
  await expect(page.getByTestId('browse-map').locator('canvas')).toBeAttached()
}

const locations = new Map<string, { lat: number; lng: number }>()
/** The pin's location (Admin SDK), read once and before the ring starts. */
async function locate(pinId: string): Promise<{ lat: number; lng: number }> {
  const known = locations.get(pinId)
  if (known) return known
  const where = await pinLocation(pinId)
  locations.set(pinId, where)
  return where
}

test('signed in: "Show on map" flies the map to the house and Back returns to the list', async ({ page }, testInfo) => {
  await signInDirect(page, testerEmail(testInfo, 'showmap'))
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  const { id } = await openCard(page, 2)
  await locate(id)
  await raiseSheet(page)

  const action = page.locator('ion-modal').getByTestId('show-on-map')
  await expect(action).toHaveText('Show on map')
  const box = await action.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  await snap(page, testInfo, 'card-show-on-map')

  await action.click()
  await expect(page.locator('ion-modal').getByTestId('pin-counts')).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]view=map/)
  await expect(page).not.toHaveURL(/[?&]pin=/)
  await expectMapAtPin(page, id)
  // Straight away: the ring pulses for ~4 s.
  await snap(page, testInfo, 'map-highlight')
  await expectSingleExplore(page)

  // The pin is drawn there: tapping it opens its card as usual (on its own
  // entry: Back closes it, back onto the map).
  const host = (await page.getByTestId('browse-map').boundingBox())!
  const counts = page.locator('ion-modal').getByTestId('pin-counts')
  for (let i = 0; i < 10 && (await counts.count()) === 0; i++) {
    await page.mouse.click(host.x + host.width / 2, host.y + host.height / 2)
    await page.waitForTimeout(700)
  }
  await expect(counts).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]pin=${id}`))
  await page.goBack()
  await expect(counts).toHaveCount(0)
  await expect.poll(() => selectedSegment(page)).toBe('map')

  // Back from the map: the list, where we were.
  await page.goBack()
  await expect.poll(() => selectedSegment(page)).toBe('list')
  await expect(page).not.toHaveURL(/view=map/)
  await expect(cards(page).first()).toBeVisible()
  await expectSingleExplore(page)
})

test('signed out: "Sign in to see it on the map", then lands on the map at that house', async ({ page }, testInfo) => {
  await openExplore(page)
  const { id } = await openCard(page, 1)
  await locate(id)
  await raiseSheet(page)
  const action = page.locator('ion-modal').getByTestId('show-on-map')
  await expect(action).toHaveText('Sign in to see it on the map')
  await snap(page, testInfo, 'card-sign-in-for-map')
  await action.click()
  await expect(page).toHaveURL(/\/sign-in\?redirect=/, FIRST_LOAD)

  await completeGoogleSignIn(page, testerEmail(testInfo, 'showmapout'))
  await expect(page).toHaveURL(/\/\?view=map$/, FIRST_LOAD)
  await expectMapAtPin(page, id)
  await expectSingleExplore(page)

  await page.goBack()
  await expect.poll(() => selectedSegment(page)).toBe('list')
  await expect(cards(page).first()).toBeVisible()
})

test('/p/<id>?view=map opens straight on the map at that house', async ({ page }, testInfo) => {
  await signInDirect(page, testerEmail(testInfo, 'showmaplink'))
  await openExplore(page)
  const id = (await cards(page).nth(3).getAttribute('data-pin-id')) ?? ''
  await locate(id)
  await page.goto(`/p/${id}?view=map`)
  await expect(page).toHaveURL(/\/\?view=map$/, FIRST_LOAD)
  await expectMapAtPin(page, id)
  await expectSingleExplore(page)

  await page.goBack()
  await expect.poll(() => selectedSegment(page)).toBe('list')
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/)
})
