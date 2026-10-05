import { beforeAll, describe, expect, it } from 'vitest'
import { auth, db } from '../../../functions/src/lib/admin'
import { applyModeration, moderatePin } from '../../../functions/src/moderation/moderatePin'
import { castVote } from '../../../functions/src/votes/castVote'
import { reportPin } from '../../../functions/src/votes/reportPin'
import { expectReason, filesUnder, resetEmulators, seedConfig, seedEvent } from './helpers'
import { account, auditFor, pinData, randomUid, seedPhotos, seedPin } from './phase3Helpers'

const EVENT = 'HALLOWEEN_2026'
const XMAS = 'CHRISTMAS_2026'

let admin: Awaited<ReturnType<typeof account>>

beforeAll(async () => {
  await resetEmulators()
  await seedConfig('BETA')
  await seedEvent(EVENT)
  await seedEvent(XMAS)
  admin = await account('google', { tester: false, admin: true })
})

describe('moderatePin', () => {
  it('rejects non-admins, anonymous callers and bad input', async () => {
    const pinId = await seedPin(randomUid(), EVENT, { status: 'HIDDEN', hiddenReason: 'REPORTS' })
    const user = await account()
    await expectReason(moderatePin(user, { pinId, action: 'APPROVE' }), 'NOT_ADMIN')
    await expect(moderatePin(null, { pinId, action: 'APPROVE' })).rejects.toMatchObject({ code: 'unauthenticated' })
    await expectReason(moderatePin(admin, { pinId, action: 'DELETE' }), 'INVALID_INPUT')
    await expectReason(moderatePin(admin, { pinId, action: 'APPROVE', note: 'x'.repeat(501) }), 'INVALID_INPUT')
    await expectReason(moderatePin(admin, { pinId, action: 'APPROVE', status: 'ACTIVE' }), 'INVALID_INPUT')
    await expectReason(moderatePin(admin, { pinId: `${randomUid()}_${EVENT}`, action: 'APPROVE' }), 'NOT_FOUND')
    expect((await pinData(pinId)).status).toBe('HIDDEN')
    expect(await auditFor(pinId)).toEqual([])
  })

  it('APPROVE: HIDDEN → ACTIVE, records the review and the audit log (the note only in the audit log)', async () => {
    const pinId = await seedPin(randomUid(), EVENT, { status: 'HIDDEN', hiddenReason: 'NOT_THERE', notThereVotes: 3 })
    await expect(moderatePin(admin, { pinId, action: 'APPROVE', note: '  Checked, it is real ' })).resolves.toEqual({
      pinId,
      status: 'ACTIVE',
    })
    const pin = await pinData(pinId)
    expect(pin).toMatchObject({
      status: 'ACTIVE',
      hiddenReason: null,
      notThereVotes: 3,
      // The pin is public again: the free-text note stays in moderationActions.
      moderation: { decision: 'APPROVED', reviewedBy: admin.uid, note: null },
    })
    expect(pin.moderation.reviewedAt).not.toBeNull()
    const audit = await auditFor(pinId)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ pinId, adminUid: admin.uid, action: 'APPROVE', note: 'Checked, it is real' })

    // Not on a removed display.
    const removed = await seedPin(randomUid(), EVENT, { status: 'REMOVED', removedBy: 'OWNER' })
    await expectReason(moderatePin(admin, { pinId: removed, action: 'APPROVE' }), 'NOT_EDITABLE')
  })

  it('APPROVE on a reported ACTIVE display dismisses the reports; the same people cannot report again', async () => {
    const pinId = await seedPin()
    const reporter = await account('google')
    await reportPin(reporter, { pinId, reason: 'INAPPROPRIATE' })
    expect((await pinData(pinId)).reportsCount).toBe(1)
    await expect(moderatePin(admin, { pinId, action: 'APPROVE' })).resolves.toEqual({ pinId, status: 'ACTIVE' })
    expect(await pinData(pinId)).toMatchObject({ status: 'ACTIVE', reportsCount: 0, moderation: { decision: 'APPROVED' } })
    await expectReason(reportPin(reporter, { pinId, reason: 'SPAM' }), 'ALREADY_REPORTED')
  })

  it('REMOVE: ACTIVE → REMOVED by ADMIN and deletes the photos', async () => {
    const pinId = await seedPin()
    await seedPhotos(pinId)
    expect(await filesUnder(`photos/${pinId}/`)).toHaveLength(2)
    await expect(moderatePin(admin, { pinId, action: 'REMOVE', note: null })).resolves.toEqual({ pinId, status: 'REMOVED' })
    expect(await pinData(pinId)).toMatchObject({
      status: 'REMOVED',
      removedBy: 'ADMIN',
      moderation: { decision: 'REJECTED', reviewedBy: admin.uid, note: null },
    })
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([])
    expect((await auditFor(pinId))[0]).toMatchObject({ action: 'REMOVE', adminUid: admin.uid })
    await expectReason(moderatePin(admin, { pinId, action: 'REMOVE' }), 'NOT_EDITABLE')
  })

  it('REMOVE also takes an owner-deleted pin that was hidden for REPORTS', async () => {
    const reported = await seedPin(randomUid(), EVENT, { status: 'REMOVED', removedBy: 'OWNER', hiddenReason: 'REPORTS' })
    await seedPhotos(reported)
    await moderatePin(admin, { pinId: reported, action: 'REMOVE' })
    expect(await pinData(reported)).toMatchObject({ status: 'REMOVED', removedBy: 'ADMIN', hiddenReason: 'REPORTS' })
    expect(await filesUnder(`photos/${reported}/`)).toEqual([])

    const plain = await seedPin(randomUid(), EVENT, { status: 'REMOVED', removedBy: 'OWNER' })
    await expectReason(moderatePin(admin, { pinId: plain, action: 'REMOVE' }), 'NOT_EDITABLE')
  })

  it('RESTORE: admin-REMOVED → ACTIVE; owner-removed pins stay removed', async () => {
    const pinId = await seedPin(randomUid(), EVENT, { hereVotes: 3, verified: true, rankScore: 10003 })
    await moderatePin(admin, { pinId, action: 'REMOVE' })
    await expect(moderatePin(admin, { pinId, action: 'RESTORE', note: 'Mistake' })).resolves.toEqual({
      pinId,
      status: 'ACTIVE',
    })
    expect(await pinData(pinId)).toMatchObject({
      status: 'ACTIVE',
      removedBy: null,
      hiddenReason: null,
      verified: true,
      moderation: { decision: 'APPROVED', note: null },
    })
    expect((await auditFor(pinId)).map((a) => a.action).sort()).toEqual(['REMOVE', 'RESTORE'])
    expect(await auditFor(pinId)).toContainEqual(expect.objectContaining({ action: 'RESTORE', note: 'Mistake' }))

    const owners = await seedPin(randomUid(), EVENT, { status: 'REMOVED', removedBy: 'OWNER' })
    await expectReason(moderatePin(admin, { pinId: owners, action: 'RESTORE' }), 'NOT_EDITABLE')
    await expectReason(moderatePin(admin, { pinId, action: 'RESTORE' }), 'NOT_EDITABLE')
  })

  it('BAN_USER bans the owner, disables their account and removes all their pins', async () => {
    const owner = await account('google')
    const voter = await account('google')
    const halloween = await seedPin(owner.uid, EVENT)
    const christmas = await seedPin(owner.uid, XMAS, { status: 'HIDDEN', hiddenReason: 'REPORTS' })
    const other = await seedPin(randomUid(), EVENT)
    await seedPhotos(halloween)
    await seedPhotos(christmas)
    // The owner was active before the ban.
    await castVote(owner, { pinId: other, value: 'HERE' })

    await expect(moderatePin(admin, { pinId: halloween, action: 'BAN_USER', note: 'Spam account' })).resolves.toEqual({
      pinId: halloween,
      status: 'REMOVED',
    })

    for (const pinId of [halloween, christmas]) {
      expect(await pinData(pinId)).toMatchObject({
        status: 'REMOVED',
        removedBy: 'ADMIN',
        moderation: { decision: 'REJECTED', reviewedBy: admin.uid, note: null },
      })
      expect(await filesUnder(`photos/${pinId}/`)).toEqual([])
    }
    expect((await pinData(other)).status).toBe('ACTIVE')
    expect((await db().doc(`users/${owner.uid}`).get()).get('banned')).toBe(true)
    const record = await auth().getUser(owner.uid)
    expect(record.disabled).toBe(true)
    expect(record.tokensValidAfterTime).toBeTruthy()
    expect(await auditFor(halloween)).toEqual([
      expect.objectContaining({ action: 'BAN_USER', adminUid: admin.uid, note: 'Spam account' }),
    ])

    // A banned account can't vote any more.
    await expectReason(castVote(owner, { pinId: other, value: 'NOT_THERE' }), 'BANNED')
    await expect(castVote(voter, { pinId: other, value: 'HERE' })).resolves.toMatchObject({ hereVotes: 2 })

    // Re-running the ban is safe (e.g. after an Auth failure).
    await expect(moderatePin(admin, { pinId: halloween, action: 'BAN_USER' })).resolves.toMatchObject({ status: 'REMOVED' })
  })

  it('BAN_USER works for an owner with no users doc and no Auth account', async () => {
    const ownerId = randomUid()
    const pinId = await seedPin(ownerId)
    await applyModeration({ pinId, action: 'BAN_USER', note: null }, 'scriptAdmin')
    expect(await pinData(pinId)).toMatchObject({ status: 'REMOVED', removedBy: 'ADMIN' })
    expect((await db().doc(`users/${ownerId}`).get()).data()).toMatchObject({ banned: true, pinCreatesByEvent: {} })
    expect((await auditFor(pinId))[0]).toMatchObject({ adminUid: 'scriptAdmin', action: 'BAN_USER' })
  })

  it("an admin can't ban themselves", async () => {
    const pinId = await seedPin(admin.uid)
    await expectReason(moderatePin(admin, { pinId, action: 'BAN_USER' }), 'INVALID_INPUT')
    expect((await pinData(pinId)).status).toBe('ACTIVE')
  })
})
