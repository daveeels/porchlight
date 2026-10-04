import { geohashForLocation } from 'geofire-common'
import { beforeAll, describe, expect, it } from 'vitest'
import { bucket, db, Timestamp } from '../../../functions/src/lib/admin'
import { haversineKm } from '../../../functions/src/lib/geo'
import { processUpload } from '../../../functions/src/lib/photo'
import { createPin } from '../../../functions/src/pins/createPin'
import { deletePin } from '../../../functions/src/pins/deletePin'
import {
  DAY_MS,
  PAPAMOA,
  createInput,
  expectReason,
  filesUnder,
  gpsJpeg,
  newUser,
  newUploadId,
  pinRef,
  resetEmulators,
  rotatedJpeg,
  seedConfig,
  seedEvent,
  setLaunchMode,
  sharp,
  today,
  upload,
  uploadExists,
} from './helpers'

const EVENT = 'HALLOWEEN_2026'

beforeAll(async () => {
  await resetEmulators()
  await seedConfig('BETA')
  await seedEvent(EVENT)
})

describe('createPin Coming soon', () => {
  it('needs no photo; ranks below ready displays; unverified', async () => {
    const user = await newUser()
    const input = createInput(EVENT, '', { comingSoon: true })
    delete (input as Record<string, unknown>).uploadId
    const { pinId } = await createPin(user, input)
    expect((await pinRef(pinId).get()).data()).toMatchObject({
      stage: 'COMING_SOON',
      status: 'ACTIVE',
      photoPath: null,
      thumbPath: null,
      photoUrl: null,
      thumbUrl: null,
      verified: false,
      rankScore: -1_000_000,
    })
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([])
  })

  it('takes an optional photo', async () => {
    const user = await newUser()
    const uploadId = await upload(user.uid)
    const { pinId } = await createPin(user, createInput(EVENT, uploadId, { comingSoon: true }))
    expect((await pinRef(pinId).get()).data()).toMatchObject({
      stage: 'COMING_SOON',
      photoPath: `photos/${pinId}/${uploadId}/full.webp`,
    })
  })

  it('a ready display still needs a photo; comingSoon must be a boolean', async () => {
    const user = await newUser()
    const input = createInput(EVENT, '')
    delete (input as Record<string, unknown>).uploadId
    await expectReason(createPin(user, input), 'INVALID_INPUT')
    await expectReason(createPin(user, createInput(EVENT, newUploadId(), { comingSoon: 'yes' })), 'INVALID_INPUT')
  })
})

