// Both maps must actually fill their space (not just exist). Regression for
// maplibre-gl.css's `.maplibregl-map { position: relative }` overriding
// Tailwind's absolute/inset-0 and leaving the map 0 px tall.
import { expect, test, type Page } from '@playwright/test'
import { FIRST_LOAD, MOUNT_MAUNGANUI, snap } from './helpers'
import { addTesters, completeGoogleSignIn, testerEmail } from './phase2'

test.use({ geolocation: MOUNT_MAUNGANUI, permissions: ['geolocation'] })

async function mapBox(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    const canvas = el?.querySelector('canvas')
    const r = el?.getBoundingClientRect()
    const c = canvas?.getBoundingClientRect()
    return { h: r?.height ?? 0, w: r?.width ?? 0, canvasH: c?.height ?? 0 }
  }, testId)
}

test('the add-display location map fills its box', async ({ page }, testInfo) => {
  const email = testerEmail(testInfo, 'mapvis')
  await addTesters(email)
  await page.goto('/submit')
  await expect(page).toHaveURL(/\/sign-in\?redirect=/, FIRST_LOAD)
  await completeGoogleSignIn(page, email)
  await expect(page).toHaveURL(/\/submit$/, FIRST_LOAD)
  await expect(page.getByTestId('location-map').locator('canvas')).toBeAttached(FIRST_LOAD)
  await expect.poll(async () => (await mapBox(page, 'location-map')).h, FIRST_LOAD).toBeGreaterThan(200)
  const box = await mapBox(page, 'location-map')
  expect(box.canvasH).toBeGreaterThan(200)
  // The loading overlay goes once the style has loaded (mapStatus 'ready').
  await expect(page.locator('[data-testid="location-map"] ~ .overlay')).toHaveCount(0, FIRST_LOAD)
  await page.waitForTimeout(2000) // let tiles paint for the screenshot
  await snap(page, testInfo, 'location-map')
})

test('the browse map fills the Map tab when signed in', async ({ page }, testInfo) => {
  await page.goto('/sign-in')
  await completeGoogleSignIn(page, testerEmail(testInfo, 'browsevis'))
  await page.goto('/')
  await page.locator('ion-segment-button', { hasText: 'Map' }).click()
  await expect(page.getByTestId('browse-map').locator('canvas')).toBeAttached(FIRST_LOAD)
  await expect.poll(async () => (await mapBox(page, 'browse-map')).h, FIRST_LOAD).toBeGreaterThan(300)
  const box = await mapBox(page, 'browse-map')
  expect(box.canvasH).toBeGreaterThan(300)
  await snap(page, testInfo, 'browse-map')
})

test.describe('on a small phone (iPhone SE size)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('the location step keeps "Next: photo" on screen', async ({ page }, testInfo) => {
    const email = testerEmail(testInfo, 'smallphone')
    await addTesters(email)
    await page.goto('/submit')
    await expect(page).toHaveURL(/\/sign-in\?redirect=/, FIRST_LOAD)
    await completeGoogleSignIn(page, email)
    await expect(page).toHaveURL(/\/submit$/, FIRST_LOAD)
    await expect(page.getByTestId('location-map').locator('canvas')).toBeAttached(FIRST_LOAD)
    await page.getByRole('button', { name: 'Use my current location' }).click()
    await expect(page.getByTestId('location-set')).toBeVisible(FIRST_LOAD)
    const next = page.locator('ion-button', { hasText: 'Next: photo' })
    await expect(next).toBeInViewport()
    await expect(next).toBeEnabled()
    await snap(page, testInfo, 'location-small-phone')
  })
})
