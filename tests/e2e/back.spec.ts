// The phone/browser Back button closes what's open instead of leaving
// Porchlight (SPEC §7 "Back"): a card opened from the list has one history
// entry (one Back closes it, still one ExplorePage); closing it another way
// removes that entry; a shared /p/ link closes onto the list; the report
// picker, the welcome cards and the add-display steps step back; the
// community rules gate ignores Back.
import { expect, test, type Page } from '@playwright/test'
import {
  AREA_NAME,
  FIRST_LOAD,
  MOUNT_MAUNGANUI,
  PIN_ID,
  PIN_TITLE,
  cards,
  expectSingleExplore,
  openExplore,
  placeHeading,
  raiseSheet,
  snap,
} from './helpers'
import {
  addTesters,
  agreeInRulesModal,
  completeGoogleSignIn,
  rulesModal,
  signInDirect,
  testerEmail,
} from './phase2'

function sheet(page: Page) {
  return page.locator('ion-modal').filter({ has: page.getByTestId('pin-counts') })
}

/** Opens the n-th card on the list; returns its id and title. */
async function openCard(page: Page, n = 0): Promise<{ id: string; title: string }> {
  const card = cards(page).nth(n)
  const id = (await card.getAttribute('data-pin-id')) ?? ''
  const title = ((await card.locator('.title').textContent()) ?? '').trim()
  await card.click()
  await expect(page).toHaveURL(new RegExp(`[?&]pin=${id}`))
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeVisible(FIRST_LOAD)
  return { id, title }
}

test('Back closes a card opened from the list and stays on the list', async ({ page }, testInfo) => {
  await openExplore(page)
  const { title } = await openCard(page, 1)
  await expectSingleExplore(page)

  await page.goBack()
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]pin=/)
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/(\?|$)/)
  await expect(cards(page).first()).toBeVisible()
  await expect(placeHeading(page)).toHaveText(AREA_NAME)
  await expectSingleExplore(page)
  await snap(page, testInfo, 'back-closed-card')

  // Forward reopens it (the entry is still there), Back closes it again.
  await page.goForward()
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeVisible()
  await page.goBack()
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeHidden()
  await expectSingleExplore(page)
})

test('closing a card with Escape removes its entry: one Back then leaves', async ({ page }) => {
  await openExplore(page)
  const { title } = await openCard(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]pin=/)

  // No stale ?pin entry left behind: the next Back is the one that leaves.
  await page.goBack()
  await expect(page).toHaveURL('about:blank')
})

test('closing a card by swiping it down removes its entry too', async ({ page }) => {
  await openExplore(page)
  const { title } = await openCard(page)
  // Let the sheet finish opening, then drag its handle to the bottom of the screen.
  await page.waitForTimeout(600)
  const handle = await sheet(page).locator('.modal-handle').boundingBox()
  expect(handle).not.toBeNull()
  const viewport = page.viewportSize()!
  const x = handle!.x + handle!.width / 2
  const startY = handle!.y + handle!.height / 2
  await page.mouse.move(x, startY)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(x, startY + ((viewport.height - startY) * i) / 12)
  await page.mouse.up()
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]pin=/)
  await page.goBack()
  await expect(page).toHaveURL('about:blank')
})

test('a shared /p/ link: Back closes the card onto the list, not out of Porchlight', async ({ page }, testInfo) => {
  await page.goto(`/p/${PIN_ID}`)
  await expect(page).toHaveURL(new RegExp(`/\\?pin=${PIN_ID}$`))
  await expect(page.locator('ion-modal').getByRole('heading', { name: PIN_TITLE })).toBeVisible(FIRST_LOAD)
  await expectSingleExplore(page)

  await page.goBack()
  await expect(page.locator('ion-modal').getByRole('heading', { name: PIN_TITLE })).toBeHidden()
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/)
  await expect(cards(page).first()).toBeVisible()
  await expect(placeHeading(page)).toHaveText(AREA_NAME)
  await expectSingleExplore(page)
  await snap(page, testInfo, 'back-deep-link-list')
})

