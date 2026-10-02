// Add my display (SPEC F5) end to end against the emulators (Auth, Firestore,
// Storage, Functions): auth guard → sign in → location (mocked GPS) → photo →
// details → preview → submit → success → My display; the Explore home button
// then reads "My display". Address search on the location step (Photon,
// mocked). Plus the private-beta message for an account that isn't a tester.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FIRST_LOAD, MOUNT_MAUNGANUI, cardStatus, cards, loadAllPages, snap } from './helpers'
import {
  addDisplay,
  addTesters,
  completeGoogleSignIn,
  mockPhoton,
  searchAddress,
  strangerEmail,
  testerEmail,
  townKeyOf,
} from './phase2'

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
  await expect(cardStatus(page, mine)).toHaveText(/^Unverified · /)
  await expect(mine.locator('.sticker')).toHaveText('NEW')
  await snap(page, testInfo, 'submit-town-list')

  // The home button now leads to My display (Edit and Remove live there).
  await page.goto('/')
  const home = page.getByTestId('add-display')
  await expect(home).toContainText('My display', FIRST_LOAD)
  await expect(home).toHaveAttribute('data-mine', 'true')
  await expect(page.getByTestId('display-hint')).toHaveText('Live')
  const box = await home.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  await snap(page, testInfo, 'home-my-display')
  await home.click()
  await expect(page).toHaveURL(/\/me$/, FIRST_LOAD)
  await expect(page.getByTestId('my-pin')).toContainText(title, FIRST_LOAD)
})

test('address search sets the location (Photon mocked)', async ({ page }, testInfo) => {
  const queries = await mockPhoton(page)
  const email = testerEmail(testInfo, 'address')
  await addTesters(email)
  await page.goto('/submit')
  await expect(page).toHaveURL(/\/sign-in\?redirect=/, FIRST_LOAD)
  await completeGoogleSignIn(page, email)
  await expect(page).toHaveURL(/\/submit$/, FIRST_LOAD)
  await expect(page.getByRole('heading', { name: 'Where is your display?' })).toBeVisible(FIRST_LOAD)
  await expect(page.getByText('Address search: Photon / © OpenStreetMap contributors')).toBeVisible()
  // By role: Ionic's inner native button carries `disabled`.
  const next = page.getByRole('button', { name: 'Next: photo' })
  await expect(next).toBeDisabled()

  // Fewer than 3 characters: no request.
  await page.getByTestId('address-search').locator('input').fill('oc')
  await page.waitForTimeout(700)
  expect(queries).toEqual([])

  await searchAddress(page, 'ocean beach')
  const rows = page.getByTestId('address-results').locator('ion-item')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('12 Ocean Beach Road')
  await expect(rows.first()).toContainText('Mount Maunganui, Tauranga')
  expect(queries).toEqual(['ocean beach'])
  await snap(page, testInfo, 'location-address-results')

  await rows.first().click()
  await expect(page.getByTestId('location-set')).toBeVisible()
  await expect(page.getByTestId('address-results')).toHaveCount(0)
  await expect(page.getByTestId('rough-fix')).toHaveCount(0)
  await expect(page.getByTestId('address-search').locator('input')).toHaveValue(
    '12 Ocean Beach Road, Mount Maunganui, Tauranga',
  )
  await expect(next).toBeEnabled()
  await snap(page, testInfo, 'location-address-chosen')

  // No match: friendly copy; the chosen point stays, so Next stays enabled.
  await page.getByTestId('address-search').locator('input').fill('zzz nowhere')
  await expect(page.getByText('No addresses found for “zzz nowhere”', { exact: false })).toBeVisible(FIRST_LOAD)
  await expect(next).toBeEnabled()
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
