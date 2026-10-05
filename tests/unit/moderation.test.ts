import { describe, expect, it } from 'vitest'
import { summariseReports } from '@/lib/moderation'

describe('summariseReports', () => {
  it('groups reasons, most common first, with friendly labels', () => {
    expect(summariseReports(['SPAM', 'INAPPROPRIATE', 'INAPPROPRIATE'])).toBe('Inappropriate ×2 · Spam')
  })
  it('is empty with no reports and keeps unknown reasons as-is', () => {
    expect(summariseReports([])).toBe('')
    expect(summariseReports(['WEIRD'])).toBe('WEIRD')
  })
})
