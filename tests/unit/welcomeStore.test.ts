import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'

const authState = { uid: ref<string | null>(null) }

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get uid() {
      return authState.uid.value
    },
    get isSignedIn() {
      return !!authState.uid.value
    },
  }),
}))
vi.mock('@/services/terms', () => ({
  fetchTermsRecord: vi.fn(),
  acceptTerms: vi.fn(),
  acceptTermsErrorMessage: () => "Couldn't save that. Please try again.",
}))

import { TERMS_VERSION } from '@/config/terms'
import { welcomeCard } from '@/config/welcome'
import { fetchTermsRecord } from '@/services/terms'
import { useTermsStore } from '@/stores/terms'
import {
  WELCOME_MEMBER_SEEN_KEY,
  WELCOME_SEEN_KEY,
  finishLabel,
  hasSeen,
  markSeen,
  resetSeenThisLoad,
  stepsFor,
  useWelcomeStore,
} from '@/stores/welcome'

const mockFetch = vi.mocked(fetchTermsRecord)

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
}

/** Both stores, as App.vue creates them (rules modal + welcome). */
function stores() {
  const terms = useTermsStore()
  const welcome = useWelcomeStore()
  return { terms, welcome }
}

async function signIn(uid = 'user1'): Promise<void> {
  authState.uid.value = uid
  await settle()
}

function blockStorage(): void {
  const fail = (): never => {
    throw new Error('blocked')
  }
  vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail, clear: fail })
}

describe('welcome seen flags', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSeenThisLoad()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('are remembered in localStorage', () => {
    expect(hasSeen(WELCOME_SEEN_KEY)).toBe(false)
    markSeen(WELCOME_SEEN_KEY)
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe('seen')
    resetSeenThisLoad() // a new page load
    expect(hasSeen(WELCOME_SEEN_KEY)).toBe(true)
    expect(hasSeen(WELCOME_MEMBER_SEEN_KEY)).toBe(false)
  })

  it('last for the page load when storage throws', () => {
    blockStorage()
    expect(hasSeen(WELCOME_SEEN_KEY)).toBe(false)
    expect(() => markSeen(WELCOME_SEEN_KEY)).not.toThrow()
    expect(hasSeen(WELCOME_SEEN_KEY)).toBe(true)
    resetSeenThisLoad()
    expect(hasSeen(WELCOME_SEEN_KEY)).toBe(false)
  })
})

describe('welcome steps and labels', () => {
  it('visitor: cards 1–3; member: card 4 alone; reopen: 1–3, plus 4 when signed in', () => {
    expect(stepsFor('first', { signedIn: false })).toEqual(['find', 'search', 'vote'])
    expect(stepsFor('first', { signedIn: true })).toEqual(['find', 'search', 'vote'])
    expect(stepsFor('first', { signedIn: true, withMember: true })).toEqual(['find', 'search', 'vote', 'add'])
    expect(stepsFor('member', { signedIn: true })).toEqual(['add'])
    expect(stepsFor('reopen', { signedIn: false })).toEqual(['find', 'search', 'vote'])
    expect(stepsFor('reopen', { signedIn: true })).toEqual(['find', 'search', 'vote', 'add'])
  })

  it('the last button says where it goes', () => {
    expect(finishLabel('first', 'vote', false)).toBe("Let's go")
    expect(finishLabel('first', 'vote', true)).toBe("Let's go")
    expect(finishLabel('first', 'add', true)).toBe('Next: community rules')
    expect(finishLabel('member', 'add', true)).toBe('Next: community rules')
    expect(finishLabel('reopen', 'vote', false)).toBe('Done')
    expect(finishLabel('reopen', 'add', false)).toBe('Done')
  })

  it('uses the season label in the first card', () => {
    expect(welcomeCard('find', 'Halloween').text).toBe(
      'Porchlight shows the best Halloween displays around Tauranga, shared by the people who made them.',
    )
    expect(welcomeCard('find', 'Christmas').text).toContain('the best Christmas displays')
  })
})