describe('createPin happy path', () => {
  it('creates an ACTIVE, unverified, offset pin with a cleaned photo', async () => {
    const user = await newUser()
    const input = await gpsJpeg()
    const inMeta = await sharp(input).metadata()
    expect(inMeta.exif).toBeDefined()
    const exif = inMeta.exif as Buffer
    expect(exif.includes('PorchlightTestCam')).toBe(true)
    // GPSInfo IFD pointer tag (0x8825) is present in the input.
    expect(exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88]))).toBe(true)

    const uploadId = await upload(user.uid, input)
    const { pinId } = await createPin(user, createInput(EVENT, uploadId))
    expect(pinId).toBe(`${user.uid}_${EVENT}`)

    const pin = (await pinRef(pinId).get()).data()
    expect(pin).toBeDefined()
    if (!pin) return
    expect(pin).toMatchObject({
      ownerId: user.uid,
      eventId: EVENT,
      season: 'HALLOWEEN',
      seasonYear: 2026,
      title: 'Pāpāmoa Pumpkin Parade',
      description: 'A pumpkin for every year.',
      status: 'ACTIVE',
      hiddenReason: null,
      removedBy: null,
      voteRound: 0,
      hereVotes: 0,
      notThereVotes: 0,
      verified: false,
      reportsCount: 0,
      rankScore: 0,
      stage: 'READY',
      isFeatured: false,
      featuredUntil: null,
      moderation: { decision: 'NONE', reviewedBy: null, reviewedAt: null, note: null },
      photoPath: `photos/${pinId}/${uploadId}/full.webp`,
      thumbPath: `photos/${pinId}/${uploadId}/thumb.webp`,
    })
    for (const key of ['consentAt', 'createdAt', 'updatedAt', 'expiresAt', 'purgeAt']) {
      expect(pin[key]).toBeInstanceOf(Timestamp)
    }
    const event = (await db().doc(`events/${EVENT}`).get()).data()
    expect(pin.expiresAt.isEqual(event?.expiresAt)).toBe(true)
    expect(pin.purgeAt.isEqual(event?.purgeAt)).toBe(true)

    // Location: offset 25–50 m; geohash (precision 9) and place from the offset point.
    const m = haversineKm(PAPAMOA, { lat: pin.geo.latitude, lng: pin.geo.longitude }) * 1000
    expect(m).toBeGreaterThanOrEqual(25 - 1e-6)
    expect(m).toBeLessThanOrEqual(50 + 1e-6)
    expect(pin.geohash).toBe(geohashForLocation([pin.geo.latitude, pin.geo.longitude], 9))
    expect(pin.place.areaKey).toBe('tauranga')
    expect(pin.place.area).toBe('Tauranga & surrounds')
    expect(pin.place.town).toMatch(/Pāpāmoa/)
    expect(pin.place.countryCode).toBe('NZ')

    // Photo: WebP, resized, no metadata at all, immutable caching, working URL.
    const [full] = await bucket().file(pin.photoPath).download()
    const [thumb] = await bucket().file(pin.thumbPath).download()
    const fullMeta = await sharp(full).metadata()
    const thumbMeta = await sharp(thumb).metadata()
    expect(fullMeta.format).toBe('webp')
    expect([fullMeta.width, fullMeta.height]).toEqual([1600, 1200])
    expect(thumbMeta.format).toBe('webp')
    expect([thumbMeta.width, thumbMeta.height]).toEqual([400, 300])
    for (const meta of [fullMeta, thumbMeta]) {
      expect(meta.exif).toBeUndefined()
      expect(meta.xmp).toBeUndefined()
      expect(meta.iptc).toBeUndefined()
    }
    expect(full.includes('PorchlightTestCam')).toBe(false)
    expect(full.includes('EXIF')).toBe(false)
    const [fileMeta] = await bucket().file(pin.photoPath).getMetadata()
    expect(fileMeta.cacheControl).toBe('public, max-age=31536000, immutable')
    expect(fileMeta.contentType).toBe('image/webp')
    const res = await fetch(pin.photoUrl)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).equals(full)).toBe(true)
    expect((await fetch(pin.thumbUrl)).status).toBe(200)

    // The upload is gone; users / rateLimits / placeIndex updated.
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
    const userDoc = (await db().doc(`users/${user.uid}`).get()).data()
    expect(userDoc).toMatchObject({ banned: false, pinCreatesByEvent: { [EVENT]: 1 } })
    expect(userDoc?.createdAt).toBeInstanceOf(Timestamp)
    expect(userDoc && 'email' in userDoc).toBe(false)
    const rate = (await db().doc(`rateLimits/${user.uid}`).get()).data()
    expect(rate).toEqual({ day: today(), createPin: 1, updatePin: 0, castVote: 0, reportPin: 0 })
    const index = (await db().doc(`placeIndex/${EVENT}`).get()).data()
    expect(index?.areas?.tauranga?.count).toBeGreaterThanOrEqual(1)
    expect(index?.towns?.[pin.place.townKey]).toMatchObject({ town: pin.place.town, areaKey: 'tauranga' })
    expect(index?.towns?.[pin.place.townKey]?.count).toBeGreaterThanOrEqual(1)
  })

  it('auto-orients from EXIF and accepts PNG and WebP uploads', async () => {
    const a = await newUser()
    const { pinId } = await createPin(a, createInput(EVENT, await upload(a.uid, await rotatedJpeg())))
    const pin = (await pinRef(pinId).get()).data()
    const [full] = await bucket().file(pin?.photoPath).download()
    const meta = await sharp(full).metadata()
    expect([meta.width, meta.height]).toEqual([200, 300]) // was 300×200 with Orientation 6
    expect(meta.orientation).toBeUndefined()

    for (const format of ['png', 'webp'] as const) {
      const u = await newUser()
      const img = sharp({ create: { width: 64, height: 48, channels: 3, background: '#123456' } })
      const data = await (format === 'png' ? img.png() : img.webp()).toBuffer()
      await expect(createPin(u, createInput(EVENT, await upload(u.uid, data)))).resolves.toBeDefined()
    }
  })

  it('stores a blank description as null', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid), { description: '   ' }))
    expect((await pinRef(pinId).get()).get('description')).toBeNull()
  })
})

