import { describe, expect, it } from 'vitest'
import { geohashForLocation } from 'geofire-common'
import { cellPrecisionForZoom, cellsAround, cellsForBounds, cellsForViewport, distanceKm } from '@/lib/geoCells'

const PAPAMOA = { lat: -37.7, lng: 176.29 }

describe('cellPrecisionForZoom', () => {
  it('returns null below zoom 11', () => {
    expect(cellPrecisionForZoom(0)).toBeNull()
    expect(cellPrecisionForZoom(10.99)).toBeNull()
  })

  it('uses precision 4 for 11–12.99 and 5 from 13', () => {
    expect(cellPrecisionForZoom(11)).toBe(4)
    expect(cellPrecisionForZoom(12.99)).toBe(4)
    expect(cellPrecisionForZoom(13)).toBe(5)
    expect(cellPrecisionForZoom(18)).toBe(5)
  })
})

describe('cellsForBounds', () => {
  it('returns the single containing cell for a tiny box', () => {
    const b = { north: -37.7, south: -37.7001, east: 176.2901, west: 176.29 }
    expect(cellsForBounds(b, 5)).toEqual([geohashForLocation([PAPAMOA.lat, PAPAMOA.lng], 5)])
  })

  it('covers every corner of the box with distinct cells', () => {
    const b = { north: -37.66, south: -37.74, east: 176.33, west: 176.25 }
    const cells = cellsForBounds(b, 5)
    expect(cells).not.toBeNull()
    expect(new Set(cells).size).toBe(cells!.length)
    expect(cells!.length).toBeLessThanOrEqual(9)
    for (const [lat, lng] of [
      [b.north - 1e-6, b.west],
      [b.north - 1e-6, b.east - 1e-6],
      [b.south, b.west],
      [b.south, b.east - 1e-6],
      [-37.7, 176.29],
    ] as const) {
      expect(cells).toContain(geohashForLocation([lat, lng], 5))
    }
    for (const c of cells!) expect(c).toHaveLength(5)
  })

  it('returns null when more than 9 cells are needed', () => {
    const wide = { north: -37.5, south: -37.9, east: 176.5, west: 176.0 }
    expect(cellsForBounds(wide, 5)).toBeNull()
  })

  it('covers a phone viewport at zoom 11 with precision 4', () => {
    const b = { north: -37.6, south: -37.78, east: 176.23, west: 176.1 }
    const cells = cellsForBounds(b, 4)
    expect(cells).not.toBeNull()
    expect(cells!.length).toBeGreaterThan(0)
    expect(cells).toContain(geohashForLocation([-37.69, 176.17], 4))
  })

  it('handles boxes crossing the antimeridian', () => {
    const b = { north: -43.9, south: -44.0, east: -179.98, west: 179.98 }
    const cells = cellsForBounds(b, 5)
    expect(cells).not.toBeNull()
    expect(cells).toContain(geohashForLocation([-43.95, 179.99], 5))
    expect(cells).toContain(geohashForLocation([-43.95, -179.99], 5))
  })
})

describe('cellsForViewport', () => {
  // A wide desktop window at zoom 13 (~0.33° x 0.15°): too many precision-5 cells.
  const desktop = { north: -37.62, south: -37.77, east: 176.33, west: 176.0 }

  it('uses the requested precision when it fits', () => {
    const b = { north: -37.66, south: -37.74, east: 176.33, west: 176.25 }
    const cells = cellsForViewport(b, 5)
    expect(cells).toEqual(cellsForBounds(b, 5))
    expect(cells!.every((c) => c.length === 5)).toBe(true)
  })

  it('falls back to precision 4 when precision 5 needs more than 9 cells', () => {
    expect(cellsForBounds(desktop, 5)).toBeNull()
    const cells = cellsForViewport(desktop, 5)
    expect(cells).not.toBeNull()
    expect(cells!.length).toBeLessThanOrEqual(9)
    expect(cells!.every((c) => c.length === 4)).toBe(true)
    expect(cells).toEqual(cellsForBounds(desktop, 4))
  })

  it('returns null when even precision 4 is too wide', () => {
    const huge = { north: -36.5, south: -38.5, east: 177.5, west: 175.0 }
    expect(cellsForViewport(huge, 5)).toBeNull()
    expect(cellsForViewport(huge, 4)).toBeNull()
  })
})

describe('cellsAround', () => {
  it('returns the containing cell first plus 8 distinct neighbours', () => {
    const cells = cellsAround(PAPAMOA.lat, PAPAMOA.lng)
    expect(cells).toHaveLength(9)
    expect(new Set(cells).size).toBe(9)
    expect(cells[0]).toBe(geohashForLocation([PAPAMOA.lat, PAPAMOA.lng], 5))
  })

  it('includes points just across each edge', () => {
    const cells = cellsAround(PAPAMOA.lat, PAPAMOA.lng)
    const d = 0.04 // just under one precision-5 cell (~0.044°)
    for (const [dl, dg] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
      [d, d],
      [-d, -d],
    ]) {
      expect(cells).toContain(geohashForLocation([PAPAMOA.lat + dl!, PAPAMOA.lng + dg!], 5))
    }
  })

  it('honours the precision argument', () => {
    const cells = cellsAround(PAPAMOA.lat, PAPAMOA.lng, 4)
    expect(cells.every((c) => c.length === 4)).toBe(true)
  })
})

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(PAPAMOA, PAPAMOA)).toBe(0)
  })

  it('measures Tauranga to Te Puke at about 20 km', () => {
    const tauranga = { lat: -37.6878, lng: 176.1651 }
    const tePuke = { lat: -37.7833, lng: 176.3167 }
    const d = distanceKm(tauranga, tePuke)
    expect(d).toBeGreaterThan(15)
    expect(d).toBeLessThan(20)
  })
})
