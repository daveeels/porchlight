// Votes and reports (SPEC F7/F8, §6 castVote / reportPin). Writes go through
// the callables; the client only reads its own vote/report doc (the rules
// allow request.auth.uid == {uid}). Server errors are HttpsErrors carrying
// details.reason; they're mapped to friendly copy here, like pinWrites.ts.
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc } from 'firebase/firestore'
import type { PinStatus, ReportReason, Vote, VoteValue } from '@/types/models'
import { db, functions } from './firebase'

export interface CastVoteInput {
  pinId: string
  value: VoteValue
}

export interface CastVoteResult {
  pinId: string
  myVote: VoteValue
  /** False for accounts that don't count yet (email link, < 24 h old). */
  counted: boolean
  hereVotes: number
  notThereVotes: number
  verified: boolean
  status: PinStatus
}

export interface ReportPinInput {
  pinId: string
  reason: ReportReason
}

export interface ReportPinResult {
  pinId: string
  counted: boolean
  /** The report pushed the pin over the threshold: it's no longer public. */
  hidden: boolean
}

export const REPORT_REASONS: readonly ReportReason[] = ['NOT_A_DISPLAY', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER']

/** Labels for the report reason picker. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  NOT_A_DISPLAY: "It isn't a display",
  INAPPROPRIATE: 'Inappropriate or offensive',
  PRIVACY: 'Shows private details (faces, house number, plates)',
  SPAM: 'Spam or advertising',
  OTHER: 'Something else',
}

/** Reasons the server sends in HttpsError details for castVote / reportPin. */
export const VOTE_SERVER_REASONS = [
  'BETA_ONLY',
  'BANNED',
  'RATE_LIMITED',
  'INVALID_INPUT',
  'NOT_FOUND',
  'OWN_PIN',
  'NOT_VOTABLE',
  'ALREADY_REPORTED',
  'NOT_ADMIN',
] as const
export type VoteServerReason = (typeof VOTE_SERVER_REASONS)[number]

/** Server reasons plus failures detected on the client. */
export type VoteWriteReason = VoteServerReason | 'UNAUTHENTICATED' | 'NETWORK' | 'UNKNOWN'

export const VOTE_WRITE_MESSAGES: Record<VoteWriteReason, string> = {
  BETA_ONLY: 'Porchlight is in private beta — voting opens soon.',
  BANNED: "This account can't vote or report displays.",
  RATE_LIMITED: "You've done that a lot today. Please try again tomorrow.",
  INVALID_INPUT: "That didn't work. Please try again.",
  NOT_FOUND: "This display isn't available any more.",
  OWN_PIN: "You can't vote on or report your own display.",
  NOT_VOTABLE: "This display isn't taking votes right now.",
  ALREADY_REPORTED: "You've already reported this display. Thanks, we'll take a look.",
  NOT_ADMIN: 'Only moderators can do that.',
  UNAUTHENTICATED: "You've been signed out. Sign in again to vote.",
  NETWORK: "You're offline or the connection dropped. Check your connection and try again.",
  UNKNOWN: 'Something went wrong. Please try again.',
}

export class VoteWriteError extends Error {
  constructor(
    readonly reason: VoteWriteReason,
    message: string = VOTE_WRITE_MESSAGES[reason],
  ) {
    super(message)
    this.name = 'VoteWriteError'
  }
}

function isServerReason(v: unknown): v is VoteServerReason {
  return typeof v === 'string' && (VOTE_SERVER_REASONS as readonly string[]).includes(v)
}

/** Fallback when an error has no recognised details.reason. */
function reasonForCode(code: string): VoteWriteReason {
  switch (code.replace(/^functions\//, '')) {
    case 'unauthenticated':
      return 'UNAUTHENTICATED'
    case 'resource-exhausted':
      return 'RATE_LIMITED'
    case 'already-exists':
      return 'ALREADY_REPORTED'
    case 'not-found':
      return 'NOT_FOUND'
    case 'invalid-argument':
      return 'INVALID_INPUT'
    case 'unavailable':
    case 'deadline-exceeded':
      return 'NETWORK'
    default:
      return 'UNKNOWN'
  }
}

/** Any error from castVote / reportPin → VoteWriteError with friendly copy. */
export function toVoteWriteError(e: unknown): VoteWriteError {
  if (e instanceof VoteWriteError) return e
  const err = (e ?? {}) as { code?: unknown; details?: unknown }
  const details = (err.details ?? {}) as { reason?: unknown }
  const reason = isServerReason(details.reason)
    ? details.reason
    : reasonForCode(typeof err.code === 'string' ? err.code : '')
  return new VoteWriteError(reason)
}

async function call<I, O>(name: string, input: I): Promise<O> {
  try {
    const res = await httpsCallable<I, O>(functions, name)(input)
    return res.data
  } catch (e) {
    throw toVoteWriteError(e)
  }
}

export function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  return call<CastVoteInput, CastVoteResult>('castVote', input)
}

export function reportPin(input: ReportPinInput): Promise<ReportPinResult> {
  return call<ReportPinInput, ReportPinResult>('reportPin', input)
}

/** A vote from an older round (the photo changed since) counts as no vote (F7). */
export function currentVote(vote: Pick<Vote, 'value' | 'round'> | null | undefined, voteRound: number): VoteValue | null {
  if (!vote || vote.round !== voteRound) return null
  return vote.value === 'HERE' || vote.value === 'NOT_THERE' ? vote.value : null
}

/** The caller's vote doc pins/{pinId}/votes/{uid}, or null. */
export async function fetchMyVote(pinId: string, uid: string): Promise<Vote | null> {
  const snap = await getDoc(doc(db, 'pins', pinId, 'votes', uid))
  return snap.exists() ? (snap.data() as Vote) : null
}

/** Whether the caller has reported the pin (pins/{pinId}/reports/{uid} exists). */
export async function fetchHasReported(pinId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'pins', pinId, 'reports', uid))
  return snap.exists()
}
