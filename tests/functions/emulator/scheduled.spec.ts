import { beforeEach, describe, expect, it } from 'vitest'
import { db, Timestamp } from '../../../functions/src/lib/admin'
import { archiveExpiredPins } from '../../../functions/src/scheduled/archiveExpiredPins'
import { rebuildPlaceIndex } from '../../../functions/src/scheduled/rebuildPlaceIndex'
import { DAY_MS, resetEmulators, seedEvent } from './helpers'
import { pinData, randomUid, ROTORUA_PLACE, seedPin } from './phase3Helpers'

const EVENT = 'HALLOWEEN_2026'
const OLD = 'HALLOWEEN_2024' // purged: purgeAt in the past
const ENDED = 'HALLOWEEN_2025' // archived but not yet purged

beforeEach(async () => {
  await resetEmulators()
})

describe('rebuildPlaceIndex', () => {
  it('recounts ACTIVE pins per area and town and overwrites the doc', async () => {
    await seedEvent(EVENT)
    await seedEvent(ENDED, { expiresInMs: -30 * DAY_MS }) // purgeAt = 370 days from now
    await seedEvent(OLD, { expiresInMs: -500 * DAY_MS }) // purgeAt 100 days ago

    await seedPin(randomUid(), EVENT)
    await seedPin(randomUid(), EVENT)
    await seedPin(randomUid(), EVENT, { place: ROTORUA_PLACE })
    await seedPin(randomUid(), EVENT, { status: 'HIDDEN', hiddenReason: 'REPORTS' })
    await seedPin(randomUid(), EVENT, { status: 'REMOVED', removedBy: 'OWNER' })
    await seedPin(randomUid(), ENDED, { status: 'ARCHIVED' })

    // Stale counts from createPin's best-effort increments.
    await db()
      .doc(`placeIndex/${EVENT}`)
      .set({
        areas: { tauranga: { area: 'Tauranga & surrounds', count: 9 } },
        towns: { 'gone-e8-nz': { town: 'Gone', areaKey: null, region: 'X', countryCode: 'NZ', count: 4 } },
        updatedAt: Timestamp.fromMillis(0),
      })
    await db().doc(`placeIndex/${ENDED}`).set({ areas: {}, towns: { x: { count: 1 } }, updatedAt: Timestamp.fromMillis(0) })
    await db().doc(`placeIndex/${OLD}`).set({ marker: 'untouched' })

    const now = new Date()
    const summary = await rebuildPlaceIndex(db(), now)
    expect(summary.events).toEqual({ [EVENT]: 3, [ENDED]: 0 })

    const index = (await db().doc(`placeIndex/${EVENT}`).get()).data()
    expect(index).toEqual({
      areas: { tauranga: { area: 'Tauranga & surrounds', count: 2 } },
      towns: {
        'papamoa-beach-e8-nz': {
          town: 'Pāpāmoa Beach',
          areaKey: 'tauranga',
          region: 'Bay of Plenty',
          countryCode: 'NZ',
          count: 2,
        },
        'rotorua-e8-nz': { town: 'Rotorua', areaKey: null, region: 'Bay of Plenty', countryCode: 'NZ', count: 1 },
      },
      updatedAt: Timestamp.fromDate(now),
    })
    // An archived event rebuilds to empty; a purged one isn't touched.
    expect((await db().doc(`placeIndex/${ENDED}`).get()).data()).toMatchObject({ areas: {}, towns: {} })
    expect((await db().doc(`placeIndex/${OLD}`).get()).data()).toEqual({ marker: 'untouched' })
  })
})

describe('archiveExpiredPins', () => {
  it('archives only ACTIVE/HIDDEN pins whose expiresAt has passed', async () => {
    const now = Date.now()
    const past = { expiresAt: Timestamp.fromMillis(now - 1000) }
    const expiredActive = await seedPin(randomUid(), EVENT, past)
    const expiredHidden = await seedPin(randomUid(), EVENT, { ...past, status: 'HIDDEN', hiddenReason: 'NOT_THERE' })
    const expiredRemoved = await seedPin(randomUid(), EVENT, { ...past, status: 'REMOVED', removedBy: 'ADMIN' })
    const exactlyNow = await seedPin(randomUid(), EVENT, { expiresAt: Timestamp.fromMillis(now) })
    const live = await seedPin(randomUid(), EVENT, { expiresAt: Timestamp.fromMillis(now + DAY_MS) })

    await expect(archiveExpiredPins(db(), new Date(now))).resolves.toEqual({ archived: 3 })
    expect((await pinData(expiredActive)).status).toBe('ARCHIVED')
    expect(await pinData(expiredHidden)).toMatchObject({ status: 'ARCHIVED', hiddenReason: 'NOT_THERE' })
    expect((await pinData(exactlyNow)).status).toBe('ARCHIVED')
    expect(await pinData(expiredRemoved)).toMatchObject({ status: 'REMOVED', removedBy: 'ADMIN' })
    expect((await pinData(live)).status).toBe('ACTIVE')

    // Nothing left to do on a second run.
    await expect(archiveExpiredPins(db(), new Date(now))).resolves.toEqual({ archived: 0 })
  })

  it('works through more than one batch of 500', async () => {
    const past = Timestamp.fromMillis(Date.now() - DAY_MS)
    const writer = db().bulkWriter()
    for (let i = 0; i < 520; i++) {
      void writer.set(db().doc(`pins/${randomUid()}_${EVENT}`), { status: 'ACTIVE', expiresAt: past, eventId: EVENT })
    }
    await writer.close()
    await expect(archiveExpiredPins(db(), new Date())).resolves.toEqual({ archived: 520 })
    const left = await db().collection('pins').where('status', '==', 'ACTIVE').count().get()
    expect(left.data().count).toBe(0)
  })
})
