import { beforeAll, describe, expect, it } from 'vitest'
import { bucket, db, FieldValue, Timestamp } from '../../../functions/src/lib/admin'
import { createPin } from '../../../functions/src/pins/createPin'
import { deletePin } from '../../../functions/src/pins/deletePin'
import { updatePin } from '../../../functions/src/pins/updatePin'
import {
  createInput,
  expectReason,
  filesUnder,
  newUser,
  newUploadId,
  pinRef,
  resetEmulators,
  seedConfig,
  seedEvent,
  sharp,
  today,
  upload,
  uploadExists,
  type TestUser,
} from './helpers'

const EVENT = 'HALLOWEEN_2026'

beforeAll(async () => {
  await resetEmulators()
  await seedConfig('BETA')
  await seedEvent(EVENT)
})

async function userWithPin(): Promise<{ user: TestUser; pinId: string }> {
  const user = await newUser()
  const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
  return { user, pinId }
}

/** Pretend the pin has been voted on and approved. */
async function addVotes(pinId: string): Promise<void> {
  await pinRef(pinId).update({
    hereVotes: 5,
    notThereVotes: 1,
    verified: true,
    rankScore: 10004,
    'moderation.decision': 'APPROVED',
    'moderation.reviewedBy': 'adminUid',
  })
  const votes = pinRef(pinId).collection('votes')
  await votes.doc('voterA').set({ value: 'HERE', counted: true, round: 0 })
  await votes.doc('voterB').set({ value: 'NOT_THERE', counted: true, round: 0 })
}

