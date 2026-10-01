// rebuildPlaceIndex (SPEC §5 placeIndex, §6). Nightly: for every event with
// now < purgeAt, recount ACTIVE pins per area and town and OVERWRITE
// placeIndex/{eventId}. Fixes the best-effort increments from createPin
// (hidden/removed/archived pins drop out). Archived events rebuild to empty.
// The core takes (db, now) so tests can call it directly.
import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from '../lib/admin.js'
import type { PinPlace } from '../lib/places.js'

export interface PlaceIndexDoc {
  areas: Record<string, { area: string; count: number }>
  towns: Record<string, { town: string; areaKey: string | null; region: string; countryCode: string; count: number }>
  updatedAt: Timestamp
}

export interface RebuildSummary {
  /** eventId → ACTIVE pins counted. */
  events: Record<string, number>
}

/** Pure: the placeIndex doc for these ACTIVE pins' places. */
export function buildPlaceIndex(places: Iterable<Partial<PinPlace> | undefined>, now: Date): PlaceIndexDoc {
  const doc: PlaceIndexDoc = { areas: {}, towns: {}, updatedAt: Timestamp.fromDate(now) }
  for (const place of places) {
    if (!place || typeof place.townKey !== 'string' || !place.townKey) continue
    const town = (doc.towns[place.townKey] ??= {
      town: place.town ?? place.townKey,
      areaKey: place.areaKey ?? null,
      region: place.region ?? '',
      countryCode: place.countryCode ?? '',
      count: 0,
    })
    town.count += 1
    if (typeof place.areaKey === 'string' && place.areaKey) {
      const area = (doc.areas[place.areaKey] ??= { area: place.area ?? place.areaKey, count: 0 })
      area.count += 1
    }
  }
  return doc
}

export async function rebuildPlaceIndex(db: Firestore, now: Date): Promise<RebuildSummary> {
  const events = await db.collection('events').where('purgeAt', '>', Timestamp.fromDate(now)).get()
  const summary: RebuildSummary = { events: {} }
  for (const event of events.docs) {
    const pins = await db
      .collection('pins')
      .where('eventId', '==', event.id)
      .where('status', '==', 'ACTIVE')
      .select('place')
      .get()
    const index = buildPlaceIndex(
      pins.docs.map((d) => d.get('place') as Partial<PinPlace> | undefined),
      now,
    )
    await db.doc(`placeIndex/${event.id}`).set(index)
    summary.events[event.id] = pins.size
  }
  return summary
}
