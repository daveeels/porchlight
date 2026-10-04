// First-run welcome (SPEC F14), "storybook cards". These tests start with
// empty storage (every other spec starts with the welcome already seen; see
// WELCOME_SEEN in playwright.config.ts). Cards 1–3 show once on a first
// visit to Explore; deep links don't get them; card 4 follows a first
// sign-in and leads into the community rules; the account menu and About
// reopen the cards without opening the rules.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { FIRST_LOAD, cards, openExplore, snap } from './helpers'
import { rulesAgreeButton, rulesModal, rulesModalHost, signInDirect, testerEmail } from './phase2'

test.use({ storageState: { cookies: [], origins: [] } })

const SEEN_KEY = 'porchlight.welcome.v1'
const MEMBER_SEEN_KEY = 'porchlight.welcome.member.v1'

function welcome(page: Page): Locator {
  return page.getByTestId('welcome')
}

/** The welcome's ion-modal; only in the DOM while open. */
function welcomeHost(page: Page): Locator {
  return page.locator('ion-modal.welcome-modal')
}

function nextButton(page: Page): Locator {
  return page.getByTestId('welcome-next')
}

function dots(page: Page): Locator {
  return page.getByTestId('welcome-dots').locator('i')
}

async function expectCard(page: Page, step: string, title: string): Promise<void> {
  await expect(welcome(page)).toHaveAttribute('data-step', step)
  await expect(welcome(page).getByRole('heading', { name: title })).toBeVisible()
}

/** Skip and the big button are real tap targets, and the button is on screen. */
async function expectTapTargets(page: Page): Promise<void> {
  // Measure once the slide between cards has finished.
  await expect(welcome(page).locator('[class*="-enter-active"], [class*="-leave-active"]')).toHaveCount(0)
  const viewport = page.viewportSize()
  // Retried: right after it opens, the modal may still be sliding up from
  // below the screen (slow under parallel load), so a first measure can be low.
  await expect(async () => {
    for (const target of [page.getByTestId('welcome-skip'), nextButton(page)]) {
      const box = await target.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
    }
  }).toPass({ timeout: 5_000 })
  // No sideways scroll inside the cards.
  const overflow = await welcome(page).evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

async function storageValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key)
}

test("first visit: cards 1–3, then \"Let's go\"; a reload doesn't show them again", async ({ page }, testInfo) => {
  await openExplore(page)
  await expect(welcome(page)).toBeVisible(FIRST_LOAD)
  await expect(welcomeHost(page)).toHaveAttribute('aria-labelledby', 'welcome-title')

  await expectCard(page, 'find', 'Find the houses worth the drive')
  await expect(page.getByTestId('welcome-text')).toHaveText(
    'Porchlight shows the best Halloween displays around Tauranga, shared by the people who made them.',
  )
  await expect(welcome(page).getByRole('heading', { name: 'Find the houses worth the drive' })).toBeFocused()
  await expect(dots(page)).toHaveCount(3)
  await expect(page.getByTestId('welcome-dots')).toHaveAttribute('aria-label', 'Step 1 of 3')
  await expect(nextButton(page)).toHaveText('Next')
  await expectTapTargets(page)
  await snap(page, testInfo, 'welcome-1')

  await nextButton(page).click()
  await expectCard(page, 'search', 'Search your suburb, or tap Near me')
  await expect(page.getByTestId('welcome-text')).toHaveText(
    "Glowing houses are verified: neighbours have checked they're really there.",
  )
  await expect(welcome(page).getByText('✓ 15')).toBeVisible()
  await expect(page.getByTestId('welcome-dots')).toHaveAttribute('aria-label', 'Step 2 of 3')
  await snap(page, testInfo, 'welcome-2')

  await nextButton(page).click()
  await expectCard(page, 'vote', 'Seen one? Tell everyone')
  await expect(page.getByTestId('welcome-text')).toHaveText(
    'Tap "It\'s here" after you visit. Three votes and a display gets the ✓ Verified sticker.',
  )
  await expect(nextButton(page)).toHaveText("Let's go")
  await expectTapTargets(page)
  await snap(page, testInfo, 'welcome-3')

  await nextButton(page).click()
  await expect(welcomeHost(page)).toHaveCount(0, FIRST_LOAD)
  await expect(cards(page).first()).toBeVisible()
  expect(await storageValue(page, SEEN_KEY)).toBe('seen')
  // A signed-out visit never shows card 4 and never marks it.
  expect(await storageValue(page, MEMBER_SEEN_KEY)).toBeNull()

  await page.reload()
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  await page.waitForTimeout(1500)
  await expect(welcomeHost(page)).toHaveCount(0)
})

