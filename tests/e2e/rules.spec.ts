// Community rules (SPEC §5 users, §6 TERMS_REQUIRED) against the emulators:
// the first sign-in shows the rules; "I agree" needs the box ticked; once
// agreed they don't show again after a reload, and "Community rules" in the
// account menu reopens them read-only. "Not now" keeps browsing working, and
// voting asks again, then goes ahead once agreed. A fresh account per
// attempt, so a retry still sees a first sign-in.
import { expect, test, type TestInfo } from '@playwright/test'
import { initializeApp, getApps, type App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { FIRST_LOAD, snap } from './helpers'
import {
  addTesters,
  hasAgreedToRules,
  rulesAgreeButton,
  rulesModal,
  rulesModalHost,
  signInDirect,
  testerEmail,
} from './phase2'

const EVENT_ID = 'HALLOWEEN_2026'
/** Rotorua seed pin (outside the Tauranga area the other specs count), copied as a vote target. */
const SOURCE_PIN = `seedUser00000000000049_${EVENT_ID}`

function adminApp(): App {
  if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  return getApps()[0] ?? initializeApp({ projectId: 'demo-porchlight' })
}

/** An ACTIVE pin per project with 2 "It's here" votes and none from anyone else, rewritten each run. */
async function writeVoteTarget(testInfo: TestInfo): Promise<string> {
  const tag = testInfo.project.name === 'iphone' ? 'Iphone' : 'Pixel0'
  const pinId = `e2eRulesTarget${tag}_${EVENT_ID}`
  const db = getFirestore(adminApp())
  const source = await db.doc(`pins/${SOURCE_PIN}`).get()
  const ref = db.doc(`pins/${pinId}`)
  await db.recursiveDelete(ref)
  await ref.set({
    ...source.data(),
    ownerId: pinId.slice(0, pinId.indexOf('_')),
    title: `E2E Rules Target ${testInfo.project.name}`,
    status: 'ACTIVE',
    hiddenReason: null,
    removedBy: null,
    voteRound: 0,
    hereVotes: 2,
    notThereVotes: 0,
    verified: false,
    reportsCount: 0,
    rankScore: 2,
    moderation: { decision: 'NONE', reviewedBy: null, reviewedAt: null, note: null },
  })
  return pinId
}

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

test('"Not now" keeps browsing; voting asks again and goes ahead once agreed', async ({ page }, testInfo) => {
  const pinId = await writeVoteTarget(testInfo)
  const email = testerEmail(testInfo, `rulesvote${testInfo.retry}`)
  await addTesters(email)
  await signInDirect(page, email, { rules: 'leave' })

  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  await expect(page.getByTestId('terms-close')).toHaveText('Not now')
  await page.getByTestId('terms-close').click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)
  expect(await hasAgreedToRules(email)).toBe(false)

  // Browsing still works, and "Not now" holds for this session (no modal on load).
  await page.goto(`/?pin=${pinId}`)
  const sheet = page.locator('ion-modal:not(.terms-modal)')
  await expect(sheet.getByRole('link', { name: 'Open in Maps' })).toBeVisible(FIRST_LOAD)
  await expect(rulesModalHost(page)).toHaveCount(0)
  await sheet.evaluate((m) => (m as HTMLElement & { setCurrentBreakpoint(b: number): Promise<void> }).setCurrentBreakpoint(0.95))
  await page.waitForTimeout(400)

  // Voting needs the rules: the modal opens, and the vote is sent once agreed.
  await page.getByTestId('vote-here').click()
  await expect(rulesModal(page)).toBeVisible(FIRST_LOAD)
  await expect(rulesModal(page)).toHaveAttribute('data-mode', 'agree')
  await snap(page, testInfo, 'rules-before-vote')
  await page.getByTestId('terms-checkbox').click()
  await rulesAgreeButton(page).click()
  await expect(rulesModalHost(page)).toHaveCount(0, FIRST_LOAD)
  await expect(page.getByTestId('vote-here')).toHaveAttribute('data-selected', 'true', FIRST_LOAD)
  await expect(sheet.getByTestId('pin-counts')).toContainText("3 people say it's here", FIRST_LOAD)
  expect(await hasAgreedToRules(email)).toBe(true)
})
