// Vote / report thresholds (SPEC §4 F7–F8, §5 pins, §6 castVote/reportPin).
// Pure functions, no Firebase imports, so the client never duplicates them
// and they can be unit-tested directly.
import type { ReportReason, VoteValue } from './validation.js'

export type { ReportReason, VoteValue }

export type Decision = 'NONE' | 'APPROVED' | 'REJECTED'

/** Counted "It's here" votes needed for ✓ Verified. */
export const VERIFY_MIN_HERE = 3
/** Counted "Not there" votes / counted reports that hide a pin. */
export const HIDE_THRESHOLD = 3
/** Same, once an admin has approved the pin (so the next vote doesn't undo the approval). */
export const HIDE_THRESHOLD_APPROVED = 8

export function isVerified(hereVotes: number, notThereVotes: number): boolean {
  return hereVotes >= VERIFY_MIN_HERE && hereVotes >= 2 * notThereVotes
}

export interface RankInput {
  /** COMING_SOON pins list after every ready display. */
  stage?: 'COMING_SOON' | 'READY'
  isFeatured: boolean
  verified: boolean
  hereVotes: number
  notThereVotes: number
}

/** Below any ready display (ready scores can dip a little below 0 before hiding). */
export const COMING_SOON_RANK = -1_000_000

export function rankScoreOf(pin: RankInput): number {
  if (pin.stage === 'COMING_SOON') return COMING_SOON_RANK
  return (pin.isFeatured ? 100000 : 0) + (pin.verified ? 10000 : 0) + pin.hereVotes - pin.notThereVotes
}

export function hideThreshold(decision: Decision | undefined): number {
  return decision === 'APPROVED' ? HIDE_THRESHOLD_APPROVED : HIDE_THRESHOLD
}

/** F7: dropped from results when "not there" reaches the threshold and outnumbers "here". */
export function hiddenByNotThere(hereVotes: number, notThereVotes: number, decision: Decision | undefined): boolean {
  return notThereVotes >= hideThreshold(decision) && notThereVotes > hereVotes
}

/** F8: hidden once counted reports reach the threshold. */
export function hiddenByReports(reportsCount: number, decision: Decision | undefined): boolean {
  return reportsCount >= hideThreshold(decision)
}

/** The caller's vote in the pin's CURRENT round (an older-round vote is no vote). */
export interface CurrentVote {
  value: VoteValue
  counted: boolean
}

export interface VotablePin extends RankInput {
  moderation?: { decision?: Decision } | null
}

export interface VoteOutcome {
  /** Same value as the current vote: nothing to write. */
  noop: boolean
  counted: boolean
  hereVotes: number
  notThereVotes: number
  verified: boolean
  rankScore: number
  /** The F7 "not there" rule is met: the pin should go ACTIVE → HIDDEN. */
  hide: boolean
}

/**
 * SPEC §6 castVote steps 3–6. `counted` sticks with the current-round vote
 * when changing it, else it's `countedIfNew`. Only counted votes move the numbers.
 */
export function tallyVote(
  pin: VotablePin,
  current: CurrentVote | null,
  value: VoteValue,
  countedIfNew: boolean,
): VoteOutcome {
  const counted = current ? current.counted : countedIfNew
  let hereVotes = num(pin.hereVotes)
  let notThereVotes = num(pin.notThereVotes)
  const noop = current?.value === value
  if (!noop && counted) {
    if (current?.value === 'HERE') hereVotes = Math.max(0, hereVotes - 1)
    if (current?.value === 'NOT_THERE') notThereVotes = Math.max(0, notThereVotes - 1)
    if (value === 'HERE') hereVotes += 1
    else notThereVotes += 1
  }
  const verified = isVerified(hereVotes, notThereVotes)
  const rankScore = rankScoreOf({ stage: pin.stage, isFeatured: pin.isFeatured === true, verified, hereVotes, notThereVotes })
  const hide = !noop && counted && hiddenByNotThere(hereVotes, notThereVotes, pin.moderation?.decision)
  return { noop, counted, hereVotes, notThereVotes, verified, rankScore, hide }
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
