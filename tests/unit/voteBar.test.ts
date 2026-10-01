// VoteBar / ReportButton / BetaBadge in the DOM (SPEC F3/F7/F8, §5 beta badge).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { computed, ref } from 'vue'
import { IonicVue } from '@ionic/vue'

const uid = ref<string | null>('me')
const push = vi.fn()
const toasts: { message: string; color?: string }[] = []
let pickedReason: string | null = 'SPAM'
const pinsMock = { patchPin: vi.fn(), forgetPin: vi.fn() }

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get uid() {
      return uid.value
    },
    get isSignedIn() {
      return !!uid.value
    },
  }),
}))
vi.mock('@/stores/pins', () => ({ usePinsStore: () => pinsMock }))
vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual<typeof import('@ionic/vue')>('@ionic/vue')
  return {
    ...actual,
    toastController: {
      create: vi.fn(async (opts: { message: string; color?: string }) => {
        toasts.push({ message: opts.message, color: opts.color })
        return { present: vi.fn() }
      }),
    },
    actionSheetController: {
      create: vi.fn(async () => ({
        present: vi.fn(),
        onDidDismiss: async () =>
          pickedReason ? { data: pickedReason, role: undefined } : { data: undefined, role: 'cancel' },
      })),
    },
  }
})
vi.mock('@/services/voteWrites', async () => {
  const actual = await vi.importActual<typeof import('@/services/voteWrites')>('@/services/voteWrites')
  return { ...actual, castVote: vi.fn(), reportPin: vi.fn(), fetchMyVote: vi.fn(), fetchHasReported: vi.fn() }
})
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/services/firebase', () => ({ functions: {}, db: {} }))
const launchMode = ref<'BETA' | 'LIVE'>('BETA')
vi.mock('@/stores/appConfig', () => ({
  useAppConfigStore: () => ({ config: computed(() => ({ launchMode: launchMode.value })).value }),
}))

import { castVote, fetchHasReported, fetchMyVote, reportPin, VoteWriteError } from '@/services/voteWrites'
import VoteBar from '@/components/pin/VoteBar.vue'
import BetaBadge from '@/components/common/BetaBadge.vue'
import type { Pin, Vote } from '@/types/models'

const mockCast = vi.mocked(castVote)
const mockReport = vi.mocked(reportPin)
const mockMyVote = vi.mocked(fetchMyVote)
const mockReported = vi.mocked(fetchHasReported)

const PIN = { id: 'seedUser01_HALLOWEEN_2026', voteRound: 0, ownerId: 'seedUser01', status: 'ACTIVE' } as Pin

function mountBar() {
  return mount(VoteBar, { props: { pin: PIN }, global: { plugins: [IonicVue] } })
}

const here = (w: ReturnType<typeof mountBar>) => w.get('[data-testid="vote-here"]')
const notThere = (w: ReturnType<typeof mountBar>) => w.get('[data-testid="vote-not-there"]')

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  toasts.length = 0
  uid.value = 'me'
  pickedReason = 'SPAM'
  mockMyVote.mockResolvedValue(null)
  mockReported.mockResolvedValue(false)
})

