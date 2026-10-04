import { describe, expect, it } from 'vitest'
import { reasonOf } from '../../functions/src/lib/errors'
import { DAILY_LIMITS, takeRateLimit, utcDay } from '../../functions/src/lib/rateLimit'
import {
  containsProfanity,
  containsUrl,
  parseCreatePinInput,
  parseDescription,
  parseTitle,
  parseUpdatePinInput,
  PIN_ID_RE,
  UPLOAD_ID_RE,
  uploadIdOf,
} from '../../functions/src/lib/validation'

function reason(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (err) {
    return reasonOf(err)
  }
}

const valid = {
  eventId: 'HALLOWEEN_2026',
  uploadId: 'abcdefghij_KLMNOP-123',
  lat: -37.7,
  lng: 176.29,
  title: 'Pumpkin Palace',
  consentOwnerOrPermission: true,
}

describe('parseCreatePinInput', () => {
  it('accepts a valid payload and trims text', () => {
    expect(parseCreatePinInput({ ...valid, title: '  Pumpkin Palace ', description: ' Spooky ' })).toEqual({
      eventId: 'HALLOWEEN_2026',
      uploadId: 'abcdefghij_KLMNOP-123',
      comingSoon: false,
      lat: -37.7,
      lng: 176.29,
      title: 'Pumpkin Palace',
      description: 'Spooky',
    })
  })

  it('Coming soon may leave out the photo; a ready display may not', () => {
    const { uploadId: _, ...noPhoto } = valid
    expect(parseCreatePinInput({ ...noPhoto, comingSoon: true })).toMatchObject({ uploadId: null, comingSoon: true })
    expect(reason(() => parseCreatePinInput(noPhoto))).toBe('INVALID_INPUT')
  })

  it.each([
    ['comingSoon not a boolean', { comingSoon: 'yes' }],
    ['lat > 90', { lat: 90.0001 }],
    ['lng < -180', { lng: -181 }],
    ['Infinity', { lat: Infinity }],
    ['uploadId path traversal', { uploadId: '../uploads/other' }],
    ['uploadId with slash', { uploadId: 'abcdefghij/klmnop' }],
    ['eventId lowercase', { eventId: 'halloween_2026' }],
    ['eventId other season', { eventId: 'EASTER_2026' }],
    ['consent not literally true', { consentOwnerOrPermission: 'true' }],
    ['unknown key', { ownerId: 'someone' }],
    ['title too long', { title: 'x'.repeat(61) }],
    ['title with newline', { title: 'Two\nlines' }],
  ])('rejects %s', (_name, patch) => {
    expect(reason(() => parseCreatePinInput({ ...valid, ...patch }))).toBe('INVALID_INPUT')
  })
})

describe('text checks', () => {
  it('finds URLs and domains', () => {
    for (const t of ['https://x.io', 'http://a', 'www.spam', 'pumpkins.co.nz', 'go to Spooky.COM now', 'ftp://x']) {
      expect(containsUrl(t)).toBe(true)
    }
    for (const t of ['Mt. Maunganui', 'St. Mary’s Rd', 'Pāpāmoa Beach', '3.5 m tall ghost', 'No. 12']) {
      expect(containsUrl(t)).toBe(false)
    }
  })

  it('finds basic profanity, ignoring case and diacritics', () => {
    expect(containsProfanity('What the FUCK')).toBe(true)
    expect(containsProfanity('bullshit lights')).toBe(true)
    expect(containsProfanity('Scunthorpe Spooks')).toBe(false)
    expect(containsProfanity('Cocktail Corner')).toBe(false)
  })

  it('titles are 3–60 chars after trimming; descriptions 0–500, blank → null', () => {
    expect(parseTitle('  abc  ')).toBe('abc')
    expect(reason(() => parseTitle('  ab  '))).toBe('INVALID_INPUT')
    expect(parseTitle('x'.repeat(60))).toHaveLength(60)
    expect(parseDescription(undefined)).toBeNull()
    expect(parseDescription('   ')).toBeNull()
    expect(parseDescription('line one\nline two')).toBe('line one\nline two')
    expect(reason(() => parseDescription('y'.repeat(501)))).toBe('INVALID_INPUT')
    expect(reason(() => parseDescription(42))).toBe('INVALID_INPUT')
  })

  it('rejects invisible format characters, and the link check sees through them', () => {
    expect(containsUrl('evil​.com')).toBe(true)
    expect(containsUrl('spooky­.co.nz')).toBe(true)
    expect(containsProfanity('f​u​c​k')).toBe(true)
    for (const t of ['Spooky​House', 'Ghost ‮esuoH', 'Bats⁦here⁩', 'Soft­hyphen']) {
      expect(reason(() => parseTitle(t))).toBe('INVALID_INPUT')
      expect(reason(() => parseDescription(t))).toBe('INVALID_INPUT')
    }
    // The zero-width joiner stays allowed for emoji sequences.
    expect(parseTitle('Rainbow 🏳️‍🌈 house')).toBe('Rainbow 🏳️‍🌈 house')
  })
})

