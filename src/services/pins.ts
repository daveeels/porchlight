// Pin reads (SPEC F1/F2, CLAUDE.md rule 7). Every query filters
// eventId == id AND status == 'ACTIVE' (the read rules require the latter).
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  endAt,
  startAfter,
  startAt,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import type { DisplayPin, EventId, Pin } from '@/types/models'
import { db } from './firebase'

export const PAGE_SIZE = 20
export const CELL_LIMIT = 200

export type PageCursor = QueryDocumentSnapshot | null

export interface PlacePage {
  pins: Pin[]
  cursor: PageCursor
  done: boolean
}

function toPin(snap: DocumentSnapshot): Pin {
  return { ...(snap.data() as DisplayPin), id: snap.id }
}

function activeIn(eventId: EventId): QueryConstraint[] {
  return [where('eventId', '==', eventId), where('status', '==', 'ACTIVE')]
}

/** One page of an area or town list, rankScore desc (verified first). */
export async function fetchPlacePage(
  eventId: EventId,
  sel: { kind: 'area' | 'town'; key: string },
  cursor: PageCursor,
  pageSize = PAGE_SIZE,
): Promise<PlacePage> {
  const field = sel.kind === 'area' ? 'place.areaKey' : 'place.townKey'
  const constraints: QueryConstraint[] = [
    ...activeIn(eventId),
    where(field, '==', sel.key),
    orderBy('rankScore', 'desc'),
  ]
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(pageSize))
  const snap = await getDocs(query(collection(db, 'pins'), ...constraints))
  return {
    pins: snap.docs.map(toPin),
    cursor: snap.docs[snap.docs.length - 1] ?? cursor,
    done: snap.docs.length < pageSize,
  }
}

/** All ACTIVE pins in one fixed geohash cell, capped at CELL_LIMIT. */
export async function fetchCellPins(
  eventId: EventId,
  cell: string,
): Promise<{ pins: Pin[]; truncated: boolean }> {
  const q = query(
    collection(db, 'pins'),
    ...activeIn(eventId),
    orderBy('geohash'),
    startAt(cell),
    endAt(cell + '~'),
    limit(CELL_LIMIT),
  )
  const snap = await getDocs(q)
  return { pins: snap.docs.map(toPin), truncated: snap.docs.length >= CELL_LIMIT }
}

/** A single pin, or null if it doesn't exist or isn't readable (e.g. hidden). */
export async function fetchPin(pinId: string): Promise<Pin | null> {
  try {
    const snap = await getDoc(doc(db, 'pins', pinId))
    return snap.exists() ? toPin(snap) : null
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'permission-denied') return null
    throw e
  }
}