describe('updatePin', () => {
  it('a new photo starts a new vote round and replaces the old photos', async () => {
    const { user, pinId } = await userWithPin()
    await addVotes(pinId)
    const before = (await pinRef(pinId).get()).data()
    if (!before) throw new Error('no pin')

    const uploadId = await upload(user.uid)
    await expect(updatePin(user, { eventId: EVENT, uploadId })).resolves.toEqual({ pinId })
    const after = (await pinRef(pinId).get()).data()
    expect(after).toMatchObject({
      photoPath: `photos/${pinId}/${uploadId}/full.webp`,
      thumbPath: `photos/${pinId}/${uploadId}/thumb.webp`,
      voteRound: before.voteRound + 1,
      hereVotes: 0,
      notThereVotes: 0,
      verified: false,
      rankScore: 0,
      status: 'ACTIVE',
      title: before.title,
      moderation: { decision: 'NONE', reviewedBy: 'adminUid' },
    })
    expect(after?.photoUrl).not.toBe(before.photoUrl)
    expect(after?.updatedAt.toMillis()).toBeGreaterThanOrEqual(before.updatedAt.toMillis())
    // Location never changes.
    expect(after?.geo.isEqual(before.geo)).toBe(true)
    expect(after?.geohash).toBe(before.geohash)
    expect(after?.place).toEqual(before.place)

    // Old photos and old-round votes are cleaned up; the upload is gone.
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([after?.photoPath, after?.thumbPath].sort())
    expect((await pinRef(pinId).collection('votes').get()).size).toBe(0)
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
    const [full] = await bucket().file(after?.photoPath).download()
    expect((await sharp(full).metadata()).exif).toBeUndefined()
  })

  it('keeps featured rank after a photo change', async () => {
    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ isFeatured: true, rankScore: 100000 + 10003, verified: true, hereVotes: 3 })
    await updatePin(user, { eventId: EVENT, uploadId: await upload(user.uid) })
    expect((await pinRef(pinId).get()).get('rankScore')).toBe(100000)
  })

  it('a title/description edit keeps the votes but resets moderation', async () => {
    const { user, pinId } = await userWithPin()
    await addVotes(pinId)
    await updatePin(user, { eventId: EVENT, title: '  New spooky title ', description: null })
    const pin = (await pinRef(pinId).get()).data()
    expect(pin).toMatchObject({
      title: 'New spooky title',
      description: null,
      voteRound: 0,
      hereVotes: 5,
      notThereVotes: 1,
      verified: true,
      rankScore: 10004,
      moderation: { decision: 'NONE' },
    })
    expect((await pinRef(pinId).collection('votes').get()).size).toBe(2)
    expect((await db().doc(`rateLimits/${user.uid}`).get()).get('updatePin')).toBe(1)
  })

  it('a HIDDEN pin stays HIDDEN after an edit', async () => {
    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ status: 'HIDDEN', hiddenReason: 'NOT_THERE' })
    await updatePin(user, { eventId: EVENT, title: 'Still here, honest' })
    expect((await pinRef(pinId).get()).data()).toMatchObject({ status: 'HIDDEN', hiddenReason: 'NOT_THERE' })
  })

  it('rejects location and other server-only fields', async () => {
    const { user, pinId } = await userWithPin()
    for (const patch of [
      { lat: -37.6, lng: 176.1 },
      { lat: -37.6 },
      { geo: { latitude: 1, longitude: 2 } },
      { geohash: 'rckq2yzbc' },
      { status: 'ACTIVE' },
      { verified: true },
    ]) {
      await expectReason(updatePin(user, { eventId: EVENT, title: 'Moved house', ...patch }), 'INVALID_INPUT')
    }
    expect((await pinRef(pinId).get()).get('title')).toBe('Pāpāmoa Pumpkin Parade')
  })

  it('INVALID_INPUT for bad fields or nothing to change', async () => {
    const { user } = await userWithPin()
    await expectReason(updatePin(user, { eventId: EVENT }), 'INVALID_INPUT')
    await expectReason(updatePin(user, { eventId: EVENT, title: 'x' }), 'INVALID_INPUT')
    await expectReason(updatePin(user, { eventId: EVENT, title: 'go to spooky.com' }), 'INVALID_INPUT')
    await expectReason(updatePin(user, { eventId: EVENT, uploadId: '../x/../y/zzzzzz' }), 'INVALID_INPUT')
    await expectReason(updatePin(user, { eventId: 'nope', title: 'Fine title' }), 'INVALID_INPUT')
  })

  it("NOT_FOUND without a pin; can't edit someone else's", async () => {
    const stranger = await newUser()
    await expectReason(updatePin(stranger, { eventId: EVENT, title: 'Not mine' }), 'NOT_FOUND')
    const uploadId = await upload(stranger.uid)
    await expectReason(updatePin(stranger, { eventId: EVENT, uploadId }), 'NOT_FOUND')
    expect(await uploadExists(stranger.uid, uploadId)).toBe(false)
    expect(await filesUnder(`photos/${stranger.uid}_${EVENT}/`)).toEqual([])
  })

  it('NOT_EDITABLE once removed/archived or after expiresAt', async () => {
    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ status: 'ARCHIVED' })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Archived edit' }), 'NOT_EDITABLE')

    await pinRef(pinId).update({ status: 'ACTIVE', expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Too late now' }), 'NOT_EDITABLE')

    await pinRef(pinId).update({ status: 'REMOVED', removedBy: 'OWNER' })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Gone' }), 'NOT_FOUND')
  })

  it('RATE_LIMITED after 10 updates today', async () => {
    const { user } = await userWithPin()
    await db()
      .doc(`rateLimits/${user.uid}`)
      .set({ day: today(), createPin: 1, updatePin: 10, castVote: 0, reportPin: 0 })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Eleventh edit' }), 'RATE_LIMITED')
    // Checked before the photo is processed: junk gets RATE_LIMITED, not PHOTO_INVALID.
    const junk = await upload(user.uid, Buffer.from('not a photo'))
    await expectReason(updatePin(user, { eventId: EVENT, uploadId: junk }), 'RATE_LIMITED')
    expect(await uploadExists(user.uid, junk)).toBe(false)
  })

  it('NOT_FOUND / NOT_EDITABLE come before photo processing', async () => {
    const stranger = await newUser()
    const junk = await upload(stranger.uid, Buffer.from('not a photo'))
    await expectReason(updatePin(stranger, { eventId: EVENT, uploadId: junk }), 'NOT_FOUND')

    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    const junk2 = await upload(user.uid, Buffer.from('not a photo'))
    await expectReason(updatePin(user, { eventId: EVENT, uploadId: junk2 }), 'NOT_EDITABLE')
    expect(await uploadExists(user.uid, junk2)).toBe(false)
  })

  it('NOT_EDITABLE while hidden for reports: the reported photo and text stay for the moderator', async () => {
    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ status: 'HIDDEN', hiddenReason: 'REPORTS', reportsCount: 3 })
    const before = (await pinRef(pinId).get()).data()
    const uploadId = await upload(user.uid)
    await expectReason(updatePin(user, { eventId: EVENT, uploadId }), 'NOT_EDITABLE')
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Nothing to see here' }), 'NOT_EDITABLE')
    const after = (await pinRef(pinId).get()).data()
    expect(after).toMatchObject({ title: before?.title, photoPath: before?.photoPath, moderation: before?.moderation })
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([before?.photoPath, before?.thumbPath].sort())
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
  })

  it('invalid input still deletes a well-formed upload', async () => {
    const { user } = await userWithPin()
    const uploadId = await upload(user.uid)
    await expectReason(updatePin(user, { eventId: EVENT, uploadId, title: 'x' }), 'INVALID_INPUT')
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
  })

  it('PHOTO_INVALID keeps the current photo', async () => {
    const { user, pinId } = await userWithPin()
    const before = (await pinRef(pinId).get()).data()
    const bad = await upload(user.uid, Buffer.from('not an image at all'))
    await expectReason(updatePin(user, { eventId: EVENT, uploadId: bad }), 'PHOTO_INVALID')
    const after = (await pinRef(pinId).get()).data()
    expect(after?.photoPath).toBe(before?.photoPath)
    expect(after?.voteRound).toBe(0)
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([before?.photoPath, before?.thumbPath].sort())
  })

  it('BETA_ONLY for a non-tester; BANNED for a banned owner', async () => {
    const outsider = await newUser({ tester: false })
    await expectReason(updatePin(outsider, { eventId: EVENT, title: 'Let me in' }), 'BETA_ONLY')

    const { user } = await userWithPin()
    await db().doc(`users/${user.uid}`).update({ banned: true })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Banned edit' }), 'BANNED')
    await expectReason(deletePin(user, { eventId: EVENT }), 'BANNED')
  })

  it('rejects anonymous callers', async () => {
    await expect(updatePin(null, { eventId: EVENT, title: 'Anon' })).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})

