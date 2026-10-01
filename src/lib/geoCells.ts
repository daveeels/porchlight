// Fixed geohash cells for the map and "near me" (SPEC §4 F1/F2). Cells, not
// geohashQueryBounds ranges, so each one is a stable cache key.
import { distanceBetween, geohashForLocation } from 'geofire-common'

export interface LatLng {
  lat: number
  lng: number
}

export interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

/** Most cells a single viewport may load (SPEC F2). */
export const MAX_CELLS = 9

/** Pins load only at zoom ≥ 11: precision 4 for 11–12.99, 5 for ≥ 13. */
export function cellPrecisionForZoom(zoom: number): 4 | 5 | null {
  if (!(zoom >= 11)) return null
  return zoom < 13 ? 4 : 5
}

/** Cell size in degrees and grid dimensions for a geohash precision. */
function grid(precision: number) {
  const bits = precision * 5
  const lngBits = Math.ceil(bits / 2)
  const latBits = Math.floor(bits / 2)
  const cols = 2 ** lngBits
  const rows = 2 ** latBits
  return { cols, rows, width: 360 / cols, height: 180 / rows }
}

const EPS = 1e-9

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function normLng(lng: number): number {
  return mod(lng + 180, 360) - 180
}

function cellAt(row: number, col: number, precision: number): string {
  const g = grid(precision)
  const lat = -90 + (row + 0.5) * g.height
  const lng = -180 + (mod(col, g.cols) + 0.5) * g.width
  return geohashForLocation([lat, lng], precision)
}

function rowFor(lat: number, precision: number): number {
  const g = grid(precision)
  return clamp(Math.floor((lat + 90) / g.height), 0, g.rows - 1)
}

function colFor(lng: number, precision: number): number {
  const g = grid(precision)
  return clamp(Math.floor((normLng(lng) + 180) / g.width), 0, g.cols - 1)
}

/**
 * Distinct geohash cells covering the box, or null if more than MAX_CELLS
 * would be needed (the caller shows "Zoom in"). Handles boxes crossing the
 * antimeridian (west > east).
 */
export function cellsForBounds(bounds: Bounds, precision: number): string[] | null {
  const g = grid(precision)
  const south = clamp(Math.min(bounds.south, bounds.north), -90, 90)
  const north = clamp(Math.max(bounds.south, bounds.north), -90, 90)
  const row0 = rowFor(south, precision)
  const row1 = Math.max(row0, rowFor(north - EPS, precision))

  const west = normLng(bounds.west)
  let east = normLng(bounds.east)
  if (east < west) east += 360
  const span = bounds.east - bounds.west >= 360 ? 360 : east - west
  const col0 = colFor(west, precision)
  const col1 = Math.max(col0, Math.floor((west + span - EPS + 180) / g.width))

  const rowCount = row1 - row0 + 1
  const colCount = Math.min(col1 - col0 + 1, g.cols)
  if (rowCount * colCount > MAX_CELLS) return null

  const cells: string[] = []
  for (let r = row0; r <= row1; r++) {
    for (let c = col0; c < col0 + colCount; c++) cells.push(cellAt(r, c, precision))
  }
  return [...new Set(cells)]
}

/**
 * Cells for a map viewport at the zoom's precision (SPEC F2). If precision 5
 * needs more than MAX_CELLS (e.g. a wide desktop window at zoom 13), fall
 * back to precision 4 before giving up. Null means "too wide: zoom in".
 */
export function cellsForViewport(bounds: Bounds, precision: 4 | 5): string[] | null {
  const cells = cellsForBounds(bounds, precision)
  if (cells || precision === 4) return cells
  return cellsForBounds(bounds, 4)
}

/** The cell containing the point, then its (up to) 8 neighbours. */
export function cellsAround(lat: number, lng: number, precision = 5): string[] {
  const g = grid(precision)
  const row = rowFor(lat, precision)
  const col = colFor(lng, precision)
  const cells = [cellAt(row, col, precision)]
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      if (r < 0 || r >= g.rows) continue
      cells.push(cellAt(r, col + dc, precision))
    }
  }
  return [...new Set(cells)]
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  return distanceBetween([a.lat, a.lng], [b.lat, b.lng])
}
