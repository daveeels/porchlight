import { describe, expect, it } from 'vitest'
import { COMMUNITY_RULES, TERMS_VERSION } from '@/config/terms'
import { TERMS_VERSION as SERVER_TERMS_VERSION } from '../../functions/src/lib/terms'

describe('community rules', () => {
  it('uses the same version as the server (functions/src/lib/terms.ts)', () => {
    expect(TERMS_VERSION).toBe(SERVER_TERMS_VERSION)
  })

  it('is a dated version and a short list', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(COMMUNITY_RULES).toHaveLength(6)
  })
})