describe('deletePin', () => {
  it('sets REMOVED by OWNER, keeps hiddenReason, deletes the photos', async () => {
    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ status: 'HIDDEN', hiddenReason: 'NOT_THERE' })
    expect(await filesUnder(`photos/${pinId}/`)).toHaveLength(2)

    await expect(deletePin(user, { eventId: EVENT })).resolves.toEqual({ pinId })
    const pin = (await pinRef(pinId).get()).data()
    expect(pin).toMatchObject({ status: 'REMOVED', removedBy: 'OWNER', hiddenReason: 'NOT_THERE' })
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([])
    // Still counts toward the create cap.
    expect((await db().doc(`users/${user.uid}`).get()).get(`pinCreatesByEvent.${EVENT}`)).toBe(1)
  })

  it('a pin hidden for reports keeps its photos for the moderator', async () => {
    const { user, pinId } = await userWithPin()
    await pinRef(pinId).update({ status: 'HIDDEN', hiddenReason: 'REPORTS', reportsCount: 3 })
    const photos = await filesUnder(`photos/${pinId}/`)
    expect(photos).toHaveLength(2)
    await deletePin(user, { eventId: EVENT })
    expect((await pinRef(pinId).get()).data()).toMatchObject({
      status: 'REMOVED',
      removedBy: 'OWNER',
      hiddenReason: 'REPORTS',
    })
    expect(await filesUnder(`photos/${pinId}/`)).toEqual(photos)
  })

  it('has no beta gate: a tester taken off the list can still delete', async () => {
    const { user, pinId } = await userWithPin()
    await db()
      .doc('config/testers')
      .set({ emails: FieldValue.arrayRemove(user.email.toLowerCase()) }, { merge: true })
    await expectReason(updatePin(user, { eventId: EVENT, title: 'Still a tester?' }), 'BETA_ONLY')
    await expect(deletePin(user, { eventId: EVENT })).resolves.toEqual({ pinId })
    expect((await pinRef(pinId).get()).get('status')).toBe('REMOVED')
  })

  it('NOT_FOUND when there is nothing to delete (or it is already removed)', async () => {
    const { user } = await userWithPin()
    await deletePin(user, { eventId: EVENT })
    await expectReason(deletePin(user, { eventId: EVENT }), 'NOT_FOUND')
    const stranger = await newUser()
    await expectReason(deletePin(stranger, { eventId: EVENT }), 'NOT_FOUND')
  })

  it('INVALID_INPUT for bad input; unauthenticated for anonymous', async () => {
    const user = await newUser()
    await expectReason(deletePin(user, { eventId: 'HALLOWEEN_26' }), 'INVALID_INPUT')
    await expectReason(deletePin(user, { eventId: EVENT, pinId: 'x' }), 'INVALID_INPUT')
    await expect(deletePin(null, { eventId: EVENT })).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('does not touch a re-created pin’s new photos', async () => {
    const { user, pinId } = await userWithPin()
    await deletePin(user, { eventId: EVENT })
    const uploadId = newUploadId()
    await createPin(user, createInput(EVENT, await upload(user.uid, undefined, uploadId)))
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([
      `photos/${pinId}/${uploadId}/full.webp`,
      `photos/${pinId}/${uploadId}/thumb.webp`,
    ])
  })
})