test('Back closes the report reason picker and leaves the card open', async ({ page }, testInfo) => {
  await signInDirect(page, testerEmail(testInfo, 'backreport'))
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  const { id, title } = await openCard(page)
  await raiseSheet(page)
  await page.locator('ion-modal').getByTestId('report').click()
  const picker = page.locator('ion-action-sheet').filter({ hasText: 'Report this display' })
  await expect(picker).toBeVisible()

  await page.goBack()
  await expect(picker).toHaveCount(0)
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]pin=${id}`))

  // …and the next Back closes the card.
  await page.goBack()
  await expect(page.locator('ion-modal').getByRole('heading', { name: title })).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]pin=/)
  await expectSingleExplore(page)
})

test('Back closes the account menu', async ({ page }, testInfo) => {
  await signInDirect(page, testerEmail(testInfo, 'backmenu'))
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  await page.getByRole('button', { name: 'Account' }).click()
  const menu = page.locator('ion-action-sheet')
  await expect(menu.getByRole('button', { name: 'My display' })).toBeVisible()
  await page.goBack()
  await expect(menu).toHaveCount(0)
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\//)
  await expect(cards(page).first()).toBeVisible()

  // A menu choice still goes where it says, and Back from there returns to Explore.
  await page.getByRole('button', { name: 'Account' }).click()
  await page.locator('ion-action-sheet').getByRole('button', { name: 'About & privacy' }).click()
  await expect(page).toHaveURL(/\/about$/, FIRST_LOAD)
  await page.goBack()
  await expect(page).not.toHaveURL(/\/about/)
  await expect(cards(page).first()).toBeVisible()
  await expectSingleExplore(page)
})

test('Back closes the place search dropdown', async ({ page }) => {
  await openExplore(page)
  await page.locator('ion-searchbar input').click()
  await expect(page.getByText('Popular places').first()).toBeVisible()
  const dropdown = page.locator('.place-search ion-list')
  await expect(dropdown).toBeVisible()
  await page.goBack()
  await expect(dropdown).toHaveCount(0)
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\//)
  await expect(cards(page).first()).toBeVisible()
})

test('the community rules gate ignores Back and still works', async ({ page }, testInfo) => {
  await signInDirect(page, testerEmail(testInfo, `backrules${testInfo.retry}`), { rules: 'leave' })
  const modal = rulesModal(page)
  await expect(modal).toBeVisible(FIRST_LOAD)
  await expect(modal).toHaveAttribute('data-mode', 'agree')
  // Back is caught once the gate has finished opening (didPresent).
  await page.waitForTimeout(800)

  await page.goBack()
  await page.waitForTimeout(500)
  await expect(modal).toBeVisible()
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\//)
  await page.goBack()
  await page.waitForTimeout(500)
  await expect(modal).toBeVisible()

  // Not broken: agreeing still closes it.
  await agreeInRulesModal(page)
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
})

test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Back closes the welcome cards and stays in Porchlight', async ({ page }, testInfo) => {
    await openExplore(page)
    const welcome = page.getByTestId('welcome')
    await expect(welcome).toBeVisible(FIRST_LOAD)
    // Back is armed once the cards have finished sliding in (didPresent).
    await page.waitForTimeout(800)
    await page.goBack()
    await expect(page.locator('ion-modal.welcome-modal')).toHaveCount(0)
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\//)
    await expect(cards(page).first()).toBeVisible()
    // Back = Skip: remembered.
    expect(await page.evaluate(() => localStorage.getItem('porchlight.welcome.v1'))).toBe('seen')
    await snap(page, testInfo, 'back-closed-welcome')
  })
})

test.describe('add a display', () => {
  test.use({ geolocation: MOUNT_MAUNGANUI, permissions: ['geolocation'] })

  test('Back from the photo step returns to the location step with the location kept', async ({ page }, testInfo) => {
    const email = testerEmail(testInfo, 'backsubmit')
    await addTesters(email)
    await page.goto('/submit')
    await expect(page).toHaveURL(/\/sign-in\?redirect=/, FIRST_LOAD)
    await completeGoogleSignIn(page, email)
    await expect(page).toHaveURL(/\/submit$/, FIRST_LOAD)

    await expect(page.getByRole('heading', { name: 'Where is your display?' })).toBeVisible(FIRST_LOAD)
    await page.locator('ion-button', { hasText: 'Use my current location' }).click()
    await expect(page.getByTestId('location-set')).toBeVisible(FIRST_LOAD)
    await page.locator('ion-button', { hasText: 'Next: photo' }).click()
    await expect(page.getByRole('heading', { name: 'Add a photo' })).toBeVisible()

    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Where is your display?' })).toBeVisible()
    await expect(page.getByTestId('location-set')).toBeVisible()
    await expect(page).toHaveURL(/\/submit$/)
    await expect(page.getByRole('button', { name: 'Next: photo' })).toBeEnabled()
    await snap(page, testInfo, 'back-submit-location')

    // On the first step Back leaves the page, as before.
    await page.goBack()
    await expect(page).not.toHaveURL(/\/submit/)
  })
})
