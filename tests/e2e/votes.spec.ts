// Votes and reports in the pin sheet (SPEC F3/F7/F8) against the emulators
// (Auth, Firestore, Functions): signed out → "Sign in to vote"; vote HERE,
// change to NOT_THERE, counts + Verified follow, reload keeps my vote;
// report → "Reported"; no vote buttons on your own pin.
//
// Each project votes/reports on its own fixture pins, copied from a Rotorua
// seed pin (outside the Tauranga area the other specs count) and rewritten
// before each test so a retry starts clean.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { initializeApp, getApps, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { FIRST_LOAD, snap } from './helpers'
import { addTesters, signInDirect, testerEmail } from './phase2'

const EVENT_ID = 'HALLOWEEN_2026'

/** Rotorua seed pin (scripts/seed.ts, "Koutu Creepers") the fixtures are copied from. */
const SOURCE_PIN = `seedUser00000000000049_${EVENT_ID}`

/** Fixture pin ids (owner part 20–40 alphanumerics, like a real uid), one set per project. */
function pinsFor(testInfo: TestInfo): { vote: string; report: string } {
  const tag = testInfo.project.name === 'iphone' ? 'Iphone' : 'Pixel0'
  return { vote: `e2eVoteTarget${tag}01_${EVENT_ID}`, report: `e2eReportTarget${tag}_${EVENT_ID}` }
}

function adminApp(): App {
  if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  return getApps()[0] ?? initializeApp({ projectId: 'demo-porchlight' })
}

/**
 * (Re)writes an ACTIVE fixture pin copied from the seed pin, with no votes or
 * reports on record: 2 "It's here", 0 "Not there", unverified.
 */
