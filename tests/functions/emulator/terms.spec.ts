// Community rules (SPEC §5 users, §6): acceptTerms, and TERMS_REQUIRED on
// createPin / updatePin / castVote / reportPin until the current version is
// agreed. deletePin and moderatePin don't need it.
import { beforeAll, describe, expect, it } from 'vitest'
import { auth, db, Timestamp } from '../../../functions/src/lib/admin'
import { TERMS_VERSION } from '../../../functions/src/lib/terms'
import { moderatePin } from '../../../functions/src/moderation/moderatePin'
import { createPin } from '../../../functions/src/pins/createPin'
import { deletePin } from '../../../functions/src/pins/deletePin'
import { updatePin } from '../../../functions/src/pins/updatePin'
import { acceptTerms } from '../../../functions/src/users/acceptTerms'
import { castVote } from '../../../functions/src/votes/castVote'
import { reportPin } from '../../../functions/src/votes/reportPin'
import {
  agreeToRules,
  createInput,
  expectReason,
  filesUnder,
  newUser,
  pinRef,
  resetEmulators,
  seedConfig,
  seedEvent,
  upload,
  uploadExists,
} from './helpers'
import { account, pinData, randomUid, seedPin } from './phase3Helpers'

const EVENT = 'HALLOWEEN_2026'

beforeAll(async () => {
  await resetEmulators()
  await seedConfig('BETA')
  await seedEvent(EVENT)
})

function userDoc(uid: string) {
  return db().doc(`users/${uid}`)
}

describe('acceptTerms', () => {
  it('records the version and a server Timestamp, creating users/{uid} lazily', async () => {
    const user = await account('google', { terms: false })
    expect((await userDoc(user.uid).get()).exists).toBe(false)

    const before = Date.now()
    const result = await acceptTerms(user, { version: TERMS_VERSION })
    expect(result.termsVersion).toBe(TERMS_VERSION)
    expect(result.acceptedAt).toBeGreaterThanOrEqual(before - 1000)

    const doc = (await userDoc(user.uid).get()).data()
    expect(doc).toMatchObject({ banned: false, pinCreatesByEvent: {}, termsVersion: TERMS_VERSION })
    expect(doc?.termsAcceptedAt).toBeInstanceOf(Timestamp)
    expect((doc?.termsAcceptedAt as Timestamp).toMillis()).toBe(result.acceptedAt)
    expect(doc?.createdAt).toBeInstanceOf(Timestamp)
    expect(doc && 'email' in doc).toBe(false)
  })

  it('is idempotent: agreeing again keeps the first date', async () => {
    const user = await account('google', { terms: false })
    const first = await acceptTerms(user, { version: TERMS_VERSION })
    await new Promise((r) => setTimeout(r, 20))
    const second = await acceptTerms(user, { version: TERMS_VERSION })
    expect(second).toEqual(first)
    expect(((await userDoc(user.uid).get()).get('termsAcceptedAt') as Timestamp).toMillis()).toBe(first.acceptedAt)
  })

  it('updates an older version on an existing doc and keeps its other fields', async () => {
    const user = await account('google', { terms: false })
    await userDoc(user.uid).set({
      createdAt: Timestamp.now(),
      banned: false,
      pinCreatesByEvent: { [EVENT]: 2 },
      termsVersion: '2020-01-01',
      termsAcceptedAt: Timestamp.fromMillis(Date.UTC(2020, 0, 1)),
    })
    const result = await acceptTerms(user, { version: TERMS_VERSION })
    const doc = (await userDoc(user.uid).get()).data()
    expect(doc).toMatchObject({ termsVersion: TERMS_VERSION, pinCreatesByEvent: { [EVENT]: 2 } })
    expect((doc?.termsAcceptedAt as Timestamp).toMillis()).toBe(result.acceptedAt)
    expect(result.acceptedAt).toBeGreaterThan(Date.UTC(2026, 0, 1))
  })

  it('rejects a wrong, missing or malformed version, and extra fields', async () => {
    const user = await account('google', { terms: false })
    await expectReason(acceptTerms(user, { version: '2020-01-01' }), 'INVALID_INPUT')
    await expectReason(acceptTerms(user, {}), 'INVALID_INPUT')
    await expectReason(acceptTerms(user, { version: 20261002 }), 'INVALID_INPUT')
    await expectReason(acceptTerms(user, null), 'INVALID_INPUT')
    await expectReason(acceptTerms(user, { version: TERMS_VERSION, termsAcceptedAt: 0 }), 'INVALID_INPUT')
    await expectReason(acceptTerms(user, { version: TERMS_VERSION, termsVersion: TERMS_VERSION }), 'INVALID_INPUT')
    expect((await userDoc(user.uid).get()).exists).toBe(false)
  })

  it('rejects anonymous callers and banned or disabled accounts', async () => {
    await expect(acceptTerms(null, { version: TERMS_VERSION })).rejects.toMatchObject({ code: 'unauthenticated' })

    const banned = await account('google', { terms: false })
    await userDoc(banned.uid).set({ createdAt: Timestamp.now(), banned: true, pinCreatesByEvent: {} })
    await expectReason(acceptTerms(banned, { version: TERMS_VERSION }), 'BANNED')
    expect((await userDoc(banned.uid).get()).get('termsVersion')).toBeUndefined()

    const disabled = await account('google', { terms: false })
    await auth().updateUser(disabled.uid, { disabled: true })
    await expectReason(acceptTerms(disabled, { version: TERMS_VERSION }), 'BANNED')
  })

  it('works for an account that is not a beta tester (no beta gate)', async () => {
    const stranger = await account('google', { tester: false, terms: false })
    await expect(acceptTerms(stranger, { version: TERMS_VERSION })).resolves.toMatchObject({ termsVersion: TERMS_VERSION })
  })
})

