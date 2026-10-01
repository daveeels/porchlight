import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { defaultSeasonByDate, eventIdFor, isEventUsable, nzDateParts } from '@/lib/seasonDates'

// NZ is UTC+12 (NZST) until the last Sunday of September, then UTC+13 (NZDT)
// until the first Sunday of April. 2026: NZDT starts Sep 27.
const utc = (iso: string) => new Date(iso)

describe('nzDateParts', () => {
  it('uses the Pacific/Auckland calendar date', () => {
    expect(nzDateParts(utc('2026-12-31T11:00:00Z'))).toEqual({ year: 2027, month: 1, day: 1 })
    expect(nzDateParts(utc('2026-12-31T10:59:59Z'))).toEqual({ year: 2026, month: 12, day: 31 })
  })
})

describe('defaultSeasonByDate', () => {
  it('is off-season on Sep 14 and Halloween from Sep 15 (NZST)', () => {
    expect(defaultSeasonByDate(utc('2026-09-14T11:59:59Z'))).toBeNull() // Sep 14 23:59 NZST
    expect(defaultSeasonByDate(utc('2026-09-14T12:00:00Z'))).toBe('HALLOWEEN') // Sep 15 00:00 NZST
  })

  it('is Halloween on Oct 31', () => {
    expect(defaultSeasonByDate(utc('2026-10-31T06:00:00Z'))).toBe('HALLOWEEN')
  })

  it('switches to Christmas at Nov 8 00:00 NZDT', () => {
    expect(defaultSeasonByDate(utc('2026-11-07T10:59:59Z'))).toBe('HALLOWEEN') // Nov 7 23:59 NZDT
    expect(defaultSeasonByDate(utc('2026-11-07T11:00:00Z'))).toBe('CHRISTMAS') // Nov 8 00:00 NZDT
    // Still Nov 7 in UTC, but already Nov 8 in NZ.
    expect(defaultSeasonByDate(utc('2026-11-07T20:00:00Z'))).toBe('CHRISTMAS')
  })

  it('is Christmas on Dec 25 and Dec 31', () => {
    expect(defaultSeasonByDate(utc('2026-12-25T00:00:00Z'))).toBe('CHRISTMAS')
    expect(defaultSeasonByDate(utc('2026-12-31T05:00:00Z'))).toBe('CHRISTMAS')
  })

  it('is Christmas through Jan 7 and off-season from Jan 8 (NZ)', () => {
    expect(defaultSeasonByDate(utc('2027-01-07T10:59:59Z'))).toBe('CHRISTMAS') // Jan 7 23:59 NZDT
    expect(defaultSeasonByDate(utc('2027-01-07T11:00:00Z'))).toBeNull() // Jan 8 00:00 NZDT
    expect(defaultSeasonByDate(utc('2027-06-01T00:00:00Z'))).toBeNull()
  })
})

describe('eventIdFor', () => {
  it('uses the current year for Halloween', () => {
    expect(eventIdFor('HALLOWEEN', utc('2026-10-31T06:00:00Z'))).toBe('HALLOWEEN_2026')
  })

  it('uses the year of Dec 25 for Christmas', () => {
    expect(eventIdFor('CHRISTMAS', utc('2026-12-25T00:00:00Z'))).toBe('CHRISTMAS_2026')
    expect(eventIdFor('CHRISTMAS', utc('2026-12-31T05:00:00Z'))).toBe('CHRISTMAS_2026')
    expect(eventIdFor('CHRISTMAS', utc('2027-01-03T00:00:00Z'))).toBe('CHRISTMAS_2026')
    expect(eventIdFor('CHRISTMAS', utc('2027-01-07T10:59:59Z'))).toBe('CHRISTMAS_2026')
  })

  it('treats NZ New Year (still Dec 31 UTC) as January', () => {
    expect(eventIdFor('CHRISTMAS', utc('2026-12-31T11:00:00Z'))).toBe('CHRISTMAS_2026')
    expect(eventIdFor('HALLOWEEN', utc('2026-12-31T11:00:00Z'))).toBe('HALLOWEEN_2027')
  })

  it('uses the new year for Christmas from February', () => {
    expect(eventIdFor('CHRISTMAS', utc('2027-02-01T00:00:00Z'))).toBe('CHRISTMAS_2027')
  })
})

describe('isEventUsable', () => {
  // HALLOWEEN_2026 expires Nov 8 12:00 UTC (= Nov 9 01:00 NZDT), SPEC §3.
  const halloween = { expiresAt: Timestamp.fromDate(utc('2026-11-08T12:00:00Z')) }
  // CHRISTMAS_2026 expires Jan 8 2027 12:00 UTC.
  const christmas = { expiresAt: Timestamp.fromDate(utc('2027-01-08T12:00:00Z')) }

  it('is false when the event doc is missing', () => {
    expect(isEventUsable(null, utc('2026-10-31T00:00:00Z'))).toBe(false)
    expect(isEventUsable(undefined, utc('2026-10-31T00:00:00Z'))).toBe(false)
  })

  it('is true before expiresAt and false from it', () => {
    expect(isEventUsable(halloween, utc('2026-10-31T00:00:00Z'))).toBe(true)
    expect(isEventUsable(halloween, utc('2026-11-08T11:59:59Z'))).toBe(true)
    expect(isEventUsable(halloween, utc('2026-11-08T12:00:00Z'))).toBe(false)
  })

  it('keeps Christmas usable through Jan 7 in NZ', () => {
    expect(isEventUsable(christmas, utc('2027-01-07T10:59:59Z'))).toBe(true)
    expect(isEventUsable(christmas, utc('2027-01-08T12:00:00Z'))).toBe(false)
  })
})
