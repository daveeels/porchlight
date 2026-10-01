// Helpers for the add-display / My display specs: Auth emulator Google sign-in
// and the tester list. Each Playwright project (iphone, pixel) uses its own
// account, because the Auth emulator maps one email to one uid and a uid can
// only have one pin per event — parallel projects would fight over it.
import { expect, type Page, type TestInfo } from '@playwright/test'
import { initializeApp, getApps, type App } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { FIRST_LOAD } from './helpers'

/** Seeded by scripts/seed.ts into config/testers. */
export const SEED_TESTER_EMAIL = 'tester@example.com'

/** The tester account for this project, e.g. tester+pixel-submit@example.com. */
export function testerEmail(testInfo: TestInfo, tag: string): string {
  return `tester+${testInfo.project.name}-${tag}@example.com`
}

/** A signed-in account that isn't on the beta tester list. */
export function strangerEmail(testInfo: TestInfo, tag: string): string {
  return `stranger+${testInfo.project.name}-${tag}@example.com`
}

function adminApp(): App {
  // emulators:exec sets FIRESTORE_EMULATOR_HOST for this process.
  if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  return getApps()[0] ?? initializeApp({ projectId: 'demo-porchlight' })
}

/** Adds emails to config/testers (the seed only adds tester@example.com). */
export async function addTesters(...emails: string[]): Promise<void> {
  await getFirestore(adminApp())
    .doc('config/testers')
    .set({ emails: FieldValue.arrayUnion(...emails.map((e) => e.toLowerCase())) }, { merge: true })
}

/** The townKey the server gave the pin with this title (read with the Admin SDK). */
export async function townKeyOf(title: string): Promise<string> {
  const snap = await getFirestore(adminApp()).collection('pins').where('title', '==', title).limit(1).get()
  const townKey = snap.docs[0]?.get('place.townKey') as unknown
  if (typeof townKey !== 'string') throw new Error(`No pin titled ${title}`)
  return townKey
}

/**
 * Clicks "Continue with Google" on /sign-in (the page must already show it)
 * and completes the Auth emulator's fake Google popup with `email`.
 */
export async function completeGoogleSignIn(page: Page, email: string): Promise<void> {
  const button = page.getByRole('button', { name: 'Continue with Google' })
  await expect(button).toBeEnabled(FIRST_LOAD)
  const popupPromise = page.waitForEvent('popup')
  await button.click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')

  // With existing emulator accounts the widget lists them first.
  const emailInput = popup.locator('#email-input')
  const addAccount = popup.locator('#add-account-button')
  await expect(emailInput.or(addAccount).first()).toBeVisible()
  if (await addAccount.isVisible()) await addAccount.click()

  await emailInput.fill(email)
  await popup.locator('#display-name-input').fill('E2E Tester')
  const closed = popup.waitForEvent('close')
  await popup.locator('#sign-in').click()
  await closed
}

/** Signs in from /sign-in directly and waits until the app knows. */
export async function signInDirect(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in')
  await completeGoogleSignIn(page, email)
  // SignInPage leaves /sign-in once signed in.
  await expect(page).not.toHaveURL(/\/sign-in/, FIRST_LOAD)
}

/** Goes through the whole add-display flow from /submit; ends on the success screen. */
export async function addDisplay(page: Page, title: string, photoPath: string): Promise<void> {
  // Location: mocked geolocation (test.use({ geolocation, permissions })).
  await expect(page.getByRole('heading', { name: 'Where is your display?' })).toBeVisible(FIRST_LOAD)
  await expect(page.getByText('Your pin will be shown about 25–50 m from where you place it.', { exact: false })).toBeVisible()
  await page.locator('ion-button', { hasText: 'Use my current location' }).click()
  await expect(page.getByTestId('location-set')).toBeVisible()
  await page.locator('ion-button', { hasText: 'Next: photo' }).click()

  // Photo
  await expect(page.getByRole('heading', { name: 'Add a photo' })).toBeVisible()
  await page.getByTestId('photo-input').setInputFiles(photoPath)
  await expect(page.getByRole('img', { name: 'Your display photo' })).toBeVisible()
  await page.locator('ion-button', { hasText: 'Next: details' }).click()

  // Details
  await expect(page.getByRole('heading', { name: 'About your display' })).toBeVisible()
  await expect(page.getByText("Don't include your house number or car plates.")).toBeVisible()
  await page.getByTestId('title-input').locator('input').fill(title)
  await page.getByTestId('description-input').locator('textarea').fill('Pumpkins, fog and a talking skeleton. Best after 7pm.')
  await page.getByTestId('consent').click()
  await page.locator('ion-button', { hasText: 'Next: preview' }).click()

  // Preview → submit
  await expect(page.getByTestId('preview-card')).toContainText(title)
  await page.getByTestId('submit-pin').click()
}