test('Skip closes the cards and is remembered', async ({ page }) => {
  await openExplore(page)
  await expect(welcome(page)).toBeVisible(FIRST_LOAD)
  await nextButton(page).click()
  await expectCard(page, 'search', 'Search your suburb, or tap Near me')
  await page.getByTestId('welcome-skip').click()
  await expect(welcomeHost(page)).toHaveCount(0, FIRST_LOAD)
  expect(await storageValue(page, SEEN_KEY)).toBe('seen')

  await page.goto('/a/tauranga')
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  await page.waitForTimeout(1500)
  await expect(welcomeHost(page)).toHaveCount(0)
})

test.describe('on a short phone (375 × 667)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('the button stays on screen; the picture shrinks first', async ({ page }, testInfo) => {
    await openExplore(page)
    await expect(welcome(page)).toBeVisible(FIRST_LOAD)
    await expectTapTargets(page)
    await snap(page, testInfo, 'welcome-1-short')
    await nextButton(page).click()
    await nextButton(page).click()
    await expectCard(page, 'vote', 'Seen one? Tell everyone')
    await expectTapTargets(page)
    await snap(page, testInfo, 'welcome-3-short')
  })
})

test("a deep link to /about doesn't show the cards; About's quick tour reopens them", async ({ page }, testInfo) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'How Porchlight works' })).toBeVisible(FIRST_LOAD)
  await page.waitForTimeout(1500)
  await expect(welcomeHost(page)).toHaveCount(0)

  // Back on Explore in the same visit: still not shown (the visit began elsewhere).
  await page.locator('ion-back-button').click()
  await expect(cards(page).first()).toBeVisible(FIRST_LOAD)
  await page.waitForTimeout(1500)
  await expect(welcomeHost(page)).toHaveCount(0)
  expect(await storageValue(page, SEEN_KEY)).toBeNull()

  await page.goto('/about')
  await page.getByTestId('about-welcome-open').click()
  await expect(welcome(page)).toBeVisible()
  await expectCard(page, 'find', 'Find the houses worth the drive')
  await expect(dots(page)).toHaveCount(3)
  await snap(page, testInfo, 'welcome-about-reopen')
  await nextButton(page).click()
  await nextButton(page).click()
  await expect(nextButton(page)).toHaveText('Done')
  await nextButton(page).click()
  await expect(welcomeHost(page)).toHaveCount(0, FIRST_LOAD)
  await expect(page.getByRole('heading', { name: 'How Porchlight works' })).toBeVisible()
})

test('first sign-in shows card 4, whose button opens the community rules', async ({ page }, testInfo) => {
  const email = testerEmail(testInfo, `welcome${testInfo.retry}`)
  await signInDirect(page, email, { rules: 'leave' })

  await expect(welcome(page)).toBeVisible(FIRST_LOAD)
  await expectCard(page, 'add', 'Add your own display')
  await expect(page.getByTestId('welcome-text')).toHaveText(
    'Snap a photo and drop a pin. We show it 25–50 m away, so your exact address stays a little private.',
  )
  await expect(welcome(page).getByText('NEW')).toBeVisible()
  await expect(dots(page)).toHaveCount(1)
  await expect(nextButton(page)).toHaveText('Next: community rules')
  // The rules wait for the card: never both at once.
  await expect(rulesModalHost(page)).toHaveCount(0)
  await expectTapTargets(page)
  await snap(page, testInfo, 'welcome-4')

  await nextButton(page).click()
  await expect(welcomeHost(page)).toHaveCount(0, FIRST_LOAD)
  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  await expect(rulesModal(page)).toHaveAttribute('data-mode', 'agree')
  expect(await storageValue(page, MEMBER_SEEN_KEY)).toBe('seen')
})

test('"How Porchlight works" in the account menu reopens the cards and never opens the rules', async ({
  page,
}, testInfo) => {
  const email = testerEmail(testInfo, `welcomemenu${testInfo.retry}`)
  await signInDirect(page, email, { rules: 'leave' })

  // First sign-in: card 4; Skip goes to the rules too; agree there.
  await expect(welcome(page)).toBeVisible(FIRST_LOAD)
  await expectCard(page, 'add', 'Add your own display')
  await page.getByTestId('welcome-skip').click()
  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  await page.getByTestId('terms-checkbox').click()
  await rulesAgreeButton(page).click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)

  await page.locator('ion-header').getByRole('button', { name: 'Account' }).click()
  await page.locator('ion-action-sheet').getByRole('button', { name: 'How Porchlight works' }).click()
  await expect(welcome(page)).toBeVisible(FIRST_LOAD)
  await expectCard(page, 'find', 'Find the houses worth the drive')
  // Signed in: cards 1–4.
  await expect(dots(page)).toHaveCount(4)
  for (let i = 0; i < 3; i++) await nextButton(page).click()
  await expectCard(page, 'add', 'Add your own display')
  await expect(nextButton(page)).toHaveText('Done')
  await snap(page, testInfo, 'welcome-menu-reopen-4')
  await nextButton(page).click()
  await expect(welcomeHost(page)).toHaveCount(0, FIRST_LOAD)
  await page.waitForTimeout(1000)
  await expect(rulesModalHost(page)).toHaveCount(0)
})
