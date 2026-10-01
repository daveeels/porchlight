import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/auth', () => ({
  signInWithGoogle: vi.fn(),
  sendEmailSignInLink: vi.fn(),
  isEmailSignInLink: vi.fn(),
  signInWithEmailSignInLink: vi.fn(),
  signOutUser: vi.fn(),
  watchAuth: vi.fn(),
}))

import { sendEmailSignInLink, signInWithEmailSignInLink } from '@/services/auth'
import { EMAIL_FOR_SIGN_IN_KEY, emailLinkContinueUrl, useAuthStore } from '@/stores/auth'

const mockSend = vi.mocked(sendEmailSignInLink)
const mockComplete = vi.mocked(signInWithEmailSignInLink)
const LINK = 'http://localhost:3000/auth/complete?apiKey=k&oobCode=c&mode=signIn'

describe('emailLinkContinueUrl (SPEC F11)', () => {
  it('lands on /auth/complete with the same-site path to return to', () => {
    expect(emailLinkContinueUrl('https://porchlight-nz.firebaseapp.com', '/me')).toBe(
      'https://porchlight-nz.firebaseapp.com/auth/complete?redirect=%2Fme',
    )
    expect(emailLinkContinueUrl('https://porchlight-nz.firebaseapp.com', '/?area=tauranga&pin=a_B')).toBe(
      'https://porchlight-nz.firebaseapp.com/auth/complete?redirect=%2F%3Farea%3Dtauranga%26pin%3Da_B',
    )
  })

  it('drops missing or unsafe redirects', () => {
    const base = 'https://porchlight-nz.firebaseapp.com/auth/complete'
    expect(emailLinkContinueUrl('https://porchlight-nz.firebaseapp.com', null)).toBe(base)
    expect(emailLinkContinueUrl('https://porchlight-nz.firebaseapp.com', '//evil.example/x')).toBe(base)
    expect(emailLinkContinueUrl('https://porchlight-nz.firebaseapp.com', 'https://evil.example')).toBe(base)
    expect(emailLinkContinueUrl('https://porchlight-nz.firebaseapp.com', '/sign-in')).toBe(base)
  })
})

describe('useAuthStore email link', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
    mockSend.mockResolvedValue()
    mockComplete.mockResolvedValue()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the link to the trimmed address and remembers it on this device', async () => {
    const auth = useAuthStore()
    await auth.sendEmailLink('  kia.ora@example.com ', '/submit')
    expect(mockSend).toHaveBeenCalledWith(
      'kia.ora@example.com',
      `${window.location.origin}/auth/complete?redirect=%2Fsubmit`,
    )
    expect(localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY)).toBe('kia.ora@example.com')
    expect(auth.pendingEmail()).toBe('kia.ora@example.com')
  })

  it('does not remember the address when sending fails', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/invalid-email' }))
    const auth = useAuthStore()
    await expect(auth.sendEmailLink('bad@example.com', null)).rejects.toThrow()
    expect(auth.pendingEmail()).toBeNull()
  })

  it('forgets the address once sign-in completes', async () => {
    localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, 'kia.ora@example.com')
    const auth = useAuthStore()
    await auth.completeEmailLink('kia.ora@example.com', LINK)
    expect(mockComplete).toHaveBeenCalledWith('kia.ora@example.com', LINK)
    expect(auth.pendingEmail()).toBeNull()
  })

  it('keeps the address if completing fails (so "send a new link" can reuse it)', async () => {
    localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, 'kia.ora@example.com')
    mockComplete.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/invalid-action-code' }))
    const auth = useAuthStore()
    await expect(auth.completeEmailLink('kia.ora@example.com', LINK)).rejects.toThrow()
    expect(auth.pendingEmail()).toBe('kia.ora@example.com')
  })

  it('still works when storage is blocked', async () => {
    const blocked = () => {
      throw new Error('SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })
    const auth = useAuthStore()
    await expect(auth.sendEmailLink('kia.ora@example.com', '/')).resolves.toBeUndefined()
    expect(auth.pendingEmail()).toBeNull()
  })
})
