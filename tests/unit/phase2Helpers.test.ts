// Small pure helpers behind the add-display flow, My display and the account menu.
import { describe, expect, it } from 'vitest'
import { canChangePin, canEditPin, canReAdd, pinStatusInfo } from '@/components/mypin/status'
import {
  CONSENT_TEXT,
  descriptionError,
  titleError,
} from '@/components/submit/validation'
import { FEEDBACK_SUBJECT, feedbackBody, feedbackMailto } from '@/lib/feedback'
import { safeRedirect } from '@/lib/redirect'
import type { DisplayPin } from '@/types/models'

type S = Pick<DisplayPin, 'status' | 'verified' | 'hiddenReason' | 'removedBy'>
const pin = (over: Partial<S>): S => ({
  status: 'ACTIVE',
  verified: false,
  hiddenReason: null,
  removedBy: null,
  ...over,
})

describe('pinStatusInfo (SPEC F6 wording)', () => {
  it('labels each status in plain words', () => {
    expect(pinStatusInfo(pin({})).label).toBe('Live – Unverified')
    expect(pinStatusInfo(pin({ verified: true })).label).toBe('Live – Verified')
    expect(pinStatusInfo(pin({ status: 'HIDDEN', hiddenReason: 'REPORTS' })).label).toBe('Hidden – under review')
    expect(pinStatusInfo(pin({ status: 'HIDDEN', hiddenReason: 'NOT_THERE' })).label).toBe(
      "Hidden – people said it's not there",
    )
    expect(pinStatusInfo(pin({ status: 'REMOVED', removedBy: 'OWNER' })).label).toBe('Removed by you')
    expect(pinStatusInfo(pin({ status: 'REMOVED', removedBy: 'ADMIN' })).label).toBe('Removed by a moderator')
    expect(pinStatusInfo(pin({ status: 'ARCHIVED' })).label).toBe('Archived')
  })

  it('offers edit/delete only for live or hidden pins', () => {
    expect(canChangePin({ status: 'ACTIVE' })).toBe(true)
    expect(canChangePin({ status: 'HIDDEN' })).toBe(true)
    expect(canChangePin({ status: 'REMOVED' })).toBe(false)
    expect(canChangePin({ status: 'ARCHIVED' })).toBe(false)
  })

  it('offers edit, but not while the pin is under review after reports', () => {
    expect(canEditPin({ status: 'ACTIVE', hiddenReason: null })).toBe(true)
    expect(canEditPin({ status: 'HIDDEN', hiddenReason: 'NOT_THERE' })).toBe(true)
    expect(canEditPin({ status: 'HIDDEN', hiddenReason: 'REPORTS' })).toBe(false)
    expect(canEditPin({ status: 'REMOVED', hiddenReason: null })).toBe(false)
  })

  it('offers re-adding only after the owner deleted a pin that was not reported', () => {
    expect(canReAdd(pin({ status: 'REMOVED', removedBy: 'OWNER' }))).toBe(true)
    expect(canReAdd(pin({ status: 'REMOVED', removedBy: 'OWNER', hiddenReason: 'REPORTS' }))).toBe(false)
    expect(canReAdd(pin({ status: 'REMOVED', removedBy: 'ADMIN' }))).toBe(false)
    expect(canReAdd(pin({ status: 'ACTIVE' }))).toBe(false)
  })
})

describe('details validation', () => {
  it('needs a title of 3–60 characters after trimming', () => {
    expect(titleError('')).not.toBeNull()
    expect(titleError('  ab  ')).not.toBeNull()
    expect(titleError('abc')).toBeNull()
    expect(titleError('x'.repeat(60))).toBeNull()
    expect(titleError('x'.repeat(61))).not.toBeNull()
  })

  it('allows an empty description up to 500 characters', () => {
    expect(descriptionError('')).toBeNull()
    expect(descriptionError('x'.repeat(500))).toBeNull()
    expect(descriptionError('x'.repeat(501))).not.toBeNull()
  })

  it('flags links', () => {
    expect(titleError('see www.example.com')).not.toBeNull()
    expect(descriptionError('https://spam.example')).not.toBeNull()
  })

  it('uses the exact SPEC consent wording', () => {
    expect(CONSENT_TEXT).toBe("This is my house, or I have the owner's permission to share it.")
  })
})

describe('safeRedirect', () => {
  it('accepts in-app paths', () => {
    expect(safeRedirect('/submit')).toBe('/submit')
    expect(safeRedirect('/submit?edit=1')).toBe('/submit?edit=1')
    expect(safeRedirect(['/me'])).toBe('/me')
  })

  it('rejects other sites, loops and junk', () => {
    expect(safeRedirect('https://evil.example')).toBeNull()
    expect(safeRedirect('//evil.example')).toBeNull()
    expect(safeRedirect('/\\evil.example')).toBeNull()
    expect(safeRedirect('/sign-in')).toBeNull()
    expect(safeRedirect('/sign-in?redirect=/me')).toBeNull()
    expect(safeRedirect('me')).toBeNull()
    expect(safeRedirect(undefined)).toBeNull()
    expect(safeRedirect(null)).toBeNull()
  })

  it('still allows paths that merely start with "sign-in"', () => {
    expect(safeRedirect('/sign-in-help')).toBe('/sign-in-help')
  })
})

describe('feedback mailto', () => {
  const ctx = {
    url: 'https://porchlight-nz.firebaseapp.com/me',
    version: 'abc123',
    userAgent: 'Mozilla/5.0 (iPhone)',
    screen: '390×844',
    signedIn: true,
  }

  it('has the subject and a body with the context', () => {
    const href = feedbackMailto('hello@example.com', ctx)
    expect(href.startsWith('mailto:hello@example.com?subject=')).toBe(true)
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    expect(params.get('subject')).toBe(FEEDBACK_SUBJECT)
    expect(FEEDBACK_SUBJECT).toBe('Porchlight beta feedback')
    const body = params.get('body') ?? ''
    expect(body).toContain('Page: https://porchlight-nz.firebaseapp.com/me')
    expect(body).toContain('App version: abc123')
    expect(body).toContain('Browser: Mozilla/5.0 (iPhone)')
    expect(body).toContain('Screen: 390×844')
    expect(body).toContain('Signed in: yes')
  })

  it('encodes spaces as %20 (not +) for mail apps', () => {
    const href = feedbackMailto('a@b.co', { ...ctx, signedIn: false })
    expect(href).not.toContain('+')
    expect(href).toContain('Porchlight%20beta%20feedback')
    expect(feedbackBody({ ...ctx, signedIn: false })).toContain('Signed in: no')
  })
})
