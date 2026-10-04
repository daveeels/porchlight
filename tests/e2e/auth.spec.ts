// Email link sign-in (SPEC F11) and the in-app browser guidance on /sign-in
// (SPEC F4). The Auth emulator doesn't send email: the link is read from its
// REST endpoint and opened in the page, like tapping it in the inbox.
import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test'
import { FIRST_LOAD, PIN_ID, snap } from './helpers'

// emulators:exec says where the Auth emulator is; 9099 is firebase.json's port.
const OOB_CODES = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/emulator/v1/projects/demo-porchlight/oobCodes`
const EMAIL_KEY = 'porchlight.emailForSignIn'

interface OobCode {
  email: string
  oobLink: string
  requestType: string
}

/** A fresh address per test, project and attempt (the emulator keeps users). */
function linkEmail(testInfo: TestInfo, tag: string): string {
  return `link+${testInfo.project.name}-${tag}-${testInfo.retry}-${Date.now()}@example.com`
}

async function signInLinks(request: APIRequestContext, email: string): Promise<string[]> {
  const res = await request.get(OOB_CODES)
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { oobCodes?: OobCode[] }
  return (body.oobCodes ?? [])
    .filter((c) => c.requestType === 'EMAIL_SIGNIN' && c.email.toLowerCase() === email.toLowerCase())
    .map((c) => c.oobLink)
}

/** Waits for the `n`th link sent to `email` (1-based) and returns it. */
async function nthSignInLink(request: APIRequestContext, email: string, n = 1): Promise<string> {
  await expect.poll(async () => (await signInLinks(request, email)).length).toBeGreaterThanOrEqual(n)
  return (await signInLinks(request, email))[n - 1]!
}

/** Fills the email field on /sign-in and asks for a link. */
async function requestLink(page: Page, email: string): Promise<void> {
  const input = page.getByTestId('email-input').locator('input')
  await expect(input).toBeVisible(FIRST_LOAD)
  await input.fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()
}

/** Every URL the page visits, to check the email address never appears in one. */
function recordUrls(page: Page): string[] {
  const urls: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) urls.push(frame.url())
  })
  return urls
}

function expectNoEmailIn(urls: string[], email: string): void {
  const local = email.split('@')[0]!
  for (const url of urls) {
    expect(decodeURIComponent(url)).not.toContain(email)
    expect(url).not.toContain(encodeURIComponent(local))
  }
}

test('email link: sign in on the same phone and return to the guarded page', async ({ page, request }, testInfo) => {
  const email = linkEmail(testInfo, 'same')
  const urls = recordUrls(page)

  await page.goto('/me')
  await expect(page).toHaveURL(/\/sign-in\?redirect=(%2F|\/)me$/, FIRST_LOAD)
  await expect(page.getByTestId('in-app-notice')).toHaveCount(0)
  await requestLink(page, email)

  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByText("Can't see it? Check your spam or junk folder.")).toBeVisible()
  const resend = page.getByRole('button', { name: /Resend in \d+ s/ })
  await expect(resend).toBeVisible()
  await expect(resend).toBeDisabled()
  expect(await page.evaluate((k) => localStorage.getItem(k), EMAIL_KEY)).toBe(email)
  await snap(page, testInfo, 'email-link-check-inbox')

  const link = await nthSignInLink(request, email)
  await page.goto(link)
  await expect(page).toHaveURL(/\/me$/, FIRST_LOAD)
  await expect(page.locator('ion-title', { hasText: 'My display' })).toBeVisible()
  expect(await page.evaluate((k) => localStorage.getItem(k), EMAIL_KEY)).toBeNull()
  expectNoEmailIn(urls, email)
})

test('email link: opened on another device asks for the email first', async ({ page, request }, testInfo) => {
  const email = linkEmail(testInfo, 'other')
  await page.goto('/sign-in')
  await requestLink(page, email)
  const link = await nthSignInLink(request, email)

  // Another phone or browser: nothing saved.
  await page.evaluate(() => localStorage.clear())
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible(FIRST_LOAD)
  const input = page.getByTestId('confirm-email-input').locator('input')
  await expect(input).toHaveValue('')
  await snap(page, testInfo, 'email-link-confirm-email')

  await input.fill(`someone-else-${email}`)
  await page.getByRole('button', { name: 'Finish signing in' }).click()
  await expect(page.getByText("That isn't the email address this link was sent to.", { exact: false })).toBeVisible()

  await input.fill(email)
  await page.getByRole('button', { name: 'Finish signing in' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/' && !url.search.includes('oobCode'), FIRST_LOAD)
})

test('email link: invalid and used links say so and offer a new link', async ({ browser, page, request }, testInfo) => {
  const email = linkEmail(testInfo, 'expired')
  await page.goto('/sign-in')
  await requestLink(page, email)
  const link = await nthSignInLink(request, email)

  // A made-up code (as good as an expired one to the server).
  await page.goto('/auth/complete?apiKey=demo-api-key&oobCode=not-a-real-code&mode=signIn&lang=en')
  await expect(page.getByRole('heading', { name: 'This link has expired or was already used' })).toBeVisible(
    FIRST_LOAD,
  )
  await expect(page.getByTestId('email-input').locator('input')).toHaveValue(email)
  await snap(page, testInfo, 'email-link-expired')

  // Use the real link once here, then open it again in another browser.
  await page.goto(link)
  await expect(page).toHaveURL((url) => url.pathname === '/' && !url.search.includes('oobCode'), FIRST_LOAD)

  const otherBrowser = await browser.newContext()
  try {
    const other = await otherBrowser.newPage()
    await other.goto(link)
    await expect(other.getByRole('heading', { name: 'Confirm your email' })).toBeVisible(FIRST_LOAD)
    await other.getByTestId('confirm-email-input').locator('input').fill(email)
    await other.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(other.getByRole('heading', { name: 'This link has expired or was already used' })).toBeVisible()

    await other.getByTestId('email-input').locator('input').fill(email)
    await other.getByRole('button', { name: 'Send a new link' }).click()
    await expect(other.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()
    // Used codes drop off the emulator's list; a new one appears.
    await expect
      .poll(async () => (await signInLinks(request, email)).filter((l) => l !== link).length)
      .toBeGreaterThan(0)
  } finally {
    await otherBrowser.close()
  }
})

test('/auth/complete without a link explains itself', async ({ page }) => {
  await page.goto('/auth/complete')
  await expect(page.getByRole('heading', { name: "This isn't a sign-in link" })).toBeVisible(FIRST_LOAD)
  await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible()
})

const FACEBOOK_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.43.105;FBBV/615364339;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5;FBRV/617791024]'
const FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/477.0.0.49.82;]'

/** ion-button takes href as a property (Vue sets it that way), not an attribute. */
async function hrefOf(button: Locator): Promise<string> {
  await expect(button).toBeVisible()
  return button.evaluate((el) => String((el as HTMLElement & { href?: string }).href ?? ''))
}

/** The email form comes first; Google sits behind the collapsed "Prefer Google?". */
async function expectEmailFirst(page: Page, heading: string): Promise<Locator> {
  await expect(page.getByTestId('in-app-heading')).toHaveText(heading, FIRST_LOAD)
  const email = page.getByRole('button', { name: 'Email me a sign-in link' })
  await expect(email).toBeVisible()
  const notice = page.getByTestId('in-app-notice')
  await expect(notice).toBeVisible()
  // Collapsed: Google and the open-in-browser steps show only once it's opened.
  await expect(notice).not.toHaveAttribute('open')
  const emailBox = await email.boundingBox()
  const noticeBox = await notice.boundingBox()
  expect(emailBox && noticeBox && emailBox.y < noticeBox.y).toBe(true)
  return notice
}

test.describe('in the Facebook app on iPhone', () => {
  test.use({ userAgent: FACEBOOK_IOS })

  test('email form first; "Prefer Google?" opens Safari with a picture guide', async ({ page }, testInfo) => {
    await page.goto('/sign-in?redirect=%2Fsubmit')
    const notice = await expectEmailFirst(page, "You're inside Facebook — sign in with your email below.")
    await snap(page, testInfo, 'sign-in-facebook-ios')

    await notice.getByText('Prefer Google? Open Porchlight in Safari').click()
    expect(await hrefOf(notice.locator('ion-button', { hasText: 'Open in Safari' }))).toMatch(
      /^x-safari-https:\/\/localhost:\d+\/sign-in\?redirect=%2Fsubmit$/,
    )
    await expect(notice.getByText('Open in browser', { exact: true })).toBeVisible()
    await expect(notice.locator('ion-button', { hasText: 'Open in Chrome' })).toHaveCount(0)
    await expect(notice.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await snap(page, testInfo, 'sign-in-facebook-ios-google')
  })

  test('"Open in Safari" keeps the display the user wanted to vote on', async ({ page }, testInfo) => {
    // The vote buttons are on screen at the sheet's first height (no dragging).
    await page.goto(`/?pin=${PIN_ID}`)
    const sheet = page.locator('ion-modal')
    await expect(sheet.getByTestId('sign-in-to-vote')).toBeVisible(FIRST_LOAD)
    await expect(sheet.getByTestId('vote-here')).toBeInViewport()
    await snap(page, testInfo, 'pin-sheet-facebook-ios')
    await sheet.getByTestId('sign-in-to-vote').click()
    await expect(page).toHaveURL(/\/sign-in$/)

    const notice = await expectEmailFirst(page, "You're inside Facebook — sign in with your email below.")
    await notice.getByText('Prefer Google? Open Porchlight in Safari').click()
    const href = await hrefOf(notice.locator('ion-button', { hasText: 'Open in Safari' }))
    expect(href).toMatch(/^x-safari-https:\/\/localhost:\d+\/sign-in\?redirect=/)
    expect(new URL(href.replace('x-safari-https', 'https')).searchParams.get('redirect')).toBe(`/?pin=${PIN_ID}`)
  })

  test('after sending the link, only "Check your inbox" shows', async ({ page, request }, testInfo) => {
    const email = linkEmail(testInfo, 'inapp')
    await page.goto('/sign-in')
    await requestLink(page, email)
    await expect(page.getByTestId('in-app-notice')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
    await nthSignInLink(request, email)
  })
})

test.describe('in the Facebook app on Android', () => {
  test.use({ userAgent: FACEBOOK_ANDROID })

  test('email form first; "Prefer Google?" offers "Open in Chrome"', async ({ page }, testInfo) => {
    await page.goto('/sign-in')
    const notice = await expectEmailFirst(page, "You're inside Facebook — sign in with your email below.")
    await notice.getByText('Prefer Google? Open Porchlight in Chrome').click()
    expect(await hrefOf(notice.locator('ion-button', { hasText: 'Open in Chrome' }))).toMatch(
      /^intent:\/\/localhost:\d+\/sign-in#Intent;scheme=https;package=com\.android\.chrome;end$/,
    )
    await expect(notice.locator('ion-button', { hasText: 'Open in Safari' })).toHaveCount(0)
    await snap(page, testInfo, 'sign-in-facebook-android')
  })
})

test('outside an in-app browser, "Check your inbox" hides the Google button', async ({ page }, testInfo) => {
  const email = linkEmail(testInfo, 'hide-google')
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible(FIRST_LOAD)
  await requestLink(page, email)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Use a different email' }).click()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})
