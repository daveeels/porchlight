import { describe, expect, it } from 'vitest'
import { AREAS, LAUNCH_CENTER } from '@/config/areas'

describe('launch config', () => {
  it('defines the Tauranga area', () => {
    const tauranga = AREAS.find((a) => a.key === 'tauranga')
    expect(tauranga?.radiusKm).toBe(30)
  })

  it('centres the launch map on Tauranga', () => {
    expect(LAUNCH_CENTER.lat).toBeCloseTo(-37.69, 1)
    expect(LAUNCH_CENTER.lng).toBeCloseTo(176.17, 1)
  })
})
