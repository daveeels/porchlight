import { beforeAll, describe, expect, it } from 'vitest'
import { auth, db, Timestamp } from '../../../functions/src/lib/admin'
import { applyModeration } from '../../../functions/src/moderation/moderatePin'
import { castVote } from '../../../functions/src/votes/castVote'
import { expectReason, newUser, resetEmulators, seedConfig, seedEvent, setLaunchMode, today, type TestUser } from './helpers'
import { account, pinData, randomUid, seedPin, setRateLimit } from './phase3Helpers'

const EVENT = 'HALLOWEEN_2026'

beforeAll(async () => {
  await resetEmulators()
  await seedConfig('BETA')
  await seedEvent(EVENT)
})

async function voters(n: number, kind: 'google' | 'youngEmail' | 'oldEmail' = 'google'): Promise<TestUser[]> {
  return Promise.all(Array.from({ length: n }, () => account(kind)))
}

function voteDoc(pinId: string, uid: string) {
  return db().doc(`pins/${pinId}/votes/${uid}`)
}

describe('castVote', () => {
  it('3 counted "It\'s here" votes verify a pin', async () => {
    const pinId = await seedPin()
    const [a, b, c] = await voters(3)
    await castVote(a!, { pinId, value: 'HERE' })
    await castVote(b!, { pinId, value: 'HERE' })
    expect((await pinData(pinId)).verified).toBe(false)
    const result = await castVote(c!, { pinId, value: 'HERE' })
    expect(result).toEqual({
      pinId,
      myVote: 'HERE',
      counted: true,
      hereVotes: 3,
      notThereVotes: 0,
      verified: true,
      status: 'ACTIVE',
    })
    expect(await pinData(pinId)).toMatchObject({ hereVotes: 3, notThereVotes: 0, verified: true, rankScore: 10003 })
    const vote = (await voteDoc(pinId, c!.uid).get()).data()
    expect(vote).toMatchObject({ value: 'HERE', counted: true, round: 0 })
    expect(vote?.createdAt).toBeInstanceOf(Timestamp)
    expect((await db().doc(`rateLimits/${c!.uid}`).get()).data()).toMatchObject({ day: today(), castVote: 1 })
    // Lazy users doc.
    expect((await db().doc(`users/${c!.uid}`).get()).get('banned')).toBe(false)
  })

  it('changing a vote moves the counts; the same vote again is a no-op', async () => {
    const pinId = await seedPin()
    const [a, b, c, d] = await voters(4)
    for (const v of [a, b, c]) await castVote(v!, { pinId, value: 'HERE' })
    await castVote(d!, { pinId, value: 'NOT_THERE' })
    expect(await pinData(pinId)).toMatchObject({ hereVotes: 3, notThereVotes: 1, verified: true, rankScore: 10002 })

    const changed = await castVote(a!, { pinId, value: 'NOT_THERE' })
    expect(changed).toMatchObject({ myVote: 'NOT_THERE', counted: true, hereVotes: 2, notThereVotes: 2, verified: false })
    expect(await pinData(pinId)).toMatchObject({ hereVotes: 2, notThereVotes: 2, verified: false, rankScore: 0 })

    const again = await castVote(a!, { pinId, value: 'NOT_THERE' })
    expect(again).toMatchObject({ hereVotes: 2, notThereVotes: 2 })
    // The no-op wrote nothing, so it didn't use up the rate limit either.
    expect((await db().doc(`rateLimits/${a!.uid}`).get()).get('castVote')).toBe(2)
  })

  it('a vote from an older round counts as no vote', async () => {
    const pinId = await seedPin(randomUid(), EVENT, { voteRound: 1, hereVotes: 0 })
    const v = await account('google')
    // Stale HERE from round 0 (the photo changed since).
    await voteDoc(pinId, v.uid).set({ value: 'HERE', counted: true, round: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
    const result = await castVote(v, { pinId, value: 'HERE' })
    expect(result).toMatchObject({ hereVotes: 1, counted: true })
    expect((await voteDoc(pinId, v.uid).get()).data()).toMatchObject({ value: 'HERE', round: 1 })

    // Changing it within round 1 doesn't remove anything from round 0.
    await castVote(v, { pinId, value: 'NOT_THERE' })
    expect(await pinData(pinId)).toMatchObject({ hereVotes: 0, notThereVotes: 1 })
  })

  it('a young email-link account votes but is not counted; an old one is', async () => {
    const pinId = await seedPin()
    const young = await account('youngEmail')
    const result = await castVote(young, { pinId, value: 'HERE' })
    expect(result).toMatchObject({ counted: false, hereVotes: 0, myVote: 'HERE' })
    expect((await voteDoc(pinId, young.uid).get()).data()).toMatchObject({ value: 'HERE', counted: false, round: 0 })
    expect(await pinData(pinId)).toMatchObject({ hereVotes: 0, notThereVotes: 0 })

    // Changing an uncounted vote stays uncounted.
    await castVote(young, { pinId, value: 'NOT_THERE' })
    expect(await pinData(pinId)).toMatchObject({ hereVotes: 0, notThereVotes: 0 })
    expect((await voteDoc(pinId, young.uid).get()).get('counted')).toBe(false)

    const old = await account('oldEmail')
    await expect(castVote(old, { pinId, value: 'HERE' })).resolves.toMatchObject({ counted: true, hereVotes: 1 })
  })

  it('3 counted "Not there" votes that outnumber "here" hide the pin; voting then closes', async () => {
    const pinId = await seedPin()
    const [h, a, b, c, late] = await voters(5)
    await castVote(h!, { pinId, value: 'HERE' })
    await castVote(a!, { pinId, value: 'NOT_THERE' })
    await castVote(b!, { pinId, value: 'NOT_THERE' })
    expect((await pinData(pinId)).status).toBe('ACTIVE')
    const result = await castVote(c!, { pinId, value: 'NOT_THERE' })
    expect(result).toMatchObject({ status: 'HIDDEN', notThereVotes: 3, hereVotes: 1 })
    expect(await pinData(pinId)).toMatchObject({ status: 'HIDDEN', hiddenReason: 'NOT_THERE', notThereVotes: 3 })
    await expectReason(castVote(late!, { pinId, value: 'HERE' }), 'NOT_VOTABLE')
  })

  it('does not hide while "here" votes keep up', async () => {
    const pinId = await seedPin(randomUid(), EVENT, { hereVotes: 3, verified: true, rankScore: 10003 })
    const [a, b, c] = await voters(3)
    for (const v of [a, b, c]) await castVote(v!, { pinId, value: 'NOT_THERE' })
    expect(await pinData(pinId)).toMatchObject({ status: 'ACTIVE', notThereVotes: 3, verified: false })
  })

  it('after an admin APPROVE the next "not there" vote does not re-hide (threshold 8)', async () => {
    const pinId = await seedPin()
    const vs = await voters(9)
    for (const v of vs.slice(0, 3)) await castVote(v, { pinId, value: 'NOT_THERE' })
    expect((await pinData(pinId)).status).toBe('HIDDEN')

    await applyModeration({ pinId, action: 'APPROVE', note: null }, 'adminUid')
    expect(await pinData(pinId)).toMatchObject({ status: 'ACTIVE', hiddenReason: null, moderation: { decision: 'APPROVED' } })

    await castVote(vs[3]!, { pinId, value: 'NOT_THERE' })
    expect(await pinData(pinId)).toMatchObject({ status: 'ACTIVE', notThereVotes: 4 })
    for (const v of vs.slice(4, 7)) await castVote(v, { pinId, value: 'NOT_THERE' })
    expect((await pinData(pinId)).status).toBe('ACTIVE')
    const result = await castVote(vs[7]!, { pinId, value: 'NOT_THERE' })
    expect(result).toMatchObject({ notThereVotes: 8, status: 'HIDDEN' })
  })

  it('NOT_VOTABLE while a display is Coming soon', async () => {
    const pinId = await seedPin(undefined, undefined, { stage: 'COMING_SOON', rankScore: -1_000_000 })
    const [a] = await voters(1)
    await expectReason(castVote(a!, { pinId, value: 'HERE' }), 'NOT_VOTABLE')
    expect((await voteDoc(pinId, a!.uid).get()).exists).toBe(false)
  })

  it('rejects a vote on your own pin', async () => {
    const owner = await account('google')
    const pinId = await seedPin(owner.uid)
    await expectReason(castVote(owner, { pinId, value: 'HERE' }), 'OWN_PIN')
  })

  it('rejects missing pins, bad input and anonymous callers', async () => {
    const v = await account('google')
    await expectReason(castVote(v, { pinId: `${randomUid()}_${EVENT}`, value: 'HERE' }), 'NOT_FOUND')
    const pinId = await seedPin()
    await expectReason(castVote(v, { pinId, value: 'MAYBE' }), 'INVALID_INPUT')
    await expectReason(castVote(v, { pinId: 'nope', value: 'HERE' }), 'INVALID_INPUT')
    await expectReason(castVote(v, { pinId, value: 'HERE', counted: true }), 'INVALID_INPUT')
    await expect(castVote(null, { pinId, value: 'HERE' })).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('enforces the beta gate (testers and admins only while BETA)', async () => {
    const pinId = await seedPin()
    const outsider = await account('google', { tester: false })
    await expectReason(castVote(outsider, { pinId, value: 'HERE' }), 'BETA_ONLY')
    const admin = await account('google', { tester: false, admin: true })
    await expect(castVote(admin, { pinId, value: 'HERE' })).resolves.toMatchObject({ hereVotes: 1 })
    await setLaunchMode('LIVE')
    try {
      await expect(castVote(outsider, { pinId, value: 'HERE' })).resolves.toMatchObject({ hereVotes: 2 })
    } finally {
      await setLaunchMode('BETA')
    }
  })

  it('allows 40 votes a day', async () => {
    const pinId = await seedPin()
    const v = await account('google')
    await setRateLimit(v.uid, { castVote: 39 })
    await castVote(v, { pinId, value: 'HERE' })
    await expectReason(castVote(v, { pinId, value: 'NOT_THERE' }), 'RATE_LIMITED')
    expect((await pinData(pinId)).hereVotes).toBe(1)
  })

  it('rejects banned and disabled accounts', async () => {
    const pinId = await seedPin()
    const banned = await account('google')
    await db().doc(`users/${banned.uid}`).set({ createdAt: Timestamp.now(), banned: true, pinCreatesByEvent: {} })
    await expectReason(castVote(banned, { pinId, value: 'HERE' }), 'BANNED')
    const disabled = await newUser()
    await auth().updateUser(disabled.uid, { disabled: true })
    await expectReason(castVote(disabled, { pinId, value: 'HERE' }), 'BANNED')
  })
})
