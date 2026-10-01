// Server-side shapes of pins/{pinId} and events/{eventId} (SPEC §5), using
// Admin SDK Timestamp/GeoPoint. Mirrors src/types/models.ts.
import type { GeoPoint, Timestamp } from 'firebase-admin/firestore'
import type { PinPlace } from '../lib/places.js'

export type Season = 'HALLOWEEN' | 'CHRISTMAS'
export type PinStatus = 'ACTIVE' | 'HIDDEN' | 'REMOVED' | 'ARCHIVED'
export type HiddenReason = 'REPORTS' | 'NOT_THERE'
export type RemovedBy = 'OWNER' | 'ADMIN'
export type ModerationDecision = 'NONE' | 'APPROVED' | 'REJECTED'

export interface HolidayEventDoc {
  season: Season
  seasonYear: number
  holidayDate: Timestamp
  submissionsOpenAt: Timestamp
  expiresAt: Timestamp
  purgeAt: Timestamp
  isActive: boolean
}

export interface PinDoc {
  ownerId: string
  eventId: string
  season: Season
  seasonYear: number
  title: string
  description: string | null
  photoPath: string
  thumbPath: string
  photoUrl: string
  thumbUrl: string
  geo: GeoPoint
  geohash: string
  place: PinPlace
  status: PinStatus
  hiddenReason: HiddenReason | null
  removedBy: RemovedBy | null
  consentAt: Timestamp
  voteRound: number
  hereVotes: number
  notThereVotes: number
  verified: boolean
  reportsCount: number
  rankScore: number
  isFeatured: boolean
  featuredUntil: Timestamp | null
  moderation: {
    decision: ModerationDecision
    reviewedBy: string | null
    reviewedAt: Timestamp | null
    note: string | null
  }
  createdAt: Timestamp
  updatedAt: Timestamp
  expiresAt: Timestamp
  purgeAt: Timestamp
}

/** One pin per user per event: the fixed doc ID (golden rule 9). */
export function pinIdFor(uid: string, eventId: string): string {
  return `${uid}_${eventId}`
}

// Threshold logic lives only in lib/thresholds.ts; re-exported for existing imports.
export { isVerified, rankScoreOf } from '../lib/thresholds.js'
