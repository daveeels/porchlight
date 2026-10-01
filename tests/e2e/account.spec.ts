// Signed-out map prompt and the sign-in page (SPEC F2, F4). MapLibre needs
// WebGL, which headless browsers may not have, so only the prompt is checked.
import { expect, test } from '@playwright/test'
import { FIRST_LOAD, openExplore, snap } from './helpers'

test('Map tab signed out shows the sign-in prompt', async ({ page }, testInfo) => {
  await openExplore(page)
  await page.locator('ion-segment-button', { hasText: 'Map' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to see the map' })).toBeVisible()
  await expect(page.locator('.maplibregl-map')).toHaveCount(0)
  await snap(page, testInfo, 'map-signed-out')

  await page.locator('ion-segment-button', { hasText: 'List' }).click()
  await expect(page.getByTestId('results')).toBeVisible()
})

test('the map prompt leads to the sign-in page', async ({ page }) => {
  await openExplore(page)
  await page.locator('ion-segment-button', { hasText: 'Map' }).click()
  await page.locator('.map-segment ion-button', { hasText: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('sign-in page shows "Continue with Google"', async ({ page }, testInfo) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Join Porchlight' })).toBeVisible(FIRST_LOAD)
  const google = page.getByRole('button', { name: 'Continue with Google' })
  await expect(google).toBeVisible()
  await expect(google).toBeEnabled()
  await snap(page, testInfo, 'sign-in')
})
