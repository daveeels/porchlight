// Community rules (SPEC §5 users, §6 TERMS_REQUIRED) against the emulators:
// the first sign-in shows the rules; "I agree" needs the box ticked; once
// agreed they don't show again after a reload, and "Community rules" in the
// account menu reopens them read-only. They're a must for members: no Close,
// no Escape, only "I agree" or "Sign out", and they ask again on every load
// until agreed. A fresh account per attempt, so a retry still sees a first
// sign-in.
import { expect, test } from '@playwright/test'
import { FIRST_LOAD, snap } from './helpers'
import {
  hasAgreedToRules,
  rulesAgreeButton,
  rulesModal,
  rulesModalHost,
  signInDirect,
  testerEmail,
} from './phase2'

test('first sign-in asks to agree to the community rules; it sticks, and the menu reopens them read-only', async ({
  page,
}, testInfo) => {
  const email = testerEmail(testInfo, `rules${testInfo.retry}`)
  await signInDirect(page, email, { rules: 'leave' })

  const modal = rulesModal(page)
  await expect(modal).toBeVisible(FIRST_LOAD)
  await expect(modal).toHaveAttribute('data-mode', 'agree')
  await expect(modal.getByRole('heading', { name: 'Before you post or vote' })).toBeVisible()
  await expect(modal.getByTestId('rules-list').locator('li')).toHaveCount(6)
  await expect(modal.getByText("Keep photos free of house numbers, number plates and people's faces.")).toBeVisible()
  await expect(modal.getByRole('link', { name: 'Full terms and privacy policy' })).toHaveAttribute('href', '/about#terms')

  // "I agree" stays disabled until the box is ticked.
  const agree = rulesAgreeButton(page)
  await expect(agree).toBeDisabled()
  await snap(page, testInfo, 'rules-modal')
  await page.getByTestId('terms-checkbox').click()
  await expect(agree).toBeEnabled()
  await snap(page, testInfo, 'rules-modal-ticked')
  await agree.click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)
  await expect.poll(() => hasAgreedToRules(email)).toBe(true)

  // A reload doesn't ask again.
  await page.goto('/')
  const account = page.locator('ion-header').getByRole('button', { name: 'Account' })
  await expect(account).toBeVisible(FIRST_LOAD)
  await page.waitForTimeout(2000) // the users doc has been read by now
  await expect(rulesModalHost(page)).toHaveCount(0)

  // Account menu → Community rules: read-only, with the date agreed.
  await account.click()
  await page.locator('ion-action-sheet').getByRole('button', { name: 'Community rules' }).click()
  await expect(modal).toBeVisible()
  await expect(modal).toHaveAttribute('data-mode', 'view')
  await expect(page.getByTestId('terms-agreed-on')).toHaveText(/^You agreed on \d{1,2} [A-Z][a-z]+ \d{4}\.$/)
  await expect(page.getByTestId('terms-checkbox')).toHaveCount(0)
  await expect(page.getByTestId('terms-agree')).toHaveCount(0)
  await snap(page, testInfo, 'rules-modal-read-only')
  await page.getByTestId('terms-close').click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)
})

test('the rules are a must: no way past them but "I agree" or "Sign out", and they ask again next time', async ({
  page,
}, testInfo) => {
  const email = testerEmail(testInfo, `rulesgate${testInfo.retry}`)
  await signInDirect(page, email, { rules: 'leave' })

  const modal = rulesModal(page)
  await expect(modal).toBeVisible(FIRST_LOAD)
  await expect(modal).toHaveAttribute('data-mode', 'agree')
  // No Close / Not now, and Escape doesn't close it.
  await expect(page.getByTestId('terms-close')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await expect(modal).toBeVisible()
  await snap(page, testInfo, 'rules-gate')

  // A reload asks again.
  await page.goto('/')
  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  expect(await hasAgreedToRules(email)).toBe(false)

  // Sign out: the gate goes, browsing carries on signed out.
  await page.getByTestId('terms-sign-out').click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)
  await expect(page.locator('ion-header').getByRole('button', { name: 'Account' })).toHaveCount(0, FIRST_LOAD)
  await expect(page.getByTestId('results')).toBeVisible(FIRST_LOAD)
  expect(await hasAgreedToRules(email)).toBe(false)

  // Signing back in asks again.
  await signInDirect(page, email, { rules: 'leave' })
  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  await expect(rulesModal(page)).toHaveAttribute('data-mode', 'agree')
})
