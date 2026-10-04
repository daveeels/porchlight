import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { acceptTerms, fetchTermsRecord } from '@/services/terms'
import { useTermsStore } from '@/stores/terms'

const mockFetch = vi.mocked(fetchTermsRecord)
const mockAccept = vi.mocked(acceptTerms)

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
}

async function signIn(uid = 'user1'): Promise<ReturnType<typeof useTermsStore>> {
  const store = useTermsStore()
  authState.uid.value = uid
  await settle()
  return store
}

describe('useTermsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sessionStorage.clear()
    authState.uid.value = null
    mockFetch.mockResolvedValue({ version: null, acceptedAt: null })
    mockAccept.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: new Date('2026-10-02T01:00:00Z') })
  })

  it('opens the agree form after a first sign-in', async () => {
    const terms = await signIn()
    expect(mockFetch).toHaveBeenCalledWith('user1')
    expect(terms.state).toBe('required')
    expect(terms.isOpen).toBe(true)
    expect(terms.mode).toBe('agree')
  })

  it("doesn't open when the current version is already agreed", async () => {
    const at = new Date('2026-10-02T00:00:00Z')
    mockFetch.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: at })
    const terms = await signIn()
    expect(terms.state).toBe('accepted')
    expect(terms.acceptedAt).toEqual(at)
    expect(terms.isOpen).toBe(false)
  })

  it('asks again when an older version was agreed', async () => {
    mockFetch.mockResolvedValue({ version: '2020-01-01', acceptedAt: new Date() })
    const terms = await signIn()
    expect(terms.state).toBe('required')
    expect(terms.isOpen).toBe(true)
  })

  it('is a gate: closing it without agreeing opens it straight back', async () => {
    const terms = await signIn()
    terms.dismissed()
    expect(terms.isOpen).toBe(true)
    expect(terms.mode).toBe('agree')
    terms.isOpen = false
    await settle()
    expect(terms.isOpen).toBe(true)
  })

  it('asks again on every page load until agreed', async () => {
    await signIn()
    setActivePinia(createPinia())
    authState.uid.value = null
    const again = await signIn()
    expect(again.state).toBe('required')
    expect(again.isOpen).toBe(true)
  })

  it('a deferred ask (welcome cards first) opens on release()', async () => {
    const terms = useTermsStore()
    terms.setFirstAskHandler(() => true)
    const store = await signIn()
    expect(store.state).toBe('required')
    expect(store.deferred).toBe(true)
    expect(store.isOpen).toBe(false)
    store.release()
    expect(store.isOpen).toBe(true)
    expect(store.deferred).toBe(false)
  })

  it('agree() calls acceptTerms and resolves a waiting write', async () => {
    const terms = await signIn()
    const waiting = terms.ensureAgreed()
    await settle()
    expect(terms.isOpen).toBe(true)
    await expect(terms.agree()).resolves.toBe(true)
    await expect(waiting).resolves.toBe(true)
    expect(mockAccept).toHaveBeenCalledWith(TERMS_VERSION)
    expect(terms.state).toBe('accepted')
    expect(terms.isOpen).toBe(false)
    await expect(terms.ensureAgreed()).resolves.toBe(true)
  })

  it('a waiting write gets false when the member signs out instead', async () => {
    const terms = await signIn()
    const waiting = terms.requireAgreement()
    authState.uid.value = null
    await settle()
    await expect(waiting).resolves.toBe(false)
    expect(terms.isOpen).toBe(false)
  })

  it('keeps the form open with a message when saving fails', async () => {
    mockAccept.mockRejectedValue(new Error('offline'))
    const terms = await signIn()
    await expect(terms.agree()).resolves.toBe(false)
    expect(terms.isOpen).toBe(true)
    expect(terms.saveError).toBe("Couldn't save that. Please try again.")
  })

  it('TERMS_REQUIRED from the server reopens the agree form even if it looked agreed', async () => {
    mockFetch.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: new Date() })
    const terms = await signIn()
    const retry = terms.onTermsRequired()
    expect(terms.isOpen).toBe(true)
    expect(terms.mode).toBe('agree')
    await terms.agree()
    await expect(retry).resolves.toBe(true)
  })

  it('showRules is read-only once agreed', async () => {
    mockFetch.mockResolvedValue({ version: TERMS_VERSION, acceptedAt: new Date() })
    const terms = await signIn()
    terms.showRules()
    expect(terms.mode).toBe('view')
    expect(terms.isOpen).toBe(true)
  })

  it("lets the server decide when the users doc can't be read", async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    const terms = await signIn()
    expect(terms.state).toBe('error')
    expect(terms.isOpen).toBe(false)
    await expect(terms.ensureAgreed()).resolves.toBe(true)
  })

  it('signed out: nothing to agree, and signing out closes the form', async () => {
    const terms = await signIn()
    expect(terms.isOpen).toBe(true)
    authState.uid.value = null
    await settle()
    expect(terms.isOpen).toBe(false)
    await expect(terms.ensureAgreed()).resolves.toBe(false)
  })
})