describe('one pin per user per event', () => {
  it('a second create fails with ALREADY_EXISTS and cleans up after itself', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    const first = (await pinRef(pinId).get()).data()

    const second = await upload(user.uid)
    await expectReason(createPin(user, createInput(EVENT, second)), 'ALREADY_EXISTS')
    expect(await uploadExists(user.uid, second)).toBe(false)
    expect(await filesUnder(`photos/${pinId}/${second}/`)).toEqual([])
    expect((await pinRef(pinId).get()).get('photoPath')).toBe(first?.photoPath)
  })

  it('checks run before the photo is processed (no sharp for a call that would fail)', async () => {
    const user = await newUser()
    await createPin(user, createInput(EVENT, await upload(user.uid)))
    // Not an image: if sharp ran first this would be PHOTO_INVALID.
    const junk = await upload(user.uid, Buffer.from('not a photo'))
    await expectReason(createPin(user, createInput(EVENT, junk)), 'ALREADY_EXISTS')
    expect(await uploadExists(user.uid, junk)).toBe(false)

    const limited = await newUser()
    await db()
      .doc(`rateLimits/${limited.uid}`)
      .set({ day: today(), createPin: 3, updatePin: 0, castVote: 0, reportPin: 0 })
    await expectReason(
      createPin(limited, createInput(EVENT, await upload(limited.uid, Buffer.from('not a photo')))),
      'RATE_LIMITED',
    )
    // A failed call doesn't use up a rate-limit slot.
    expect((await db().doc(`rateLimits/${limited.uid}`).get()).get('createPin')).toBe(3)
  })

  it('two simultaneous creates produce exactly one pin', async () => {
    const user = await newUser()
    const [a, b] = [await upload(user.uid), await upload(user.uid)]
    const results = await Promise.allSettled([
      createPin(user, createInput(EVENT, a)),
      createPin(user, createInput(EVENT, b)),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({ details: { reason: 'ALREADY_EXISTS' } })

    const pins = await db().collection('pins').where('ownerId', '==', user.uid).get()
    expect(pins.size).toBe(1)
    const pin = pins.docs[0]?.data()
    // Only the winner's photos are left; both uploads are gone.
    const pinId = `${user.uid}_${EVENT}`
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([pin?.photoPath, pin?.thumbPath].sort())
    expect(await uploadExists(user.uid, a)).toBe(false)
    expect(await uploadExists(user.uid, b)).toBe(false)
    expect((await db().doc(`users/${user.uid}`).get()).get(`pinCreatesByEvent.${EVENT}`)).toBe(1)
  })

  it('a double-tap with the same uploadId keeps the winning photo', async () => {
    const user = await newUser()
    const uploadId = await upload(user.uid)
    const results = await Promise.allSettled([
      createPin(user, createInput(EVENT, uploadId)),
      createPin(user, createInput(EVENT, uploadId)),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const pin = (await pinRef(`${user.uid}_${EVENT}`).get()).data()
    expect(await filesUnder(`photos/${user.uid}_${EVENT}/`)).toEqual([pin?.photoPath, pin?.thumbPath].sort())
  })
})

describe('who may create', () => {
  it('rejects anonymous callers', async () => {
    await expect(createPin(null, createInput(EVENT, newUploadId()))).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('BETA_ONLY for a non-tester, an unverified tester email, and passes for admins', async () => {
    const outsider = await newUser({ tester: false })
    const id = await upload(outsider.uid)
    await expectReason(createPin(outsider, createInput(EVENT, id)), 'BETA_ONLY')
    expect(await uploadExists(outsider.uid, id)).toBe(false) // the upload is always cleaned up
    expect(await filesUnder(`photos/${outsider.uid}_${EVENT}/`)).toEqual([])

    const unverified = await newUser({ emailVerified: false })
    await expectReason(createPin(unverified, createInput(EVENT, await upload(unverified.uid))), 'BETA_ONLY')

    const admin = await newUser({ tester: false, admin: true })
    await expect(createPin(admin, createInput(EVENT, await upload(admin.uid)))).resolves.toBeDefined()
  })

  it('lets anyone signed in post once launchMode is LIVE', async () => {
    const outsider = await newUser({ tester: false })
    await setLaunchMode('LIVE')
    try {
      await expect(createPin(outsider, createInput(EVENT, await upload(outsider.uid)))).resolves.toBeDefined()
    } finally {
      await setLaunchMode('BETA')
    }
  })

  it('BANNED for a banned user, and their photos are removed', async () => {
    const user = await newUser()
    await db().doc(`users/${user.uid}`).set({ createdAt: Timestamp.now(), banned: true, pinCreatesByEvent: {} })
    const uploadId = await upload(user.uid)
    await expectReason(createPin(user, createInput(EVENT, uploadId)), 'BANNED')
    expect(await filesUnder(`photos/${user.uid}_${EVENT}/`)).toEqual([])
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
  })
})

describe('limits and windows', () => {
  it('RATE_LIMITED after 3 creates today; yesterday’s counts reset', async () => {
    const user = await newUser()
    const limits = db().doc(`rateLimits/${user.uid}`)
    await limits.set({ day: today(), createPin: 3, updatePin: 0, castVote: 0, reportPin: 0 })
    await expectReason(createPin(user, createInput(EVENT, await upload(user.uid))), 'RATE_LIMITED')

    await limits.set({ day: '2020-01-01', createPin: 3, updatePin: 7, castVote: 9, reportPin: 2 })
    await createPin(user, createInput(EVENT, await upload(user.uid)))
    expect((await limits.get()).data()).toEqual({ day: today(), createPin: 1, updatePin: 0, castVote: 0, reportPin: 0 })
  })

  it('CREATE_CAP after 3 creates in one event (create → delete × 3)', async () => {
    const user = await newUser()
    for (let i = 0; i < 3; i++) {
      await createPin(user, createInput(EVENT, await upload(user.uid)))
      await deletePin(user, { eventId: EVENT })
    }
    // Pretend it's tomorrow so the daily limit isn't what stops us.
    await db().doc(`rateLimits/${user.uid}`).set({ day: '2020-01-01' }, { merge: true })
    const uploadId = await upload(user.uid)
    await expectReason(createPin(user, createInput(EVENT, uploadId)), 'CREATE_CAP')
    expect((await db().doc(`users/${user.uid}`).get()).get(`pinCreatesByEvent.${EVENT}`)).toBe(3)
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
  })

  it('SUBMISSIONS_CLOSED before opening, after expiry and when inactive', async () => {
    const notYet = await seedEvent('CHRISTMAS_2026', { opensInMs: DAY_MS })
    const over = await seedEvent('HALLOWEEN_2025', { opensInMs: -60 * DAY_MS, expiresInMs: -DAY_MS })
    const off = await seedEvent('CHRISTMAS_2025', { isActive: false })
    for (const eventId of [notYet, over, off]) {
      const user = await newUser()
      await expectReason(createPin(user, createInput(eventId, await upload(user.uid))), 'SUBMISSIONS_CLOSED')
    }
  })

  it('INVALID_INPUT for an event that does not exist', async () => {
    const user = await newUser()
    await expectReason(createPin(user, createInput('HALLOWEEN_2099', await upload(user.uid))), 'INVALID_INPUT')
  })
})

describe('re-creating after a removal', () => {
  it('REMOVED_BY_ADMIN when a moderator removed the pin', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    await pinRef(pinId).update({ status: 'REMOVED', removedBy: 'ADMIN' })
    await expectReason(createPin(user, createInput(EVENT, await upload(user.uid))), 'REMOVED_BY_ADMIN')
  })

  it('UNDER_REVIEW when a reported pin was deleted (deletePin keeps hiddenReason)', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    await pinRef(pinId).update({ status: 'HIDDEN', hiddenReason: 'REPORTS', reportsCount: 3 })
    await deletePin(user, { eventId: EVENT })
    const removed = (await pinRef(pinId).get()).data()
    expect(removed).toMatchObject({ status: 'REMOVED', removedBy: 'OWNER', hiddenReason: 'REPORTS' })
    await expectReason(createPin(user, createInput(EVENT, await upload(user.uid))), 'UNDER_REVIEW')
  })

  it('an owner-deleted pin can be re-added; old votes, reports and photos are cleared', async () => {
    const user = await newUser()
    const { pinId } = await createPin(user, createInput(EVENT, await upload(user.uid)))
    const old = (await pinRef(pinId).get()).data()
    await pinRef(pinId).collection('votes').doc('voter1').set({ value: 'HERE', counted: true, round: 0 })
    await pinRef(pinId).collection('reports').doc('voter2').set({ reason: 'SPAM', counted: true })
    await deletePin(user, { eventId: EVENT })
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([])

    // Leftover photos from the old version are swept on re-create too.
    await bucket().file(old?.photoPath).save(Buffer.from('stale'))
    const uploadId = await upload(user.uid)
    await createPin(user, createInput(EVENT, uploadId))
    const pin = (await pinRef(pinId).get()).data()
    expect(pin).toMatchObject({ status: 'ACTIVE', removedBy: null, hiddenReason: null, voteRound: 0, hereVotes: 0 })
    expect((await pinRef(pinId).collection('votes').get()).size).toBe(0)
    expect((await pinRef(pinId).collection('reports').get()).size).toBe(0)
    expect(await filesUnder(`photos/${pinId}/`)).toEqual([pin?.photoPath, pin?.thumbPath].sort())
  })
})

describe('input validation', () => {
  const bad: [string, Record<string, unknown>][] = [
    ['lat out of range', { lat: 91 }],
    ['lng out of range', { lng: -180.5 }],
    ['lat not a number', { lat: '-37.7' }],
    ['lat NaN', { lat: Number.NaN }],
    ['uploadId with ../', { uploadId: '../../etc/passwd0000' }],
    ['uploadId too short', { uploadId: 'abc' }],
    ['bad eventId', { eventId: 'halloween-2026' }],
    ['title too short', { title: ' ab ' }],
    ['title too long', { title: 'x'.repeat(61) }],
    ['URL in title', { title: 'Visit https://spam.example' }],
    ['domain in title', { title: 'Cheap pumpkins at pumpkins.co.nz' }],
    ['www in description', { description: 'see www.example.org for times' }],
    ['profanity in title', { title: 'What the fuck house' }],
    ['description too long', { description: 'y'.repeat(501) }],
    ['consent false', { consentOwnerOrPermission: false }],
    ['consent missing', { consentOwnerOrPermission: undefined }],
    ['server-only field', { status: 'ACTIVE' }],
    ['exact geo smuggled in', { geo: { lat: 1, lng: 2 } }],
  ]

  for (const [name, patch] of bad) {
    it(`INVALID_INPUT: ${name}`, async () => {
      const user = await newUser()
      await expectReason(createPin(user, createInput(EVENT, newUploadId(), patch)), 'INVALID_INPUT')
      expect((await pinRef(`${user.uid}_${EVENT}`).get()).exists).toBe(false)
    })
  }

  it('INVALID_INPUT outside New Zealand, before any photo work; the upload is deleted', async () => {
    for (const where of [
      { lat: -33.87, lng: 151.21 }, // Sydney
      { lat: -40, lng: 170 }, // Tasman Sea
      { lat: -90, lng: 0 }, // the pole (the offset would divide by cos 90°)
      { lat: 90, lng: 180 },
    ]) {
      const user = await newUser()
      const uploadId = await upload(user.uid)
      await expect(createPin(user, createInput(EVENT, uploadId, where))).rejects.toMatchObject({
        details: { reason: 'INVALID_INPUT' },
        message: 'Porchlight only covers New Zealand for now.',
      })
      expect(await uploadExists(user.uid, uploadId)).toBe(false)
      expect(await filesUnder(`photos/${user.uid}_${EVENT}/`)).toEqual([])
      expect((await pinRef(`${user.uid}_${EVENT}`).get()).exists).toBe(false)
    }
  })

  it('invalid input still deletes a well-formed upload', async () => {
    const user = await newUser()
    const uploadId = await upload(user.uid)
    await expectReason(createPin(user, createInput(EVENT, uploadId, { title: 'x' })), 'INVALID_INPUT')
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
  })

  it('INVALID_INPUT for a title hiding a link with a zero-width space', async () => {
    const user = await newUser()
    await expectReason(createPin(user, createInput(EVENT, newUploadId(), { title: 'Visit evil\u200b.com' })), 'INVALID_INPUT')
  })

  it('INVALID_INPUT for a non-object payload', async () => {
    const user = await newUser()
    await expectReason(createPin(user, null), 'INVALID_INPUT')
    await expectReason(createPin(user, ['x']), 'INVALID_INPUT')
  })
})

describe('photo checks', () => {
  it('PHOTO_INVALID for a text file uploaded as image/jpeg', async () => {
    const user = await newUser()
    const uploadId = await upload(user.uid, Buffer.from('definitely not a photo\n'.repeat(50)))
    await expectReason(createPin(user, createInput(EVENT, uploadId)), 'PHOTO_INVALID')
    expect(await uploadExists(user.uid, uploadId)).toBe(false)
    expect((await pinRef(`${user.uid}_${EVENT}`).get()).exists).toBe(false)
    expect(await filesUnder(`photos/${user.uid}_${EVENT}/`)).toEqual([])
  })

  it('PHOTO_INVALID for a GIF and for a missing upload', async () => {
    const user = await newUser()
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer()
    await expectReason(createPin(user, createInput(EVENT, await upload(user.uid, gif))), 'PHOTO_INVALID')
    await expectReason(createPin(user, createInput(EVENT, newUploadId())), 'PHOTO_INVALID')
  })

  it('processing the same upload twice keeps the first download URL working', async () => {
    const user = await newUser()
    const uploadId = await upload(user.uid)
    const pinId = `${user.uid}_${EVENT}`
    const first = await processUpload(user.uid, uploadId, pinId)
    const second = await processUpload(user.uid, uploadId, pinId)
    expect(second.photoUrl).toBe(first.photoUrl)
    expect(second.thumbUrl).toBe(first.thumbUrl)
    expect((await fetch(first.photoUrl)).status).toBe(200)
    expect((await fetch(first.thumbUrl)).status).toBe(200)
  })

  it("reads only the caller's own upload folder", async () => {
    const owner = await newUser()
    const thief = await newUser()
    const uploadId = await upload(owner.uid)
    await expectReason(createPin(thief, createInput(EVENT, uploadId)), 'PHOTO_INVALID')
    expect(await uploadExists(owner.uid, uploadId)).toBe(true)
  })
})
