import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'

const authState = { uid: ref<string | null>('me') }
const pinsMock = { patchPin: vi.fn(), forgetPin: vi.fn() }

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get uid() {
      return authState.uid.value
    },
  }),
}))
vi.mock('@/stores/pins', () => ({ usePinsStore: () => pinsMock }))
vi.mock('@/services/voteWrites', async () => {
  const actual = await vi.importActual<typeof import('@/services/voteWrites')>('@/services/voteWrites')
  return { ...actual, castVote: vi.fn(), reportPin: vi.fn(), fetchMyVote: vi.fn(), fetchHasReported: vi.fn() }
})
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/services/firebase', () => ({ functions: {}, db: {} }))

import {
  castVote,
  fetchHasReported,
  fetchMyVote,
  reportPin,
  VoteWriteError,
  type CastVoteResult,
} from '@/services/voteWrites'
import { useVotesStore } from '@/stores/votes'
import type { Vote } from '@/types/models'

const mockCast = vi.mocked(castVote)
const mockReport = vi.mocked(reportPin)
const mockMyVote = vi.mocked(fetchMyVote)
const mockReported = vi.mocked(fetchHasReported)

const PIN = { id: 'seedUser01_HALLOWEEN_2026', voteRound: 1 }

function result(over: Partial<CastVoteResult> = {}): CastVoteResult {
  return {
    pinId: PIN.id,
    myVote: 'HERE',
    counted: true,
    hereVotes: 3,
    notThereVotes: 0,
    verified: true,
    status: 'ACTIVE',
    ...over,
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useVotesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    authState.uid.value = 'me'
    mockMyVote.mockResolvedValue(null)
    mockReported.mockResolvedValue(false)
  })

  it('loads my vote for the current round and my report', async () => {
    mockMyVote.mockResolvedValue({ value: 'NOT_THERE', round: 1, counted: true } as Vote)
    mockReported.mockResolvedValue(true)
    const store = useVotesStore()
    await store.load(PIN)
    expect(mockMyVote).toHaveBeenCalledWith(PIN.id, 'me')
    expect(store.state(PIN.id)).toMatchObject({ myVote: 'NOT_THERE', reported: true, loaded: true, round: 1 })
    // Cached per round.
    await store.load(PIN)
    expect(mockMyVote).toHaveBeenCalledTimes(1)
  })

  it('a vote from an older round shows as no vote', async () => {
    mockMyVote.mockResolvedValue({ value: 'HERE', round: 0, counted: true } as Vote)
    const store = useVotesStore()
    await store.load(PIN)
    expect(store.state(PIN.id)?.myVote).toBeNull()
  })

  it('re-reads when the vote round changes (photo changed)', async () => {
    const store = useVotesStore()
    await store.load(PIN)
    await store.load({ ...PIN, voteRound: 2 })
    expect(mockMyVote).toHaveBeenCalledTimes(2)
  })

  it('does nothing when signed out', async () => {
    authState.uid.value = null
    const store = useVotesStore()
    await store.load(PIN)
    expect(mockMyVote).not.toHaveBeenCalled()
    await expect(store.vote(PIN, 'HERE')).rejects.toMatchObject({ reason: 'UNAUTHENTICATED' })
    expect(mockCast).not.toHaveBeenCalled()
  })

  it('a read failure is kept as error, never thrown', async () => {
    mockMyVote.mockRejectedValue(new Error('offline'))
    const store = useVotesStore()
    await expect(store.load(PIN)).resolves.toBeUndefined()
    expect(store.state(PIN.id)?.error).toBeInstanceOf(Error)
    expect(store.state(PIN.id)?.loading).toBe(false)
  })

  it('votes optimistically, then applies the counts from the result', async () => {
    const store = useVotesStore()
    await store.load(PIN)
    const d = deferred<CastVoteResult>()
    mockCast.mockReturnValue(d.promise)
    const p = store.vote(PIN, 'HERE')
    expect(store.state(PIN.id)).toMatchObject({ myVote: 'HERE', busy: 'vote' })
    d.resolve(result())
    await expect(p).resolves.toEqual({ gone: false })
    expect(mockCast).toHaveBeenCalledWith({ pinId: PIN.id, value: 'HERE' })
    expect(pinsMock.patchPin).toHaveBeenCalledWith(PIN.id, {
      hereVotes: 3,
      notThereVotes: 0,
      verified: true,
      status: 'ACTIVE',
    })
    expect(store.state(PIN.id)).toMatchObject({ myVote: 'HERE', busy: null, uncounted: false })
  })

  it('rolls back the highlight on error and rethrows a VoteWriteError', async () => {
    mockMyVote.mockResolvedValue({ value: 'HERE', round: 1, counted: true } as Vote)
    const store = useVotesStore()
    await store.load(PIN)
    mockCast.mockRejectedValue(new VoteWriteError('BETA_ONLY'))
    const err = await store.vote(PIN, 'NOT_THERE').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VoteWriteError)
    expect((err as VoteWriteError).message).toBe('Porchlight is in private beta — voting opens soon.')
    expect(store.state(PIN.id)).toMatchObject({ myVote: 'HERE', busy: null })
    expect(pinsMock.patchPin).not.toHaveBeenCalled()
    expect(pinsMock.forgetPin).not.toHaveBeenCalled()
  })

  it('the same vote again is a no-op', async () => {
    mockMyVote.mockResolvedValue({ value: 'HERE', round: 1, counted: true } as Vote)
    const store = useVotesStore()
    await store.load(PIN)
    await store.vote(PIN, 'HERE')
    expect(mockCast).not.toHaveBeenCalled()
  })

  it('ignores taps while a vote is in flight', async () => {
    const store = useVotesStore()
    await store.load(PIN)
    const d = deferred<CastVoteResult>()
    mockCast.mockReturnValue(d.promise)
    const first = store.vote(PIN, 'HERE')
    await store.vote(PIN, 'NOT_THERE')
    expect(mockCast).toHaveBeenCalledTimes(1)
    d.resolve(result())
    await first
  })

  it('flags an uncounted vote (new email-link account)', async () => {
    const store = useVotesStore()
    mockCast.mockResolvedValue(result({ counted: false, hereVotes: 0, verified: false }))
    await store.vote(PIN, 'HERE')
    expect(store.state(PIN.id)?.uncounted).toBe(true)
    store.dismissUncounted(PIN.id)
    expect(store.state(PIN.id)?.uncounted).toBe(false)
  })

  it('a vote that hides the pin drops it from the list and map', async () => {
    const store = useVotesStore()
    mockCast.mockResolvedValue(result({ myVote: 'NOT_THERE', hereVotes: 0, notThereVotes: 3, verified: false, status: 'HIDDEN' }))
    await expect(store.vote(PIN, 'NOT_THERE')).resolves.toEqual({ gone: true })
    expect(pinsMock.forgetPin).toHaveBeenCalledWith(PIN.id)
    expect(pinsMock.patchPin).not.toHaveBeenCalled()
  })

  it('NOT_VOTABLE / NOT_FOUND drop the pin too', async () => {
    const store = useVotesStore()
    mockCast.mockRejectedValue(new VoteWriteError('NOT_VOTABLE'))
    await expect(store.vote(PIN, 'HERE')).rejects.toMatchObject({ reason: 'NOT_VOTABLE' })
    expect(pinsMock.forgetPin).toHaveBeenCalledWith(PIN.id)
    expect(store.state(PIN.id)?.myVote).toBeNull()
  })

  it('reports once; the button state becomes reported', async () => {
    const store = useVotesStore()
    mockReport.mockResolvedValue({ pinId: PIN.id, counted: true, hidden: false })
    await expect(store.report(PIN, 'SPAM')).resolves.toEqual({ gone: false })
    expect(mockReport).toHaveBeenCalledWith({ pinId: PIN.id, reason: 'SPAM' })
    expect(store.state(PIN.id)?.reported).toBe(true)
    expect(pinsMock.forgetPin).not.toHaveBeenCalled()
  })

  it('a report that hides the pin drops it', async () => {
    const store = useVotesStore()
    mockReport.mockResolvedValue({ pinId: PIN.id, counted: true, hidden: true })
    await expect(store.report(PIN, 'INAPPROPRIATE')).resolves.toEqual({ gone: true })
    expect(pinsMock.forgetPin).toHaveBeenCalledWith(PIN.id)
  })

  it('ALREADY_REPORTED marks it reported and rethrows', async () => {
    const store = useVotesStore()
    mockReport.mockRejectedValue(new VoteWriteError('ALREADY_REPORTED'))
    await expect(store.report(PIN, 'SPAM')).rejects.toMatchObject({ reason: 'ALREADY_REPORTED' })
    expect(store.state(PIN.id)?.reported).toBe(true)
  })

  it('forgets every vote when the user changes', async () => {
    mockMyVote.mockResolvedValue({ value: 'HERE', round: 1, counted: true } as Vote)
    const store = useVotesStore()
    await store.load(PIN)
    expect(store.state(PIN.id)?.myVote).toBe('HERE')
    authState.uid.value = 'someoneElse'
    await nextTick()
    expect(store.state(PIN.id)).toBeNull()
  })

  it('ignores a load that finishes after the user changed', async () => {
    const d = deferred<Vote | null>()
    mockMyVote.mockReturnValue(d.promise)
    const store = useVotesStore()
    const p = store.load(PIN)
    authState.uid.value = 'someoneElse'
    await nextTick()
    d.resolve({ value: 'HERE', round: 1, counted: true } as Vote)
    await p
    expect(store.state(PIN.id)).toBeNull()
  })
})
