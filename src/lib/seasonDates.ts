// Season and event date rules (SPEC §3). Pure functions, fully unit-tested.
// Calendar boundaries are evaluated in NZ local time (Pacific/Auckland), the
// launch market. Event expiry itself comes from the event doc, not from here.
import type { EventId, HolidayEvent, Season } from '@/types/models'

export const NZ_TIME_ZONE = 'Pacific/Auckland'

const nzFormat = new Intl.DateTimeFormat('en-NZ', {
  timeZone: NZ_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/** The calendar date of `now` in Pacific/Auckland. month is 1–12. */
export function nzDateParts(now: Date): { year: number; month: number; day: number } {
  let year = 0
  let month = 0
  let day = 0
  for (const part of nzFormat.formatToParts(now)) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
    else if (part.type === 'day') day = Number(part.value)
  }
  return { year, month, day }
}

/**
 * The event a season belongs to at `now`. Christmas uses the year of Dec 25,
 * so in January it's the previous year's event (Jan 3 2027 → CHRISTMAS_2026).
 */
export function eventIdFor(season: Season, now: Date): EventId {
  const { year, month } = nzDateParts(now)
  const eventYear = season === 'CHRISTMAS' && month === 1 ? year - 1 : year
  return `${season}_${eventYear}`
}

/** SPEC §3 rule 2/3: Sep 15–Nov 7 Halloween, Nov 8–Jan 7 Christmas, else off-season. */
export function defaultSeasonByDate(now: Date): Season | null {
  const { month, day } = nzDateParts(now)
  const md = month * 100 + day
  if (md >= 915 && md <= 1107) return 'HALLOWEEN'
  if (md >= 1108 || md <= 107) return 'CHRISTMAS'
  return null
}

/** SPEC §3 rule 0: a season is usable if its event doc exists and now < expiresAt. */
export function isEventUsable(
  event: Pick<HolidayEvent, 'expiresAt'> | null | undefined,
  now: Date,
): boolean {
  return !!event && now.getTime() < event.expiresAt.toMillis()
}
