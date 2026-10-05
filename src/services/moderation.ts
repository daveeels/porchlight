// Admin moderation (SPEC §6 moderatePin; Phase 4 admin UI, early). Admins can
// read every pin and report (firestore.rules isAdmin); every change goes
// through the moderatePin callable, which checks the admin claim again.
import { collection, getDocs, limit, query, where, type QueryConstraint } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { EventId, Pin } from '@/types/models'
import { db, functions } from './firebase'

export type ReportReason = 'NOT_A_DISPLAY' | 'INAPPROPRIATE' | 'PRIVACY' | 'SPAM' | 'OTHER'
export type ModerationAction = 'APPROVE' | 'REMOVE' | 'RESTORE' | 'BAN_USER'

export interface PinReport {
  reason: ReportReason
  /** False for brand-new email-only accounts (doesn't count towards hiding). */
  counted: boolean
  createdAt: Date | null
}

export type QueueKind = 'HIDDEN' | 'REPORTED' | 'OWNER_DELETED' | 'REMOVED'

export interface QueueItem {
  kind: QueueKind
  pin: Pin
}

const QUEUE_LIMIT = 100

async function pinsWhere(...constraints: QueryConstraint[]): Promise<Pin[]> {
  const snap = await getDocs(query(collection(db, 'pins'), ...constraints, limit(QUEUE_LIMIT)))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Pin, 'id'>), id: d.id }))
}

/** What needs (or recently had) a look, for one season. */
export async function fetchModerationQueue(eventId: EventId): Promise<QueueItem[]> {
  const ev = where('eventId', '==', eventId)
  const [hidden, reported, removed] = await Promise.all([
    pinsWhere(ev, where('status', '==', 'HIDDEN')),
    // Single inequality, no composite index needed; status filtered below.
    pinsWhere(where('reportsCount', '>', 0)),
    pinsWhere(ev, where('status', '==', 'REMOVED')),
  ])
  const items: QueueItem[] = hidden.map((pin) => ({ kind: 'HIDDEN', pin }))
  for (const pin of reported) {
    if (pin.eventId === eventId && pin.status === 'ACTIVE') items.push({ kind: 'REPORTED', pin })
  }
  for (const pin of removed) {
    if (pin.removedBy === 'OWNER' && pin.hiddenReason === 'REPORTS') items.push({ kind: 'OWNER_DELETED', pin })
    else if (pin.removedBy === 'ADMIN') items.push({ kind: 'REMOVED', pin })
  }
  return items
}

export async function fetchReports(pinId: string): Promise<PinReport[]> {
  const snap = await getDocs(collection(db, 'pins', pinId, 'reports'))
  return snap.docs.map((d) => {
    const r = d.data()
    return {
      reason: r.reason as ReportReason,
      counted: r.counted === true,
      createdAt: typeof r.createdAt?.toDate === 'function' ? (r.createdAt.toDate() as Date) : null,
    }
  })
}

export async function moderatePin(pinId: string, action: ModerationAction, note: string | null = null): Promise<void> {
  await httpsCallable(functions, 'moderatePin')({ pinId, action, note })
}
