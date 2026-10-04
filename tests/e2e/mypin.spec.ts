// My display (SPEC F6): empty state → add → status → edit title → delete.
// Runs against the emulators like submit.spec.ts.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FIRST_LOAD, MOUNT_MAUNGANUI, snap } from './helpers'
import { addDisplay, addTesters, signInDirect, testerEmail } from './phase2'

const PHOTO = join('tests', 'e2e', 'fixtures', 'house.jpg')

test.use({ geolocation: MOUNT_MAUNGANUI, permissions: ['geolocation'] })
// Sign in + add + edit + delete is several server round trips; on a busy PC
// the default 60 s isn't enough, and a retry then trips over the first try's pin.
test.describe.configure({ timeout: 180_000 })

test('signed out, /me asks you to sign in first', async ({ page }) => {
  await page.goto('/me')
  await expect(page).toHaveURL(/\/sign-in\?redirect=(%2F|\/)me$/, FIRST_LOAD)
})

test('My display: add, edit the title, delete', async ({ page }, testInfo) => {
  const email = testerEmail(testInfo, 'mypin')
  await addTesters(email)
  await signInDirect(page, email)

  // No display yet.
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: "You haven't added a display this season" })).toBeVisible(FIRST_LOAD)
  await snap(page, testInfo, 'mypin-empty')
  await page.locator('ion-button', { hasText: 'Add my display' }).click()
  await expect(page).toHaveURL(/\/submit$/)

  const title = `E2E Lights ${testInfo.project.name}`
  await addDisplay(page, title, PHOTO)
  // The run's first photo upload: the emulator's cold sharp start can be slow.
  await expect(page.getByRole('heading', { name: 'Your display is live!' })).toBeVisible({ timeout: 90_000 })
  await page.locator('ion-button', { hasText: 'My display' }).click()

  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByTestId('my-pin')).toContainText(title, FIRST_LOAD)
  await expect(page.getByTestId('pin-status')).toHaveText('Live – Unverified')
  await snap(page, testInfo, 'mypin-live')

  // Edit the title (keep the photo; no location step).
  await page.locator('ion-button', { hasText: 'Edit' }).click()
  await expect(page).toHaveURL(/\/submit\?edit=1$/)
  await expect(page.getByRole('heading', { name: 'Photo', exact: true })).toBeVisible(FIRST_LOAD)
  await expect(page.getByRole('heading', { name: 'Where is your display?' })).toHaveCount(0)
  await page.locator('ion-button', { hasText: 'Next: details' }).click()
  const titleInput = page.getByTestId('title-input').locator('input')
  await expect(titleInput).toHaveValue(title)
  const newTitle = `${title} (edited)`
  await titleInput.fill(newTitle)
  await expect(page.getByTestId('consent')).toHaveCount(0)
  await page.locator('ion-button', { hasText: 'Next: preview' }).click()
  await page.getByTestId('submit-pin').click()
  await expect(page.getByRole('heading', { name: 'Changes saved' })).toBeVisible({ timeout: 45_000 })
  await page.locator('ion-button', { hasText: 'My display' }).click()

  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByTestId('my-pin')).toContainText(newTitle, FIRST_LOAD)
  await expect(page.getByTestId('pin-status')).toHaveText('Live – Unverified')

  // Delete, with a confirmation.
  await page.locator('ion-button', { hasText: 'Delete' }).click()
  const alert = page.locator('ion-alert')
  await expect(alert).toContainText('Delete your display?')
  await alert.locator('button', { hasText: 'Delete' }).click()
  await expect(page.getByTestId('pin-status')).toHaveText('Removed by you', FIRST_LOAD)
  await expect(page.locator('ion-button', { hasText: 'Add a new display' })).toBeVisible()
  await snap(page, testInfo, 'mypin-removed')
})

test('Coming soon: add without a photo, then "My lights are up!"', async ({ page }, testInfo) => {
  const email = testerEmail(testInfo, 'soon')
  await addTesters(email)
  await signInDirect(page, email)
  await page.goto('/submit')

  // Location
  await expect(page.getByRole('heading', { name: 'Where is your display?' })).toBeVisible(FIRST_LOAD)
  await page.locator('ion-button', { hasText: 'Use my current location' }).click()
  await expect(page.getByTestId('location-set')).toBeVisible()
  await page.locator('ion-button', { hasText: 'Next: photo' }).click()

  // Photo: "My decorations aren't up yet" makes it optional.
  await expect(page.getByRole('heading', { name: 'Add a photo' })).toBeVisible()
  await expect(page.locator('ion-button', { hasText: 'Next: details' })).toHaveAttribute('disabled', /.*/)
  await page.getByTestId('coming-soon-toggle').click()
  await page.locator('ion-button', { hasText: 'Skip the photo for now' }).click()

  // Details → preview
  await expect(page.getByRole('heading', { name: 'About your display' })).toBeVisible()
  const title = `E2E Soon ${testInfo.project.name}`
  await page.getByTestId('title-input').locator('input').fill(title)
  await page.getByTestId('consent').click()
  await page.locator('ion-button', { hasText: 'Next: preview' }).click()
  await expect(page.getByTestId('preview-card')).toContainText('Coming soon')
  await snap(page, testInfo, 'soon-preview')
  await page.getByTestId('submit-pin').click()
  await expect(page.getByRole('heading', { name: "You're on the list!" })).toBeVisible({ timeout: 45_000 })
  await page.locator('ion-button', { hasText: 'My display' }).click()

  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByTestId('pin-status')).toHaveText('Live – Coming soon', FIRST_LOAD)
  await expect(page.getByRole('img', { name: 'Decorations coming soon' })).toBeVisible()
  await snap(page, testInfo, 'soon-mypin')

  // My lights are up! → a decorated photo is required, then it's a ready display.
  await page.getByTestId('lights-up').click()
  await expect(page).toHaveURL(/\/submit\?edit=1&lightsUp=1$/)
  await expect(page.getByRole('heading', { name: 'Show off your decorations' })).toBeVisible(FIRST_LOAD)
  await expect(page.locator('ion-button', { hasText: 'Next: details' })).toHaveAttribute('disabled', /.*/)
  await page.getByTestId('photo-input').setInputFiles(PHOTO)
  await expect(page.getByRole('img', { name: 'Your display photo' })).toBeVisible()
  await page.locator('ion-button', { hasText: 'Next: details' }).click()
  await expect(page.getByRole('heading', { name: 'About your display' })).toBeVisible()
  await page.locator('ion-button', { hasText: 'Next: preview' }).click()
  await expect(page.getByTestId('preview-card')).toContainText('Unverified')
  await page.getByTestId('submit-pin').click()
  await expect(page.getByRole('heading', { name: 'Lights on!' })).toBeVisible({ timeout: 45_000 })
  await page.locator('ion-button', { hasText: 'My display' }).click()
  await expect(page.getByTestId('pin-status')).toHaveText('Live – Unverified', FIRST_LOAD)
  await expect(page.getByTestId('lights-up')).toHaveCount(0)
})
