// Helpers for the add-display / My display specs: Auth emulator Google sign-in
// and the tester list. Each Playwright project (iphone, pixel) uses its own
// account, because the Auth emulator maps one email to one uid and a uid can
// only have one pin per event — parallel projects would fight over it.
import { expect, type Page, type TestInfo } from '@playwright/test'
import { initializeApp, getApps, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { TERMS_VERSION } from '../../src/config/terms'
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
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
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

/** Whether the account with this email has agreed to the current community rules (Admin SDK). */
export async function hasAgreedToRules(email: string): Promise<boolean> {
  const app = adminApp()
  const user = await getAuth(app).getUserByEmail(email)
  const snap = await getFirestore(app).doc(`users/${user.uid}`).get()
  return snap.get('termsVersion') === TERMS_VERSION
}

/** The community rules modal's content (opens after a first sign-in). */
export function rulesModal(page: Page) {
  return page.getByTestId('terms-modal')
}

/** The rules ion-modal element itself; it's only in the DOM while open. */
export function rulesModalHost(page: Page) {
  return page.locator('ion-modal.terms-modal')
}

/**
 * The rules modal's "I agree" button. By role, so it resolves to Ionic's
 * inner native button, whose `disabled` Playwright can read (the ion-button
 * host only has aria-disabled, which toBeDisabled ignores without a role).
 */
export function rulesAgreeButton(page: Page) {
  return page.getByRole('button', { name: 'I agree' })
}

/** Ticks the box and taps "I agree" in the open rules modal, then waits for it to close. */
export async function agreeInRulesModal(page: Page): Promise<void> {
  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  await expect(rulesAgreeButton(page)).toBeDisabled()
  await page.getByTestId('terms-checkbox').click()
  await expect(rulesAgreeButton(page)).toBeEnabled()
  await rulesAgreeButton(page).click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)
}

/**
 * After signing in: an account that hasn't agreed to the community rules is
 * shown the rules modal — agree in it, like a real first sign-in. Accounts
 * that agreed before (the server says so) don't see it.
 */
export async function agreeToRulesIfAsked(page: Page, email: string): Promise<void> {
  if (await hasAgreedToRules(email)) return
  await agreeInRulesModal(page)
}

export interface SignInOptions {
  /** 'agree' (default): agree to the community rules if asked. 'leave': leave the modal for the test. */
  rules?: 'agree' | 'leave'
}

/**
 * Clicks "Continue with Google" on /sign-in (the page must already show it)
 * and completes the Auth emulator's fake Google popup with `email`. Then
 * agrees to the community rules if this account hasn't yet.
 */
export async function completeGoogleSignIn(page: Page, email: string, opts: SignInOptions = {}): Promise<void> {
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
  if ((opts.rules ?? 'agree') === 'agree') await agreeToRulesIfAsked(page, email)
}

/** Signs in from /sign-in directly and waits until the app knows. */
export async function signInDirect(page: Page, email: string, opts: SignInOptions = {}): Promise<void> {
  await page.goto('/sign-in')
  await completeGoogleSignIn(page, email, opts)
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

/** Mount Maunganui addresses, as Photon's GeoJSON would return them. */
export const PHOTON_OCEAN_BEACH = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [176.1822, -37.6412] },
      properties: {
        osm_type: 'N',
        osm_id: 9000001,
        housenumber: '12',
        street: 'Ocean Beach Road',
        district: 'Mount Maunganui',
        city: 'Tauranga',
        state: 'Bay of Plenty',
        country: 'New Zealand / Aotearoa',
        countrycode: 'NZ',
        type: 'house',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [176.2012, -37.6555] },
      properties: {
        osm_type: 'W',
        osm_id: 9000002,
        name: 'Ocean Beach Road',
        district: 'Omanu',
        city: 'Tauranga',
        countrycode: 'NZ',
        type: 'street',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [176.1898, -37.6461] },
      properties: {
        osm_type: 'N',
        osm_id: 9000003,
        name: 'Mount Maunganui Primary School',
        housenumber: '42',
        street: 'Ocean Beach Road',
        district: 'Mount Maunganui',
        city: 'Tauranga',
        countrycode: 'NZ',
        type: 'house',
      },
    },
  ],
}

/**
 * Answers Photon address searches from the fixture above (the tests never
 * hit the real API) and records each query sent.
 */
export async function mockPhoton(page: Page): Promise<string[]> {
  const queries: string[] = []
  await page.route(/^https:\/\/photon\.komoot\.io\//, async (route) => {
    const url = new URL(route.request().url())
    queries.push(url.searchParams.get('q') ?? '')
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const body = q.includes('ocean beach') ? PHOTON_OCEAN_BEACH : { type: 'FeatureCollection', features: [] }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    })
  })
  return queries
}

/** Types into the location step's address search and waits for the results list. */
export async function searchAddress(page: Page, query: string): Promise<void> {
  await page.getByTestId('address-search').locator('input').fill(query)
  await expect(page.getByTestId('address-results')).toBeVisible(FIRST_LOAD)
}
