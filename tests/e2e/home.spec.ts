// Home header, the "Popular places" row, the Add my display button and the
// account menu (SPEC F1, F5, §5 beta, §7 "/").
import { expect, test, type Page } from '@playwright/test'
import { FIRST_LOAD, MOUNT_MAUNGANUI, openExplore, placeHeading, townChips } from './helpers'
import { signInDirect, strangerEmail } from './phase2'

function popularRow(page: Page) {
  return page.getByRole('navigation', { name: 'Popular places' })
}

test('header Sign in is a light (clear) button with a 44 px tap target', async ({ page }) => {
  await openExplore(page)
  const signIn = page.locator('ion-header ion-button', { hasText: 'Sign in' })
  await expect(signIn).toBeVisible()
  await expect(signIn).toHaveAttribute('fill', 'clear')
  const box = await signIn.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
})

test('popular row hides while town chips show; the search dropdown still lists popular places', async ({ page }) => {
  await openExplore(page)
  await expect(townChips(page).first()).toBeVisible()
  await expect(popularRow(page)).toHaveCount(0)

  await page.locator('ion-searchbar input').click()
  const dropdown = page.locator('.place-search ion-list')
  await expect(page.locator('.place-search').getByText('Popular places', { exact: true })).toBeVisible()
  await expect(dropdown.locator('ion-item').first()).toBeVisible()
})

test.describe('near me', () => {
  test.use({ geolocation: MOUNT_MAUNGANUI, permissions: ['geolocation'] })

  test('popular row shows when there are no town chips', async ({ page }) => {
    await openExplore(page)
    await page.locator('ion-button', { hasText: 'Near me' }).click()
    await expect(placeHeading(page)).toHaveText('Near you')
    await expect(page.getByRole('navigation', { name: 'Towns' })).toHaveCount(0)
    await expect(popularRow(page)).toBeVisible()
  })
})

test('Add my display sits on the List segment and sends signed-out users to sign in', async ({ page }) => {
  await openExplore(page)
  const fab = page.getByTestId('add-display')
  await expect(fab).toBeVisible()
  const box = await fab.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

  // Not on the map, where it would cover the locate button.
  await page.locator('ion-segment-button', { hasText: 'Map' }).click()
  await expect(fab).toHaveCount(0)
  await page.locator('ion-segment-button', { hasText: 'List' }).click()

  await page.getByTestId('add-display').click()
  await expect(page).toHaveURL(/\/sign-in\?redirect=(%2F|\/)submit$/, FIRST_LOAD)
})

test('signed in, the account menu has My display, Send feedback, About & privacy and Sign out', async ({
  page,
}, testInfo) => {
  await signInDirect(page, strangerEmail(testInfo, 'menu'))
  await openExplore(page)

  // Ionic moves aria-label from the ion-button host onto its inner button.
  await page.locator('ion-header').getByRole('button', { name: 'Account' }).click()
  const sheet = page.locator('ion-action-sheet')
  for (const label of ['My display', 'Send feedback', 'About & privacy', 'Sign out']) {
    await expect(sheet.getByRole('button', { name: label })).toBeVisible()
  }
  await sheet.getByRole('button', { name: 'My display' }).click()
  await expect(page).toHaveURL(/\/me$/, FIRST_LOAD)
})
