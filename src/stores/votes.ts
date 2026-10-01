// The signed-in user's vote and report on each pin they open (SPEC F3/F7/F8).
// Reads pins/{pinId}/votes/{uid} and reports/{uid}; writes go through the
// castVote / reportPin callables. The vote shows optimistically and rolls
// back on error; counts and Verified come from the callable's result.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  castVote,
  currentVote,
  fetchHasReported,
  fetchMyVote,
  reportPin,
  toVoteWriteError,
  VoteWriteError,
} from '@/services/voteWrites'
import type { Pin, ReportReason, VoteValue } from '@/types/models'
import { useAuthStore } from './auth'
import { usePinsStore } from './pins'

export interface PinVoteState {
  /** The caller's vote in the pin's current round (null = no vote). */
  myVote: VoteValue | null
  reported: boolean
  /** The vote round `myVote` was read for. */
  round: number
  loaded: boolean
  loading: boolean
  /** Reading the vote/report failed (buttons still work). */
  error: unknown
  /** A write in flight; the buttons are disabled meanwhile. */
  busy: 'vote' | 'report' | null
  /** The last vote didn't count yet (new email-link account). */
  uncounted: boolean
}

export interface WriteOutcome {
  /** The pin left ACTIVE (hidden by votes/reports, or under review): close the sheet. */
  gone: boolean
}

function blank(round: number): PinVoteState {
  return { myVote: null, reported: false, round, loaded: false, loading: false, error: null, busy: null, uncounted: false }
}

/** Errors meaning the pin is no longer public for anyone. */
const GONE_REASONS = new Set(['NOT_FOUND', 'NOT_VOTABLE'])

export const useVotesStore = defineStore('votes', () => {
  const auth = useAuthStore()
  const pins = usePinsStore()

  const byPin = ref<Record<string, PinVoteState>>({})
  /** Bumped when the user changes, so loads that finish late are ignored. */
  let generation = 0

  function state(pinId: string): PinVoteState | null {
    return byPin.value[pinId] ?? null
  }

  function entry(pinId: string, round: number): PinVoteState {
    const existing = byPin.value[pinId]
    if (existing) return existing
    byPin.value[pinId] = blank(round)
    return byPin.value[pinId]!
  }

  /** Reads the caller's vote/report for a pin once per vote round (`force` re-reads). Never rejects. */
  async function load(pin: Pick<Pin, 'id' | 'voteRound'>, force = false): Promise<void> {
    const uid = auth.uid
    if (!uid) return
    const s = entry(pin.id, pin.voteRound)
    if (s.busy) return
    if (s.loading || (!force && s.loaded && s.round === pin.voteRound)) return
    const gen = generation
    s.loading = true
    s.error = null
    try {
      const [vote, reported] = await Promise.all([fetchMyVote(pin.id, uid), fetchHasReported(pin.id, uid)])
      if (gen !== generation) return
      const cur = byPin.value[pin.id]
      if (!cur || cur.busy) return
      cur.myVote = currentVote(vote, pin.voteRound)
      cur.reported = reported
      cur.round = pin.voteRound
      cur.loaded = true
    } catch (e) {
      if (gen === generation && byPin.value[pin.id]) byPin.value[pin.id]!.error = e
    } finally {
      if (gen === generation && byPin.value[pin.id]) byPin.value[pin.id]!.loading = false
    }
  }

  /**
   * Casts or changes the caller's vote. The highlight moves at once and rolls
   * back on error. Rejects with VoteWriteError. Same value again is a no-op.
   */
  async function vote(pin: Pick<Pin, 'id' | 'voteRound'>, value: VoteValue): Promise<WriteOutcome> {
    if (!auth.uid) throw new VoteWriteError('UNAUTHENTICATED')
    const s = entry(pin.id, pin.voteRound)
    if (s.busy) return { gone: false }
    if (s.myVote === value && s.loaded) return { gone: false }
    const gen = generation
    const previous = s.myVote
    s.myVote = value
    s.busy = 'vote'
    try {
      const res = await castVote({ pinId: pin.id, value })
      if (gen !== generation) return { gone: false }
      s.myVote = res.myVote
      s.round = pin.voteRound
      s.loaded = true
      s.uncounted = !res.counted
      const patch = {
        hereVotes: res.hereVotes,
        notThereVotes: res.notThereVotes,
        verified: res.verified,
        status: res.status,
      }
      if (res.status !== 'ACTIVE') {
        forget(pin.id)
        return { gone: true }
      }
      pins.patchPin(pin.id, patch)
      return { gone: false }
    } catch (e) {
      const err = toVoteWriteError(e)
      if (gen === generation) s.myVote = previous
      if (GONE_REASONS.has(err.reason)) forget(pin.id)
      throw err
    } finally {
      s.busy = null
    }
  }

  /** Reports the pin (can't be undone). Rejects with VoteWriteError. */
  async function report(pin: Pick<Pin, 'id' | 'voteRound'>, reason: ReportReason): Promise<WriteOutcome> {
    if (!auth.uid) throw new VoteWriteError('UNAUTHENTICATED')
    const s = entry(pin.id, pin.voteRound)
    if (s.busy) return { gone: false }
    const gen = generation
    s.busy = 'report'
    try {
      const res = await reportPin({ pinId: pin.id, reason })
      if (gen !== generation) return { gone: false }
      s.reported = true
      if (res.hidden) {
        forget(pin.id)
        return { gone: true }
      }
      return { gone: false }
    } catch (e) {
      const err = toVoteWriteError(e)
      if (gen === generation && err.reason === 'ALREADY_REPORTED') s.reported = true
      if (GONE_REASONS.has(err.reason)) forget(pin.id)
      throw err
    } finally {
      s.busy = null
    }
  }

  /** The pin isn't public any more: drop it from the visible list/map. */
  function forget(pinId: string): void {
    pins.forgetPin(pinId)
  }

  function dismissUncounted(pinId: string): void {
    const s = byPin.value[pinId]
    if (s) s.uncounted = false
  }

  // A different (or no) user: forget every vote.
  watch(
    () => auth.uid,
    () => {
      generation++
      byPin.value = {}
    },
  )

  return { byPin, state, load, vote, report, dismissUncounted }
})
