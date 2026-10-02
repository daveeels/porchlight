// Signed-out map prompt and the sign-in page (SPEC F2, F4). MapLibre needs
// WebGL, which headless browsers may not have, so only the prompt is checked.
import { expect, test } from '@playwright/test'
import { FIRST_LOAD, openExplore, snap } from './helpers'
import { completeGoogleSignIn, testerEmail } from './phase2'

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

test('after signing out, the header shows the Sign in pill again', async ({ page }, testInfo) => {
  await page.goto('/sign-in')
  await completeGoogleSignIn(page, testerEmail(testInfo, 'signout'))
  await page.goto('/')
  const account = page.getByRole('button', { name: 'Account' })
  await expect(account).toBeVisible(FIRST_LOAD)
  await account.click()
  await page.locator('ion-action-sheet button', { hasText: 'Sign out' }).click()
  const signIn = page.locator('ion-header').getByText('Sign in', { exact: true })
  await expect(signIn).toBeVisible(FIRST_LOAD)
  // The pill must actually be readable: text present and a non-zero box.
  const box = await signIn.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(30)
  await snap(page, testInfo, 'header-after-signout')
})