async function writeFixturePin(pinId: string, title: string, ownerId = pinId.slice(0, pinId.indexOf('_'))): Promise<void> {
  const db = getFirestore(adminApp())
  const source = await db.doc(`pins/${SOURCE_PIN}`).get()
  const ref = db.doc(`pins/${pinId}`)
  await db.recursiveDelete(ref)
  await ref.set({
    ...source.data(),
    ownerId,
    title,
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
}

/** Opens the sheet for a pin and pulls it up to the top breakpoint, so the vote buttons are on screen. */
async function openSheet(page: Page, pinId: string): Promise<void> {
  await page.goto(`/?pin=${pinId}`)
  const sheet = page.locator('ion-modal')
  await expect(sheet.getByRole('link', { name: 'Open in Maps' })).toBeVisible(FIRST_LOAD)
  await sheet.evaluate((m) => (m as HTMLElement & { setCurrentBreakpoint(b: number): Promise<void> }).setCurrentBreakpoint(0.9))
  await page.waitForTimeout(400)
}

function counts(page: Page) {
  return page.locator('ion-modal').getByTestId('pin-counts')
}

test('signed out, the sheet asks you to sign in to vote', async ({ page }, testInfo) => {
  await openSheet(page, SOURCE_PIN)
  const signIn = page.getByTestId('sign-in-to-vote')
  await expect(signIn).toBeVisible()
  await expect(signIn).toContainText('Sign in to vote')
  // The vote buttons are shown as prompts, not hidden.
  await expect(page.getByTestId('vote-here')).toBeVisible()
  await snap(page, testInfo, 'votes-signed-out')
  await page.getByTestId('vote-here').click()
  await expect(page).toHaveURL(/\/sign-in/)
})

test('vote, change the vote, counts follow, reload keeps it', async ({ page }, testInfo) => {
  const { vote: pinId } = pinsFor(testInfo)
  await writeFixturePin(pinId, `E2E Vote Target ${testInfo.project.name}`)
  const email = testerEmail(testInfo, 'votes')
  await addTesters(email)
  await signInDirect(page, email)

  await openSheet(page, pinId)
  const here = page.getByTestId('vote-here')
  const notThere = page.getByTestId('vote-not-there')
  await expect(counts(page)).toContainText("2 people say it's here")
  await expect(counts(page).locator('ion-badge')).toHaveText('Unverified')
  await expect(here).toHaveAttribute('data-selected', 'false')
  await expect(page.getByTestId('sign-in-to-vote')).toHaveCount(0)

  // HERE: the 3rd counted "It's here" verifies it (Google accounts count at once).
  await here.click()
  await expect(here).toHaveAttribute('data-selected', 'true')
  await expect(counts(page)).toContainText("3 people say it's here", FIRST_LOAD)
  await expect(counts(page).locator('ion-badge')).toHaveText('✓ Verified')
  await expect(page.getByTestId('my-vote')).toHaveText("You said it's here.")
  await expect(page.getByTestId('vote-uncounted')).toHaveCount(0)
  await snap(page, testInfo, 'votes-here')

  // Change to NOT_THERE: the HERE moves over.
  await notThere.click()
  await expect(notThere).toHaveAttribute('data-selected', 'true')
  await expect(here).toHaveAttribute('data-selected', 'false')
  await expect(counts(page)).toContainText("2 people say it's here", FIRST_LOAD)
  await expect(counts(page)).toContainText("1 person says it's not there")
  await expect(counts(page).locator('ion-badge')).toHaveText('Unverified')

  // Reload: my vote is read back from pins/{pinId}/votes/{uid}.
  await page.reload()
  const sheet = page.locator('ion-modal')
  await expect(sheet.getByRole('link', { name: 'Open in Maps' })).toBeVisible(FIRST_LOAD)
  await expect(page.getByTestId('vote-not-there')).toHaveAttribute('data-selected', 'true', FIRST_LOAD)
  await expect(page.getByTestId('vote-here')).toHaveAttribute('data-selected', 'false')
  await expect(counts(page)).toContainText("1 person says it's not there")
  await snap(page, testInfo, 'votes-after-reload')
})

test('report a display', async ({ page }, testInfo) => {
  const { report: pinId } = pinsFor(testInfo)
  await writeFixturePin(pinId, `E2E Report Target ${testInfo.project.name}`)
  const email = testerEmail(testInfo, 'votes')
  await addTesters(email)
  await signInDirect(page, email)

  await openSheet(page, pinId)
  const report = page.getByTestId('report')
  await expect(report).toHaveText('Report')
  await report.click()

  const picker = page.locator('ion-action-sheet')
  await expect(picker).toContainText('Report this display')
  await snap(page, testInfo, 'report-reasons')
  await picker.getByRole('button', { name: 'Spam or advertising' }).click()

  await expect(page.getByText("Thanks, we'll take a look.")).toBeVisible(FIRST_LOAD)
  await expect(report).toHaveText('Reported')
  await expect(report).toHaveAttribute('disabled', /.*/)
  // One counted report doesn't hide it: the sheet stays open.
  await expect(page.locator('ion-modal').getByTestId('vote-bar')).toBeVisible()

  await page.reload()
  await expect(page.locator('ion-modal').getByRole('link', { name: 'Open in Maps' })).toBeVisible(FIRST_LOAD)
  await expect(page.getByTestId('report')).toHaveText('Reported', FIRST_LOAD)
})

test('no vote or report buttons on your own display', async ({ page }, testInfo) => {
  const email = testerEmail(testInfo, 'votes-own')
  await signInDirect(page, email)

  // Give this account a display (copied from a seed pin) with the Admin SDK.
  const { uid } = await getAuth(adminApp()).getUserByEmail(email)
  const ownId = `${uid}_${EVENT_ID}`
  const title = `My own display ${testInfo.project.name}`
  await writeFixturePin(ownId, title, uid)

  try {
    await page.goto(`/?pin=${ownId}`)
    const sheet = page.locator('ion-modal')
    await expect(sheet.getByRole('heading', { name: title })).toBeVisible(FIRST_LOAD)
    await expect(sheet.getByTestId('own-pin-note')).toHaveText('This is your display.')
    await expect(sheet.getByTestId('vote-bar')).toHaveCount(0)
    await expect(sheet.getByTestId('report')).toHaveCount(0)
  } finally {
    await getFirestore(adminApp()).doc(`pins/${ownId}`).delete()
  }
})
