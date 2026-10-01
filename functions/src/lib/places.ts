// Place lookup for pins (SPEC §5 "Place data"): nearest GeoNames town from
// functions/data/places.json (built by scripts/buildPlaces.ts) plus the first
// hand-defined area from functions/data/areas.json that contains the point.
// Always call with the OFFSET point. Data is loaded once per function instance.
import { readFileSync } from 'node:fs'
import { haversineKm } from './geo.js'

export interface PlaceRecord {
  id: number
  name: string
  ascii: string
  region: string
  cc: string
  lat: number
  lng: number
  slug: string
  pop: number
}

export interface Area {
  key: string
  name: string
  center: { lat: number; lng: number }
  radiusKm: number
}

export interface PinPlace {
  areaKey: string | null
  area: string | null
  townKey: string
  town: string
  region: string
  countryCode: string
}

// Same relative path from src/lib/ (vitest) and lib/lib/ (compiled): functions/data/.
function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8')) as T
}

const CELL_DEG = 0.25
/** Past this many rings (~12.5°) without a hit, fall back to a full scan. */
const MAX_RINGS = 50
const KM_PER_DEG = 111.195

let cache: { places: PlaceRecord[]; areas: Area[]; grid: Map<string, PlaceRecord[]> } | null = null

const COLS = Math.round(360 / CELL_DEG)

/** Grid key; columns wrap at the antimeridian (the Chatham Islands sit east of it). */
function cellKey(row: number, col: number): string {
  const wrapped = ((((col + COLS / 2) % COLS) + COLS) % COLS) - COLS / 2
  return `${row}:${wrapped}`
}

function data(): NonNullable<typeof cache> {
  if (cache) return cache
  const places = loadJson<PlaceRecord[]>('places.json')
  const areas = loadJson<Area[]>('areas.json')
  const grid = new Map<string, PlaceRecord[]>()
  for (const p of places) {
    const key = cellKey(Math.floor(p.lat / CELL_DEG), Math.floor(p.lng / CELL_DEG))
    const bucket = grid.get(key)
    if (bucket) bucket.push(p)
    else grid.set(key, [p])
  }
  cache = { places, areas, grid }
  return cache
}

/** The first area whose circle contains the point, or null. */
export function areaFor(lat: number, lng: number): Area | null {
  return data().areas.find((a) => haversineKm(a.center, { lat, lng }) <= a.radiusKm) ?? null
}

/** The nearest populated place to the point (grid bucket search). */
export function nearestPlace(lat: number, lng: number): PlaceRecord {
  const { places, grid } = data()
  if (places.length === 0) throw new Error('places.json is empty — run npm run places:build')
  const point = { lat, lng }
  const row0 = Math.floor(lat / CELL_DEG)
  const col0 = Math.floor(lng / CELL_DEG)
  let best: PlaceRecord | null = null
  let bestKm = Infinity

  for (let r = 0; r <= MAX_RINGS; r++) {
    // Anything in ring r is at least (r - 1) cells away in lat or lng.
    // Longitude degrees shrink towards the poles, so use the smallest cos(lat) the ring touches;
    // 0.9 covers great circles cutting poleward of a parallel over a wide ring.
    const maxAbsLat = Math.min(89, Math.abs(lat) + (r + 1) * CELL_DEG)
    const minKm = 0.9 * Math.max(0, r - 1) * CELL_DEG * KM_PER_DEG * Math.cos((maxAbsLat * Math.PI) / 180)
    if (best && minKm > bestKm) return best

    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue // ring edge only
        const bucket = grid.get(cellKey(row0 + dr, col0 + dc))
        if (!bucket) continue
        for (const p of bucket) {
          const km = haversineKm(point, p)
          if (km < bestKm) {
            best = p
            bestKm = km
          }
        }
      }
    }
  }

  // Far from every place: scan everything.
  for (const p of places) {
    const km = haversineKm(point, p)
    if (km < bestKm) {
      best = p
      bestKm = km
    }
  }
  return best as PlaceRecord
}

/** The `place` field for a pin at this (offset) point. */
export function lookupPlace(lat: number, lng: number): PinPlace {
  const area = areaFor(lat, lng)
  const town = nearestPlace(lat, lng)
  return {
    areaKey: area?.key ?? null,
    area: area?.name ?? null,
    townKey: town.slug,
    town: town.name,
    region: town.region,
    countryCode: town.cc,
  }
}