describe('uploadIdOf', () => {
  it('returns a well-formed uploadId without throwing, else null', () => {
    expect(uploadIdOf({ uploadId: 'abcDEF_123-xyz7890', title: 'x' })).toBe('abcDEF_123-xyz7890')
    expect(uploadIdOf({ uploadId: '../../etc/passwd0000' })).toBeNull()
    expect(uploadIdOf({ uploadId: 42 })).toBeNull()
    expect(uploadIdOf(null)).toBeNull()
    expect(uploadIdOf('abcDEF_123-xyz7890')).toBeNull()
  })
})

describe('parseUpdatePinInput', () => {
  it('lightsUp needs a new photo and must be true', () => {
    const base = { eventId: 'HALLOWEEN_2026' }
    expect(parseUpdatePinInput({ ...base, uploadId: 'abcdefghij_KLMNOP-123', lightsUp: true })).toMatchObject({ lightsUp: true })
    expect(reason(() => parseUpdatePinInput({ ...base, lightsUp: true, title: 'New title' }))).toBe('INVALID_INPUT')
    expect(reason(() => parseUpdatePinInput({ ...base, lightsUp: false, title: 'New title' }))).toBe('INVALID_INPUT')
  })

  it('keeps only what was sent', () => {
    expect(parseUpdatePinInput({ eventId: 'HALLOWEEN_2026', title: 'New title' })).toEqual({
      eventId: 'HALLOWEEN_2026',
      title: 'New title',
    })
    expect(parseUpdatePinInput({ eventId: 'HALLOWEEN_2026', description: null })).toEqual({
      eventId: 'HALLOWEEN_2026',
      description: null,
    })
  })

  it('rejects location fields and empty updates', () => {
    expect(reason(() => parseUpdatePinInput({ eventId: 'HALLOWEEN_2026', lat: 1, lng: 2 }))).toBe('INVALID_INPUT')
    expect(reason(() => parseUpdatePinInput({ eventId: 'HALLOWEEN_2026' }))).toBe('INVALID_INPUT')
  })
})

describe('id formats', () => {
  it('matches SPEC §6', () => {
    expect(UPLOAD_ID_RE.test('a'.repeat(10))).toBe(true)
    expect(UPLOAD_ID_RE.test('a'.repeat(41))).toBe(false)
    expect(PIN_ID_RE.test(`${'A1'.repeat(14)}_HALLOWEEN_2026`)).toBe(true)
    expect(PIN_ID_RE.test('short_HALLOWEEN_2026')).toBe(false)
  })
})

describe('takeRateLimit', () => {
  const now = new Date('2026-10-01T10:00:00Z')

  it('starts a fresh day and increments', () => {
    expect(takeRateLimit(undefined, 'createPin', now)).toEqual({
      day: '2026-10-01',
      createPin: 1,
      updatePin: 0,
      castVote: 0,
      reportPin: 0,
    })
  })

  it('resets every counter on a new UTC day', () => {
    const old = { day: '2026-09-30', createPin: 3, updatePin: 10, castVote: 40, reportPin: 20 }
    expect(takeRateLimit(old, 'updatePin', now)).toEqual({ ...old, day: '2026-10-01', createPin: 0, updatePin: 1, castVote: 0, reportPin: 0 })
  })

  it('rejects at the daily limit', () => {
    for (const action of ['createPin', 'updatePin', 'castVote', 'reportPin'] as const) {
      const full = { day: utcDay(now), createPin: 0, updatePin: 0, castVote: 0, reportPin: 0, [action]: DAILY_LIMITS[action] }
      expect(reason(() => takeRateLimit(full, action, now))).toBe('RATE_LIMITED')
      const almost = { ...full, [action]: DAILY_LIMITS[action] - 1 }
      expect(takeRateLimit(almost, action, now)[action]).toBe(DAILY_LIMITS[action])
    }
  })
})
