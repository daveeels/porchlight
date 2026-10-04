import { describe, expect, it } from 'vitest'
import { haversineKm, offsetPoint } from '../../functions/src/lib/geo'

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: -37.7, lng: 176.2 }, { lat: -37.7, lng: 176.2 })).toBe(0)
  })

  it('measures one degree of latitude as ~111 km', () => {
    expect(haversineKm({ lat: -37, lng: 176 }, { lat: -38, lng: 176 })).toBeCloseTo(111.19, 1)
  })

  it('knows Tauranga to Rotorua is ~50 km', () => {
    const km = haversineKm({ lat: -37.6861, lng: 176.1667 }, { lat: -38.1387, lng: 176.2452 })
    expect(km).toBeGreaterThan(48)
    expect(km).toBeLessThan(53)
  })
})

describe('offsetPoint', () => {
  const origin = { lat: -37.7, lng: 176.2 }

  it('moves every point 10–15 m', () => {
    for (let i = 0; i < 1000; i++) {
      const p = offsetPoint(origin.lat, origin.lng)
      const m = haversineKm(origin, p) * 1000
      expect(m).toBeGreaterThanOrEqual(10 - 1e-6)
      expect(m).toBeLessThanOrEqual(15 + 1e-6)
    }
  })

  it('spreads bearings across all quadrants', () => {
    const quadrants = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const p = offsetPoint(origin.lat, origin.lng)
      quadrants.add(`${p.lat > origin.lat ? 'N' : 'S'}${p.lng > origin.lng ? 'E' : 'W'}`)
    }
    expect(quadrants.size).toBe(4)
  })

  it('corrects longitude by cos(lat): due east is still 10–15 m', () => {
    // rand() = 0.25 → bearing 90° (east); second call sets distance.
    for (const d of [0, 0.5, 0.9999]) {
      const seq = [0.25, d]
      const p = offsetPoint(origin.lat, origin.lng, () => seq.shift()!)
      expect(p.lat).toBeCloseTo(origin.lat, 9)
      expect(p.lng).toBeGreaterThan(origin.lng)
      expect(haversineKm(origin, p) * 1000).toBeCloseTo(10 + d * 5, 3)
    }
  })

  it('uses the extremes of the distance range', () => {
    const near = offsetPoint(origin.lat, origin.lng, (() => { const s = [0, 0]; return () => s.shift()! })())
    const far = offsetPoint(origin.lat, origin.lng, (() => { const s = [0.5, 0.999999]; return () => s.shift()! })())
    expect(haversineKm(origin, near) * 1000).toBeCloseTo(10, 3)
    expect(haversineKm(origin, far) * 1000).toBeCloseTo(15, 3)
    expect(far.lat).toBeLessThan(origin.lat) // bearing 180° = south
  })
})
