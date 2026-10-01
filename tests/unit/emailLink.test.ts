import { describe, expect, it } from 'vitest'
import { isPlausibleEmail, linkFailure, returnPath, sendLinkErrorMessage } from '@/components/auth/emailLink'

const err = (code: string) => Object.assign(new Error(code), { code })

describe('email link helpers (SPEC F11)', () => {
  it('accepts ordinary addresses and rejects obvious typos', () => {
    expect(isPlausibleEmail('kia.ora@example.co.nz')).toBe(true)
    expect(isPlausibleEmail('  a+b@example.com ')).toBe(true)
    expect(isPlausibleEmail('')).toBe(false)
    expect(isPlausibleEmail('kiaora')).toBe(false)
    expect(isPlausibleEmail('kia@ora')).toBe(false)
    expect(isPlausibleEmail('kia ora@example.com')).toBe(false)
  })

  it('classifies link failures', () => {
    expect(linkFailure(err('auth/invalid-action-code'))).toBe('expired')
    expect(linkFailure(err('auth/expired-action-code'))).toBe('expired')
    expect(linkFailure(err('auth/invalid-email'))).toBe('wrong-email')
    expect(linkFailure(err('auth/network-request-failed'))).toBe('offline')
    expect(linkFailure(new Error('boom'))).toBe('other')
    expect(linkFailure(null)).toBe('other')
  })

  it('explains send failures in plain words', () => {
    expect(sendLinkErrorMessage(err('auth/invalid-email'))).toMatch(/doesn't look right/)
    expect(sendLinkErrorMessage(err('auth/too-many-requests'))).toMatch(/too many/)
    expect(sendLinkErrorMessage(err('auth/network-request-failed'))).toMatch(/offline/)
    expect(sendLinkErrorMessage(new Error('?'))).toBe("Couldn't send the email. Please try again.")
  })

  it('returns to the guard redirect, else the previous page, never off-site', () => {
    expect(returnPath('/submit', { back: '/?area=tauranga' })).toBe('/submit')
    expect(returnPath(undefined, { back: '/?area=tauranga' })).toBe('/?area=tauranga')
    expect(returnPath(['/me'], null)).toBe('/me')
    expect(returnPath(undefined, { back: null })).toBeNull()
    expect(returnPath('https://evil.example', { back: '//evil.example' })).toBeNull()
    expect(returnPath(undefined, null)).toBeNull()
  })
})
