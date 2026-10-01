import { beforeEach, describe, expect, it, vi } from 'vitest'

const callable = vi.fn()
const getDocMock = vi.fn()
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_fns: unknown, name: string) => (input: unknown) => callable(name, input)),
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join('/')),
  getDoc: (ref: string) => getDocMock(ref),
}))
vi.mock('@/services/firebase', () => ({ functions: {}, db: {} }))

import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  VOTE_SERVER_REASONS,
  VOTE_WRITE_MESSAGES,
  VoteWriteError,
  castVote,
  currentVote,
  fetchHasReported,
  fetchMyVote,
  reportPin,
  toVoteWriteError,
} from '@/services/voteWrites'

function httpsError(code: string, message: string, reason?: string) {
  return Object.assign(new Error(message), { code: `functions/${code}`, details: reason ? { reason } : undefined })
}

const PIN_ID = 'seedUser01_HALLOWEEN_2026'

describe('toVoteWriteError', () => {
  it('maps every server reason to its own friendly message', () => {
    for (const reason of VOTE_SERVER_REASONS) {
      const e = toVoteWriteError(httpsError('failed-precondition', 'server text', reason))
      expect(e).toBeInstanceOf(VoteWriteError)
      expect(e.reason).toBe(reason)
      expect(e.message).toBe(VOTE_WRITE_MESSAGES[reason])
    }
  })

  it('uses the agreed copy for beta and not-votable pins', () => {
    expect(toVoteWriteError(httpsError('permission-denied', 'x', 'BETA_ONLY')).message).toBe(
      'Porchlight is in private beta — voting opens soon.',
    )
    expect(toVoteWriteError(httpsError('failed-precondition', 'x', 'NOT_VOTABLE')).message).toBe(
      "This display isn't taking votes right now.",
    )
  })

  it('falls back on the error code when there is no reason', () => {
    expect(toVoteWriteError(httpsError('unauthenticated', 'x')).reason).toBe('UNAUTHENTICATED')
    expect(toVoteWriteError(httpsError('resource-exhausted', 'x')).reason).toBe('RATE_LIMITED')
    expect(toVoteWriteError(httpsError('already-exists', 'x')).reason).toBe('ALREADY_REPORTED')
    expect(toVoteWriteError(httpsError('not-found', 'x')).reason).toBe('NOT_FOUND')
    expect(toVoteWriteError(httpsError('unavailable', 'x')).reason).toBe('NETWORK')
    expect(toVoteWriteError(httpsError('internal', 'internal')).reason).toBe('UNKNOWN')
  })

  it('never shows raw server text', () => {
    const e = toVoteWriteError(httpsError('invalid-argument', 'value must be HERE or NOT_THERE', 'INVALID_INPUT'))
    expect(e.message).toBe(VOTE_WRITE_MESSAGES.INVALID_INPUT)
  })

  it('handles odd values and passes VoteWriteErrors through', () => {
    expect(toVoteWriteError(null).reason).toBe('UNKNOWN')
    expect(toVoteWriteError('boom').reason).toBe('UNKNOWN')
    expect(toVoteWriteError(httpsError('internal', 'x', 'SOMETHING_NEW')).reason).toBe('UNKNOWN')
    const e = new VoteWriteError('OWN_PIN')
    expect(toVoteWriteError(e)).toBe(e)
  })

  it('has copy for every reason and a label for every report reason', () => {
    for (const msg of Object.values(VOTE_WRITE_MESSAGES)) expect(msg.length).toBeGreaterThan(10)
    expect(REPORT_REASONS).toEqual(['NOT_A_DISPLAY', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER'])
    for (const r of REPORT_REASONS) expect(REPORT_REASON_LABELS[r].length).toBeGreaterThan(3)
  })
})

describe('currentVote (F7 vote rounds)', () => {
  it('a vote from the current round counts', () => {
    expect(currentVote({ value: 'HERE', round: 2 }, 2)).toBe('HERE')
    expect(currentVote({ value: 'NOT_THERE', round: 0 }, 0)).toBe('NOT_THERE')
  })

  it('a vote from an older round is no vote', () => {
    expect(currentVote({ value: 'HERE', round: 1 }, 2)).toBeNull()
  })

  it('no doc, or a malformed value, is no vote', () => {
    expect(currentVote(null, 0)).toBeNull()
    expect(currentVote(undefined, 0)).toBeNull()
    expect(currentVote({ value: 'MAYBE' as never, round: 0 }, 0)).toBeNull()
  })
})

describe('callables', () => {
  beforeEach(() => {
    callable.mockReset()
  })

  it('castVote / reportPin call the named callable and return its data', async () => {
    const result = {
      pinId: PIN_ID,
      myVote: 'HERE',
      counted: true,
      hereVotes: 3,
      notThereVotes: 0,
      verified: true,
      status: 'ACTIVE',
    }
    callable.mockResolvedValue({ data: result })
    await expect(castVote({ pinId: PIN_ID, value: 'HERE' })).resolves.toEqual(result)
    expect(callable).toHaveBeenCalledWith('castVote', { pinId: PIN_ID, value: 'HERE' })

    callable.mockResolvedValue({ data: { pinId: PIN_ID, counted: true, hidden: false } })
    await expect(reportPin({ pinId: PIN_ID, reason: 'SPAM' })).resolves.toEqual({
      pinId: PIN_ID,
      counted: true,
      hidden: false,
    })
    expect(callable).toHaveBeenLastCalledWith('reportPin', { pinId: PIN_ID, reason: 'SPAM' })
  })

  it('reject with mapped VoteWriteErrors', async () => {
    callable.mockRejectedValue(httpsError('failed-precondition', 'x', 'OWN_PIN'))
    const err = await castVote({ pinId: PIN_ID, value: 'HERE' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VoteWriteError)
    expect((err as VoteWriteError).reason).toBe('OWN_PIN')
  })
})

describe('own vote / report reads', () => {
  beforeEach(() => {
    getDocMock.mockReset()
  })

  it('reads pins/{pinId}/votes/{uid}', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ value: 'HERE', round: 0, counted: true }) })
    await expect(fetchMyVote(PIN_ID, 'me')).resolves.toMatchObject({ value: 'HERE', round: 0 })
    expect(getDocMock).toHaveBeenCalledWith(`pins/${PIN_ID}/votes/me`)
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined })
    await expect(fetchMyVote(PIN_ID, 'me')).resolves.toBeNull()
  })

  it('reads pins/{pinId}/reports/{uid}', async () => {
    getDocMock.mockResolvedValue({ exists: () => true })
    await expect(fetchHasReported(PIN_ID, 'me')).resolves.toBe(true)
    expect(getDocMock).toHaveBeenCalledWith(`pins/${PIN_ID}/reports/me`)
    getDocMock.mockResolvedValue({ exists: () => false })
    await expect(fetchHasReported(PIN_ID, 'me')).resolves.toBe(false)
  })
})
