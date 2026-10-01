// Client-side mirrors of the Firestore documents in SPEC §5. Keep in sync
// with the spec; if a field changes, change SPEC.md in the same commit.
import type { GeoPoint, Timestamp } from 'firebase/firestore'

export type Season = 'HALLOWEEN' | 'CHRISTMAS'
export const SEASONS: readonly Season[] = ['HALLOWEEN', 'CHRISTMAS']

/** e.g. 'HALLOWEEN_2026'. Christmas uses the year of Dec 25. */
export type EventId = `${Season}_${number}`

export type MapAccess = 'PUBLIC' | 'ACCOUNT' | 'PAID' | 'OFF'

/** config/app */
export interface AppConfig {
  mapAccess: MapAccess
  launchCenter: { lat: number; lng: number; zoom: number }
  defaultAreaKey: string | null
}

/** events/{eventId} */
export interface HolidayEvent {
  season: Season
  seasonYear: number
  holidayDate: Timestamp
  submissionsOpenAt: Timestamp
  expiresAt: Timestamp
  purgeAt: Timestamp
  isActive: boolean
}

export type PinStatus = 'ACTIVE' | 'HIDDEN' | 'REMOVED' | 'ARCHIVED'
export type HiddenReason = 'REPORTS' | 'NOT_THERE'
export type RemovedBy = 'OWNER' | 'ADMIN'
export type ModerationDecision = 'NONE' | 'APPROVED' | 'REJECTED'

export interface PinPlace {
  areaKey: string | null
  area: string | null
  townKey: string
  town: string
  region: string
  countryCode: string
}

/** pins/{pinId} — every field is server-written. */
export interface DisplayPin {
  ownerId: string
  eventId: EventId
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

/** A pin as used in the UI: document data plus its id. */
export type Pin = DisplayPin & { id: string }

export type VoteValue = 'HERE' | 'NOT_THERE'

/** pins/{pinId}/votes/{uid} */
export interface Vote {
  value: VoteValue
  counted: boolean
  round: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type ReportReason = 'NOT_A_DISPLAY' | 'INAPPROPRIATE' | 'PRIVACY' | 'SPAM' | 'OTHER'

/** placeIndex/{eventId} */
export interface PlaceIndex {
  areas: Record<string, { area: string; count: number }>
  towns: Record<
    string,
    { town: string; areaKey: string | null; region: string; countryCode: string; count: number }
  >
  updatedAt: Timestamp
}

/** What the Explore list is currently showing. */
export type PlaceSelection =
  | { kind: 'area'; key: string }
  | { kind: 'town'; key: string }
  | { kind: 'nearMe'; lat: number; lng: number }
