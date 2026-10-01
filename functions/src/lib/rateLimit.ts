// Daily per-user rate limits (SPEC §5 rateLimits/{uid}). Used inside each
// callable's transaction: read the doc, call takeRateLimit, write the result.
import { fail } from './errors.js'

export type RateAction = 'createPin' | 'updatePin' | 'castVote' | 'reportPin'

export const DAILY_LIMITS: Readonly<Record<RateAction, number>> = {
  createPin: 3,
  updatePin: 10,
  castVote: 40,
  reportPin: 20,
}

export interface RateLimitDoc {
  day: string // 'YYYY-MM-DD' UTC
  createPin: number
  updatePin: number
  castVote: number
  reportPin: number
}

/** 'YYYY-MM-DD' in UTC. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The next rateLimits doc for one more `action` today. Resets every counter
 * when the stored day isn't today. Throws RATE_LIMITED when the limit is used up.
 */
export function takeRateLimit(current: Partial<RateLimitDoc> | undefined, action: RateAction, now: Date): RateLimitDoc {
  const day = utcDay(now)
  const base: RateLimitDoc =
    current && current.day === day
      ? {
          day,
          createPin: count(current.createPin),
          updatePin: count(current.updatePin),
          castVote: count(current.castVote),
          reportPin: count(current.reportPin),
        }
      : { day, createPin: 0, updatePin: 0, castVote: 0, reportPin: 0 }
  if (base[action] >= DAILY_LIMITS[action]) {
    fail('RATE_LIMITED', 'resource-exhausted', "You've done that a lot today — try again tomorrow.")
  }
  return { ...base, [action]: base[action] + 1 }
}
