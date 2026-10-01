import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../../functions/src/lib/admin'
import { reportPin } from '../../../functions/src/votes/reportPin'
import { castVote } from '../../../functions/src/votes/castVote'
import { expectReason, resetEmulators, seedConfig, seedEvent, setLaunchMode, today } from './helpers'
import { account, pinData, randomUid, seedPin, setRateLimit } from './phase3Helpers'

const EVENT = 'HALLOWEEN_2026'

beforeAll(async () => {
  await resetEmulators()
  await seedConfig('BETA')
  await seedEvent(EVENT)
})

describe('reportPin', () => {
  it('3 counted reports hide the pin (REPORTS)', async () => {
    const pinId = await seedPin()
    const [a, b, c] = await Promise.all([account(), account(), account()])
    await expect(reportPin(a, { pinId, reason: 'SPAM' })).resolves.toEqual({ pinId, counted: true, hidden: false })
    await reportPin(b, { pinId, reason: 'PRIVACY' })
    expect(await pinData(pinId)).toMatchObject({ status: 'ACTIVE', reportsCount: 2 })
    await expect(reportPin(c, { pinId, reason: 'NOT_A_DISPLAY' })).resolves.toEqual({ pinId, counted: true, hidden: true })
    expect(await pinData(pinId)).toMatchObject({ status: 'HIDDEN', hiddenReason: 'REPORTS', reportsCount: 3 })

    const report = (await db().doc(`pins/${pinId}/reports/${c.uid}`).get()).data()
    expect(report).toMatchObject({ reason: 'NOT_A_DISPLAY', counted: true })
    expect((await db().doc(`rateLimits/${c.uid}`).get()).data()).toMatchObject({ day: today(), reportPin: 1 })

    // Hidden: no more votes or reports.
    const late = await account()
    await expectReason(reportPin(late, { pinId, reason: 'SPAM' }), 'NOT_VOTABLE')
    await expectReason(castVote(late, { pinId, value: 'HERE' }), 'NOT_VOTABLE')
  })

  it('rejects a second report from the same user', async () => {
    const pinId = await seedPin()
    const a = await account()
    await reportPin(a, { pinId, reason: 'OTHER' })
    await expectReason(reportPin(a, { pinId, reason: 'SPAM' }), 'ALREADY_REPORTED')
    expect((await pinData(pinId)).reportsCount).toBe(1)
  })

  it('records but does not count a young email-link account', async () => {
    const pinId = await seedPin()
    const young = await account('youngEmail')
    await expect(reportPin(young, { pinId, reason: 'SPAM' })).resolves.toMatchObject({ counted: false, hidden: false })
    expect((await pinData(pinId)).reportsCount).toBe(0)
    expect((await db().doc(`pins/${pinId}/reports/${young.uid}`).get()).get('counted')).toBe(false)
    // Still one report per user.
    await expectReason(reportPin(young, { pinId, reason: 'SPAM' }), 'ALREADY_REPORTED')
  })

  it('uses threshold 8 once an admin approved the pin', async () => {
    const pinId = await seedPin(randomUid(), EVENT, { reportsCount: 3 })
    await db().doc(`pins/${pinId}`).update({ 'moderation.decision': 'APPROVED' })
    await expect(reportPin(await account(), { pinId, reason: 'SPAM' })).resolves.toMatchObject({ hidden: false })
    await db().doc(`pins/${pinId}`).update({ reportsCount: 7 })
    await expect(reportPin(await account(), { pinId, reason: 'SPAM' })).resolves.toMatchObject({ hidden: true })
    expect(await pinData(pinId)).toMatchObject({ status: 'HIDDEN', hiddenReason: 'REPORTS', reportsCount: 8 })
  })

  it('rejects reporting your own pin', async () => {
    const owner = await account()
    const pinId = await seedPin(owner.uid)
    await expectReason(reportPin(owner, { pinId, reason: 'SPAM' }), 'OWN_PIN')
  })

  it('rejects bad input, missing pins and anonymous callers', async () => {
    const a = await account()
    const pinId = await seedPin()
    await expectReason(reportPin(a, { pinId, reason: 'BORING' }), 'INVALID_INPUT')
    await expectReason(reportPin(a, { pinId }), 'INVALID_INPUT')
    await expectReason(reportPin(a, { pinId, reason: 'SPAM', note: 'x' }), 'INVALID_INPUT')
    await expectReason(reportPin(a, { pinId: `${randomUid()}_${EVENT}`, reason: 'SPAM' }), 'NOT_FOUND')
    await expect(reportPin(null, { pinId, reason: 'SPAM' })).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('enforces the beta gate', async () => {
    const pinId = await seedPin()
    const outsider = await account('google', { tester: false })
    await expectReason(reportPin(outsider, { pinId, reason: 'SPAM' }), 'BETA_ONLY')
    await setLaunchMode('LIVE')
    try {
      await expect(reportPin(outsider, { pinId, reason: 'SPAM' })).resolves.toMatchObject({ counted: true })
    } finally {
      await setLaunchMode('BETA')
    }
  })

  it('allows 20 reports a day', async () => {
    const a = await account()
    await setRateLimit(a.uid, { reportPin: 19 })
    await reportPin(a, { pinId: await seedPin(), reason: 'SPAM' })
    const pinId = await seedPin()
    await expectReason(reportPin(a, { pinId, reason: 'SPAM' }), 'RATE_LIMITED')
    expect((await db().doc(`pins/${pinId}/reports/${a.uid}`).get()).exists).toBe(false)
  })
})