describe('VoteBar', () => {
  it('signed out: shows "Sign in to vote"; the buttons go to /sign-in', async () => {
    uid.value = null
    const w = mountBar()
    await flushPromises()
    expect(w.text()).toContain('Sign in to vote')
    expect(w.get('#vote-question').text()).toBe('Did you see it?')
    await here(w).trigger('click')
    expect(push).toHaveBeenCalledWith('/sign-in')
    await w.get('[data-testid="sign-in-to-vote"]').trigger('click')
    await w.get('[data-testid="report"]').trigger('click')
    expect(push).toHaveBeenCalledTimes(3)
    expect(mockCast).not.toHaveBeenCalled()
    expect(mockMyVote).not.toHaveBeenCalled()
  })

  it('highlights my current vote', async () => {
    mockMyVote.mockResolvedValue({ value: 'NOT_THERE', round: 0, counted: true } as Vote)
    const w = mountBar()
    await flushPromises()
    expect(notThere(w).attributes('data-selected')).toBe('true')
    expect((notThere(w).element as HTMLElement & { fill?: string }).fill).toBe('solid')
    expect(here(w).attributes('data-selected')).toBe('false')
    expect(w.text()).toContain("You said it's not there.")
    expect(w.text()).not.toContain('Sign in to vote')
  })

  it('votes, and shows the gentle note when the vote did not count', async () => {
    mockCast.mockResolvedValue({
      pinId: PIN.id,
      myVote: 'HERE',
      counted: false,
      hereVotes: 0,
      notThereVotes: 0,
      verified: false,
      status: 'ACTIVE',
    })
    const w = mountBar()
    await flushPromises()
    await here(w).trigger('click')
    await flushPromises()
    expect(mockCast).toHaveBeenCalledWith({ pinId: PIN.id, value: 'HERE' })
    expect(here(w).attributes('data-selected')).toBe('true')
    expect(w.get('[data-testid="vote-uncounted"]').text()).toBe(
      "Thanks — your vote is saved. Votes from accounts less than a day old aren't added to the count.",
    )
  })

  it('rolls back and shows the friendly error', async () => {
    mockCast.mockRejectedValue(new VoteWriteError('BETA_ONLY'))
    const w = mountBar()
    await flushPromises()
    await here(w).trigger('click')
    await flushPromises()
    expect(here(w).attributes('data-selected')).toBe('false')
    expect(toasts).toContainEqual({ message: 'Porchlight is in private beta — voting opens soon.', color: 'danger' })
    expect(w.emitted('gone')).toBeUndefined()
  })

  it('NOT_VOTABLE: "not taking votes" and the sheet closes', async () => {
    mockCast.mockRejectedValue(new VoteWriteError('NOT_VOTABLE'))
    const w = mountBar()
    await flushPromises()
    await notThere(w).trigger('click')
    await flushPromises()
    expect(toasts.map((t) => t.message)).toContain("This display isn't taking votes right now.")
    expect(w.emitted('gone')).toHaveLength(1)
  })

  it('a vote that hides the pin closes the sheet', async () => {
    mockCast.mockResolvedValue({
      pinId: PIN.id,
      myVote: 'NOT_THERE',
      counted: true,
      hereVotes: 0,
      notThereVotes: 3,
      verified: false,
      status: 'HIDDEN',
    })
    const w = mountBar()
    await flushPromises()
    await notThere(w).trigger('click')
    await flushPromises()
    expect(w.emitted('gone')).toHaveLength(1)
    expect(pinsMock.forgetPin).toHaveBeenCalledWith(PIN.id)
  })
})

describe('VoteBar report placement', () => {
  it(':report="false" leaves the Report button to the sheet', async () => {
    const w = mount(VoteBar, { props: { pin: PIN, report: false }, global: { plugins: [IonicVue] } })
    await flushPromises()
    expect(w.find('[data-testid="report"]').exists()).toBe(false)
    expect(w.find('[data-testid="vote-here"]').exists()).toBe(true)
  })
})

describe('ReportButton', () => {
  it('picks a reason, reports, thanks, and becomes "Reported"', async () => {
    mockReport.mockResolvedValue({ pinId: PIN.id, counted: true, hidden: false })
    const w = mountBar()
    await flushPromises()
    const btn = w.get('[data-testid="report"]')
    expect(btn.text()).toBe('Report')
    await btn.trigger('click')
    await flushPromises()
    expect(mockReport).toHaveBeenCalledWith({ pinId: PIN.id, reason: 'SPAM' })
    expect(toasts.map((t) => t.message)).toContain("Thanks, we'll take a look.")
    expect(w.get('[data-testid="report"]').text()).toBe('Reported')
    expect((w.get('[data-testid="report"]').element as HTMLElement & { disabled?: boolean }).disabled).toBe(true)
  })

  it('cancelling the picker does nothing', async () => {
    pickedReason = null
    const w = mountBar()
    await flushPromises()
    await w.get('[data-testid="report"]').trigger('click')
    await flushPromises()
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('shows "Reported" when I reported it before', async () => {
    mockReported.mockResolvedValue(true)
    const w = mountBar()
    await flushPromises()
    expect(w.get('[data-testid="report"]').text()).toBe('Reported')
  })

  it('a report that hides the pin closes the sheet', async () => {
    mockReport.mockResolvedValue({ pinId: PIN.id, counted: true, hidden: true })
    const w = mountBar()
    await flushPromises()
    await w.get('[data-testid="report"]').trigger('click')
    await flushPromises()
    expect(w.emitted('gone')).toHaveLength(1)
  })
})

describe('BetaBadge', () => {
  it('shows in BETA only', async () => {
    launchMode.value = 'BETA'
    const beta = mount(BetaBadge, { global: { plugins: [IonicVue] } })
    expect(beta.text()).toBe('Beta')
    launchMode.value = 'LIVE'
    const live = mount(BetaBadge, { global: { plugins: [IonicVue] } })
    expect(live.find('[data-testid="beta-badge"]').exists()).toBe(false)
  })
})
