import { describe, expect, it } from 'vitest'
import { reasonOf } from '../../functions/src/lib/errors'
import {
  hiddenByNotThere,
  hiddenByReports,
  hideThreshold,
  isVerified,
  rankScoreOf,
  tallyVote,
  type VotablePin,
} from '../../functions/src/lib/thresholds'
import {
  parseCastVoteInput,
  parseModeratePinInput,
  parseNote,
  parseReportPinInput,
} from '../../functions/src/lib/validation'

const PIN_ID = 'abcdefghijklmnopqrstuvwxyz12_HALLOWEEN_2026'

function pin(over: Partial<VotablePin> = {}): VotablePin {
  return { isFeatured: false, verified: false, hereVotes: 0, notThereVotes: 0, moderation: { decision: 'NONE' }, ...over }
}

function reason(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (err) {
    return reasonOf(err)
  }
}

describe('thresholds', () => {
  it('verified = here >= 3 && here >= 2 × notThere', () => {
    expect(isVerified(2, 0)).toBe(false)
    expect(isVerified(3, 0)).toBe(true)
    expect(isVerified(4, 2)).toBe(true)
    expect(isVerified(5, 3)).toBe(false)
  })

  it('rankScore puts featured, then verified first', () => {
    expect(rankScoreOf({ isFeatured: false, verified: true, hereVotes: 3, notThereVotes: 1 })).toBe(10002)
    expect(rankScoreOf({ isFeatured: true, verified: false, hereVotes: 0, notThereVotes: 2 })).toBe(99998)
  })

  it('hide thresholds: 3, or 8 once approved', () => {
    expect(hideThreshold('NONE')).toBe(3)
    expect(hideThreshold(undefined)).toBe(3)
    expect(hideThreshold('APPROVED')).toBe(8)
    expect(hiddenByNotThere(2, 3, 'NONE')).toBe(true)
    expect(hiddenByNotThere(3, 3, 'NONE')).toBe(false) // must outnumber "here"
    expect(hiddenByNotThere(0, 7, 'APPROVED')).toBe(false)
    expect(hiddenByNotThere(0, 8, 'APPROVED')).toBe(true)
    expect(hiddenByReports(2, 'NONE')).toBe(false)
    expect(hiddenByReports(3, 'NONE')).toBe(true)
    expect(hiddenByReports(7, 'APPROVED')).toBe(false)
    expect(hiddenByReports(8, 'APPROVED')).toBe(true)
  })
})

describe('tallyVote', () => {
  it('a new counted vote adds to its counter', () => {
    expect(tallyVote(pin({ hereVotes: 2 }), null, 'HERE', true)).toEqual({
      noop: false,
      counted: true,
      hereVotes: 3,
      notThereVotes: 0,
      verified: true,
      rankScore: 10003,
      hide: false,
    })
  })

  it('changing a vote moves it between counters and keeps its counted flag', () => {
    const out = tallyVote(pin({ hereVotes: 3, notThereVotes: 1 }), { value: 'HERE', counted: true }, 'NOT_THERE', false)
    expect(out).toMatchObject({ counted: true, hereVotes: 2, notThereVotes: 2, verified: false })
  })

  it('an uncounted vote changes nothing, even when changed', () => {
    expect(tallyVote(pin({ hereVotes: 1 }), null, 'HERE', false)).toMatchObject({ counted: false, hereVotes: 1 })
    expect(tallyVote(pin({ hereVotes: 1 }), { value: 'HERE', counted: false }, 'NOT_THERE', true)).toMatchObject({
      counted: false,
      hereVotes: 1,
      notThereVotes: 0,
    })
  })

  it('the same vote again is a no-op', () => {
    expect(tallyVote(pin({ hereVotes: 1 }), { value: 'HERE', counted: true }, 'HERE', true)).toMatchObject({
      noop: true,
      hereVotes: 1,
    })
  })

  it('flags the F7 hide, using the approved threshold', () => {
    expect(tallyVote(pin({ notThereVotes: 2 }), null, 'NOT_THERE', true).hide).toBe(true)
    expect(tallyVote(pin({ notThereVotes: 2, moderation: { decision: 'APPROVED' } }), null, 'NOT_THERE', true).hide).toBe(
      false,
    )
    expect(tallyVote(pin({ notThereVotes: 2 }), null, 'NOT_THERE', false).hide).toBe(false)
  })

  it('keeps featured rank and never goes below zero', () => {
    expect(tallyVote(pin({ isFeatured: true }), { value: 'HERE', counted: true }, 'NOT_THERE', true)).toMatchObject({
      hereVotes: 0,
      notThereVotes: 1,
      rankScore: 99999,
    })
  })
})

describe('Phase 3 input parsing', () => {
  it('castVote', () => {
    expect(parseCastVoteInput({ pinId: PIN_ID, value: 'HERE' })).toEqual({ pinId: PIN_ID, value: 'HERE' })
    expect(reason(() => parseCastVoteInput({ pinId: PIN_ID, value: 'here' }))).toBe('INVALID_INPUT')
    expect(reason(() => parseCastVoteInput({ pinId: 'x', value: 'HERE' }))).toBe('INVALID_INPUT')
    expect(reason(() => parseCastVoteInput({ pinId: PIN_ID, value: 'HERE', round: 2 }))).toBe('INVALID_INPUT')
    expect(reason(() => parseCastVoteInput(null))).toBe('INVALID_INPUT')
  })

  it('reportPin', () => {
    for (const r of ['NOT_A_DISPLAY', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER']) {
      expect(parseReportPinInput({ pinId: PIN_ID, reason: r })).toEqual({ pinId: PIN_ID, reason: r })
    }
    expect(reason(() => parseReportPinInput({ pinId: PIN_ID, reason: 'toString' }))).toBe('INVALID_INPUT')
    expect(reason(() => parseReportPinInput({ pinId: PIN_ID }))).toBe('INVALID_INPUT')
  })

  it('moderatePin + note', () => {
    expect(parseModeratePinInput({ pinId: PIN_ID, action: 'BAN_USER' })).toEqual({
      pinId: PIN_ID,
      action: 'BAN_USER',
      note: null,
    })
    expect(parseNote('  ok  ')).toBe('ok')
    expect(parseNote('   ')).toBeNull()
    expect(reason(() => parseNote('a\u0000b'))).toBe('INVALID_INPUT')
    expect(reason(() => parseNote('x'.repeat(501)))).toBe('INVALID_INPUT')
    expect(reason(() => parseModeratePinInput({ pinId: PIN_ID, action: 'PURGE' }))).toBe('INVALID_INPUT')
  })
})