describe('useWelcomeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    resetSeenThisLoad()
    authState.uid.value = null
    mockFetch.mockResolvedValue({ version: null, acceptedAt: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('first visit (cards 1–3)', () => {
    it('shows once when the page load started on Explore; "Let\'s go" remembers it', () => {
      const { welcome } = stores()
      welcome.setLanding(true)
      expect(welcome.offerFirstVisit()).toBe(true)
      expect(welcome.isOpen).toBe(true)
      expect(welcome.run).toBe('first')
      expect(welcome.steps).toEqual(['find', 'search', 'vote'])
      expect(welcome.buttonLabel).toBe('Next')
      welcome.next()
      welcome.next()
      expect(welcome.step).toBe('vote')
      expect(welcome.buttonLabel).toBe("Let's go")
      welcome.next()
      expect(welcome.isOpen).toBe(false)
      expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe('seen')
      expect(localStorage.getItem(WELCOME_MEMBER_SEEN_KEY)).toBeNull()

      // A later page load doesn't show it again.
      setActivePinia(createPinia())
      resetSeenThisLoad()
      const again = useWelcomeStore()
      again.setLanding(true)
      expect(again.offerFirstVisit()).toBe(false)
      expect(again.isOpen).toBe(false)
    })

    it('Skip closes it and remembers', () => {
      const { welcome } = stores()
      welcome.setLanding(true)
      welcome.offerFirstVisit()
      welcome.finish()
      expect(welcome.isOpen).toBe(false)
      expect(hasSeen(WELCOME_SEEN_KEY)).toBe(true)
    })

    it('back() and next() move between cards', () => {
      const { welcome } = stores()
      welcome.setLanding(true)
      welcome.offerFirstVisit()
      welcome.back()
      expect(welcome.index).toBe(0)
      welcome.next()
      expect(welcome.step).toBe('search')
      welcome.back()
      expect(welcome.step).toBe('find')
    })

    it("isn't shown when the page load started on a deep link (e.g. /about)", () => {
      const { welcome } = stores()
      welcome.setLanding(false)
      expect(welcome.offerFirstVisit()).toBe(false)
      expect(welcome.isOpen).toBe(false)
      expect(hasSeen(WELCOME_SEEN_KEY)).toBe(false)
    })

    it('with storage blocked, shows at most once per page load', () => {
      blockStorage()
      const { welcome } = stores()
      welcome.setLanding(true)
      expect(welcome.offerFirstVisit()).toBe(true)
      welcome.finish()
      expect(welcome.offerFirstVisit()).toBe(false)

      setActivePinia(createPinia())
      resetSeenThisLoad()
      const next = useWelcomeStore()
      next.setLanding(true)
      expect(next.offerFirstVisit()).toBe(true)
    })
  })

  describe('first sign-in (card 4, then the rules)', () => {
    it('shows card 4 alone instead of the rules, then opens the rules', async () => {
      const { terms, welcome } = stores()
      await signIn()
      expect(terms.state).toBe('required')
      expect(terms.isOpen).toBe(false)
      expect(welcome.isOpen).toBe(true)
      expect(welcome.run).toBe('member')
      expect(welcome.steps).toEqual(['add'])
      expect(welcome.buttonLabel).toBe('Next: community rules')

      welcome.next()
      expect(welcome.isOpen).toBe(false)
      expect(terms.isOpen).toBe(false) // waits for the welcome to finish closing
      welcome.closed()
      expect(terms.isOpen).toBe(true)
      expect(terms.mode).toBe('agree')
      expect(localStorage.getItem(WELCOME_MEMBER_SEEN_KEY)).toBe('seen')
      expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBeNull()
    })

    it('Skip on card 4 also goes to the rules', async () => {
      const { terms, welcome } = stores()
      await signIn()
      welcome.finish()
      welcome.closed()
      expect(terms.isOpen).toBe(true)
      expect(terms.mode).toBe('agree')
      expect(hasSeen(WELCOME_MEMBER_SEEN_KEY)).toBe(true)
    })

    it('a dismissed modal (Escape) counts as Skip', async () => {
      const { terms, welcome } = stores()
      await signIn()
      welcome.closed()
      expect(welcome.isOpen).toBe(false)
      expect(terms.isOpen).toBe(true)
    })

    it("once card 4 was seen, the rules open by themselves as before", async () => {
      markSeen(WELCOME_MEMBER_SEEN_KEY)
      const { terms, welcome } = stores()
      await signIn()
      expect(welcome.isOpen).toBe(false)
      expect(terms.isOpen).toBe(true)
    })

    it('never shows card 4 when the rules are already agreed', async () => {
      mockFetch.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: new Date() })
      const { terms, welcome } = stores()
      await signIn()
      expect(welcome.isOpen).toBe(false)
      expect(terms.isOpen).toBe(false)
      expect(hasSeen(WELCOME_MEMBER_SEEN_KEY)).toBe(false)
    })

    it('signed in on a first visit: cards 1–4 in one go, then the rules', async () => {
      const { terms, welcome } = stores()
      welcome.setLanding(true)
      await signIn()
      // Held until Explore has loaded and the cards open.
      expect(terms.isOpen).toBe(false)
      expect(welcome.isOpen).toBe(false)
      expect(welcome.offerFirstVisit()).toBe(true)
      expect(welcome.steps).toEqual(['find', 'search', 'vote', 'add'])
      welcome.next()
      welcome.next()
      expect(welcome.buttonLabel).toBe('Next')
      welcome.next()
      expect(welcome.step).toBe('add')
      expect(welcome.buttonLabel).toBe('Next: community rules')
      welcome.next()
      welcome.closed()
      expect(terms.isOpen).toBe(true)
      expect(hasSeen(WELCOME_SEEN_KEY)).toBe(true)
      expect(hasSeen(WELCOME_MEMBER_SEEN_KEY)).toBe(true)
    })

    it('a sign-in while cards 1–3 are open adds card 4 and the rules after', async () => {
      const { terms, welcome } = stores()
      welcome.setLanding(true)
      welcome.offerFirstVisit()
      await signIn()
      expect(terms.isOpen).toBe(false)
      expect(welcome.steps).toEqual(['find', 'search', 'vote', 'add'])
      welcome.finish()
      welcome.closed()
      expect(terms.isOpen).toBe(true)
    })

    it("a held ask opens the rules when the cards can't show", async () => {
      const { terms, welcome } = stores()
      welcome.setLanding(true)
      await signIn()
      expect(terms.isOpen).toBe(false)
      welcome.releaseHeldRules()
      expect(terms.isOpen).toBe(true)
      expect(terms.mode).toBe('agree')
    })

    it('a held ask is dropped on sign-out', async () => {
      const { terms, welcome } = stores()
      welcome.setLanding(true)
      await signIn()
      authState.uid.value = null
      await settle()
      welcome.offerFirstVisit()
      expect(welcome.steps).toEqual(['find', 'search', 'vote'])
      welcome.finish()
      welcome.closed()
      expect(terms.isOpen).toBe(false)
    })
  })

  describe('reopen ("How Porchlight works")', () => {
    it('signed out: cards 1–3 ending in Done', () => {
      const { welcome } = stores()
      welcome.reopen()
      expect(welcome.run).toBe('reopen')
      expect(welcome.steps).toEqual(['find', 'search', 'vote'])
      welcome.next()
      welcome.next()
      expect(welcome.buttonLabel).toBe('Done')
    })

    it("signed in: cards 1–4 ending in Done, and it doesn't open the rules once agreed", async () => {
      mockFetch.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: new Date() })
      const { terms, welcome } = stores()
      await signIn()
      expect(terms.isOpen).toBe(false)

      welcome.reopen()
      expect(welcome.steps).toEqual(['find', 'search', 'vote', 'add'])
      for (let i = 0; i < 3; i++) welcome.next()
      expect(welcome.buttonLabel).toBe('Done')
      welcome.next()
      welcome.closed()
      expect(welcome.isOpen).toBe(false)
      expect(terms.isOpen).toBe(false)
    })

    it('Skip on a reopen never opens the rules either once agreed', async () => {
      mockFetch.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: new Date() })
      const { terms, welcome } = stores()
      await signIn()
      welcome.reopen()
      welcome.finish()
      welcome.closed()
      expect(terms.isOpen).toBe(false)
    })
  })
})
