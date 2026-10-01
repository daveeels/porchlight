import { describe, expect, it } from 'vitest'
import { UPLOAD_ID_ALPHABET, UPLOAD_ID_LENGTH, UPLOAD_ID_PATTERN, newUploadId } from '@/lib/uploadId'

describe('newUploadId', () => {
  it('is 20 characters from [A-Za-z0-9_-]', () => {
    for (let i = 0; i < 200; i++) {
      const id = newUploadId()
      expect(id).toHaveLength(UPLOAD_ID_LENGTH)
      expect(id).toMatch(/^[A-Za-z0-9_-]{20}$/)
      // And passes the server's pattern.
      expect(id).toMatch(UPLOAD_ID_PATTERN)
    }
  })

  it('is different each time', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newUploadId()))
    expect(ids.size).toBe(500)
  })

  it('maps every byte value into the 64-character alphabet', () => {
    expect(UPLOAD_ID_ALPHABET).toHaveLength(64)
    expect(new Set(UPLOAD_ID_ALPHABET).size).toBe(64)
    const all = newUploadId((b) => b.map((_, i) => i * 13 + 255))
    expect(all).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(newUploadId((b) => b.fill(0))).toBe('A'.repeat(20))
    expect(newUploadId((b) => b.fill(255))).toBe('-'.repeat(20))
    expect(newUploadId((b) => b.fill(62))).toBe('_'.repeat(20))
  })

  it('server pattern rejects path tricks', () => {
    expect('../../etc').not.toMatch(UPLOAD_ID_PATTERN)
    expect('abc/def/ghijk').not.toMatch(UPLOAD_ID_PATTERN)
    expect('short').not.toMatch(UPLOAD_ID_PATTERN)
  })
})
