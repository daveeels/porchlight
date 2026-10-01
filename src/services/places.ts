// placeIndex/{eventId}: one doc listing every area and town with pins (SPEC §5).
import { doc, getDoc } from 'firebase/firestore'
import type { EventId, PlaceIndex } from '@/types/models'
import { db } from './firebase'

export async function fetchPlaceIndex(eventId: EventId): Promise<PlaceIndex | null> {
  const snap = await getDoc(doc(db, 'placeIndex', eventId))
  return snap.exists() ? (snap.data() as PlaceIndex) : null
}