describe('TERMS_REQUIRED', () => {
  it('createPin refuses before agreeing (no photo processed, upload freed) and works after', async () => {
    const user = await newUser({ terms: false })
    const uploadId = await upload(user.uid)
    await expectReason(createPin(user, createInput(EVENT, uploadId)), 'TERMS_REQUIRED')
    await expect(createPin(user, createInput(EVENT, await upload(user.uid)))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Please read and agree to the community rules first.',
    })
    expect(await filesUnder(`photos/${user.uid}_${EVENT}/`)).toEqual([])
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
    expect((await pinRef(`${user.uid}_${EVENT}`).get()).exists).toBe(false)

    await agreeToRules(user)
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    expect((await pinData(pinId)).status).toBe('ACTIVE')
  })

  it('an older agreed version counts as not agreed', async () => {
    const user = await newUser({ terms: false })
    await userDoc(user.uid).set({
      createdAt: Timestamp.now(),
      banned: false,
      pinCreatesByEvent: {},
      termsVersion: '2020-01-01',
      termsAcceptedAt: Timestamp.now(),
    })
    await expectReason(createPin(user, createInput(EVENT, await upload(user.uid))), 'TERMS_REQUIRED')
    await expectReason(castVote(user, { pinId: await seedPin(), value: 'HERE' }), 'TERMS_REQUIRED')
  })

  it('banned beats TERMS_REQUIRED', async () => {
    const user = await newUser({ terms: false })
    await userDoc(user.uid).set({ createdAt: Timestamp.now(), banned: true, pinCreatesByEvent: {} })
    await expectReason(createPin(user, createInput(EVENT, await upload(user.uid))), 'BANNED')
    await expectReason(castVote(user, { pinId: await seedPin(), value: 'HERE' }), 'BANNED')
  })

  it('castVote refuses before agreeing (nothing written) and works after', async () => {
    const pinId = await seedPin()
    const voter = await account('google', { terms: false })
    await expectReason(castVote(voter, { pinId, value: 'HERE' }), 'TERMS_REQUIRED')
    expect((await db().doc(`pins/${pinId}/votes/${voter.uid}`).get()).exists).toBe(false)
    expect((await db().doc(`rateLimits/${voter.uid}`).get()).exists).toBe(false)
    expect((await pinData(pinId)).hereVotes).toBe(0)

    await agreeToRules(voter)
    await expect(castVote(voter, { pinId, value: 'HERE' })).resolves.toMatchObject({ hereVotes: 1, counted: true })
  })

  it('reportPin refuses before agreeing (nothing written) and works after', async () => {
    const pinId = await seedPin()
    const reporter = await account('google', { terms: false })
    await expectReason(reportPin(reporter, { pinId, reason: 'SPAM' }), 'TERMS_REQUIRED')
    expect((await db().doc(`pins/${pinId}/reports/${reporter.uid}`).get()).exists).toBe(false)
    expect((await pinData(pinId)).reportsCount).toBe(0)

    await agreeToRules(reporter)
    await expect(reportPin(reporter, { pinId, reason: 'SPAM' })).resolves.toEqual({ pinId, counted: true, hidden: false })
  })

  it('updatePin refuses when the rules changed since; deletePin still works', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    // The rules were updated after this member agreed.
    await userDoc(user.uid).update({ termsVersion: '2020-01-01' })

    const uploadId = await upload(user.uid)
    await expectReason(updatePin(user, { eventId: EVENT, title: 'New title here' }), 'TERMS_REQUIRED')
    await expectReason(updatePin(user, { eventId: EVENT, uploadId }), 'TERMS_REQUIRED')
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
    expect((await pinData(pinId)).title).toBe('Pāpāmoa Pumpkin Parade')

    await expect(deletePin(user, { eventId: EVENT })).resolves.toEqual({ pinId })
    expect((await pinData(pinId)).status).toBe('REMOVED')
  })

  it('updatePin works after agreeing', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    await userDoc(user.uid).update({ termsVersion: '2020-01-01' })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Fog and pumpkins' }), 'TERMS_REQUIRED')
    await agreeToRules(user)
    await updatePin(user, { eventId: EVENT, title: 'Fog and pumpkins' })
    expect((await pinData(pinId)).title).toBe('Fog and pumpkins')
  })

  it('moderatePin does not need the rules agreed', async () => {
    const admin = await account('google', { tester: false, admin: true, terms: false })
    const pinId = await seedPin(randomUid(), EVENT, { status: 'HIDDEN', hiddenReason: 'REPORTS' })
    await expect(moderatePin(admin, { pinId, action: 'APPROVE' })).resolves.toMatchObject({ status: 'ACTIVE' })
  })
})
