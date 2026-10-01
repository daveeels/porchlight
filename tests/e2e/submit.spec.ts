// Add my display (SPEC F5) end to end against the emulators (Auth, Firestore,
// Storage, Functions): auth guard → sign in → location (mocked GPS) → photo →
// details → preview → submit → success → My display. Plus the private-beta
// message for an account that isn't a tester.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FIRST_LOAD, MOUNT_MAUNGANUI, cards, loadAllPages, snap } from './helpers'
import { addDisplay, addTesters, completeGoogleSignIn, strangerEmail, testerEmail, townKeyOf } from './phase2'

const PHOTO = join('tests', 'e2e', 'fixtures', 'house.jpg')

test.use({ geolocation: MOUNT_MAUNGANUI, permissions: ['geolocation'] })

test('signed out, /submit asks you to sign in first', async ({ page }) => {
  await page.goto('/submit')
  await expect(page).toHaveURL(/\/sign-in\?redirect=(%2F|\/)submit$/, FIRST_LOAD)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('a tester adds a display and sees it on My display', async ({ page }, testInfo) => {
  const email = testerEmail(testInfo, 'submit')
  await addTesters(email)
  const title = `E2E Spooky House ${testInfo.project.name}`

  // The guard sends us to sign in, then back to /submit.
  await page.goto('/submit')
  await expect(page).toHaveURL(/\/sign-in\?redirect=/, FIRST_LOAD)
  await completeGoogleSignIn(page, email)
  await expect(page).toHaveURL(/\/submit$/, FIRST_LOAD)

  await addDisplay(page, title, PHOTO)
  await expect(page.getByRole('heading', { name: 'Your display is live!' })).toBeVisible({ timeout: 45_000 })
  await snap(page, testInfo, 'submit-success')

  // Success → My display
  await page.locator('ion-button', { hasText: 'My display' }).click()
  await expect(page).toHaveURL(/\/me$/)
  const card = page.getByTestId('my-pin')
  await expect(card).toContainText(title, FIRST_LOAD)
  await expect(page.getByTestId('pin-status')).toHaveText('Live – Unverified')
  // The photo is the server's cleaned copy.
  await expect(card.locator('img')).toHaveAttribute('src', /full\.webp/)

  // Adding a second display this season is blocked with a link to My display.
  await page.goto('/submit')
  await expect(page.getByRole('heading', { name: 'You already have a display' })).toBeVisible(FIRST_LOAD)
  await expect(page.locator('ion-button', { hasText: 'Go to My display' })).toBeVisible()

  // The new display is listed in its town (from the offset point) as Unverified.
  const townKey = await townKeyOf(title)
  await page.goto(`/t/${townKey}`)
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  await loadAllPages(page)
  const mine = cards(page).filter({ hasText: title })
  await expect(mine).toHaveCount(1)
  await expect(mine.locator('ion-badge')).toHaveText('Unverified')
  await snap(page, testInfo, 'submit-town-list')
})

test('a signed-in non-tester gets the private beta message', async ({ page }, testInfo) => {
  await page.goto('/sign-in')
  await completeGoogleSignIn(page, strangerEmail(testInfo, 'submit'))
  await page.goto('/submit')

  await addDisplay(page, 'Not a tester display', PHOTO)
  const error = page.getByTestId('submit-error')
  await expect(error).toContainText('Porchlight is in private beta — posting opens soon.', { timeout: 45_000 })
  // A final error: submitting again can't help, so the button goes.
  await expect(page.getByTestId('submit-pin')).toHaveCount(0)
  await snap(page, testInfo, 'submit-beta-only')
})
