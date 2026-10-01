// Pure geo helpers (SPEC §6 createPin step 3). No Firebase imports.

export interface LatLng {
  lat: number
  lng: number
}

/** Mean Earth radius (IUGG), in metres. */
export const EARTH_RADIUS_M = 6_371_008.8

export const OFFSET_MIN_M = 25
export const OFFSET_MAX_M = 50

const toRad = (deg: number): number => (deg * Math.PI) / 180
const toDeg = (rad: number): number => (rad * 180) / Math.PI

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return (2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))) / 1000
}

/**
 * Moves a point a random 25–50 m (uniform distance) on a random bearing
 * (0–360°), correcting longitude by cos(latitude). This is the privacy offset:
 * call it once in createPin and never store or log the input point.
 */
export function offsetPoint(lat: number, lng: number, rand: () => number = Math.random): LatLng {
  const bearing = rand() * 2 * Math.PI
  const distanceM = OFFSET_MIN_M + rand() * (OFFSET_MAX_M - OFFSET_MIN_M)
  const dLat = (distanceM * Math.cos(bearing)) / EARTH_RADIUS_M
  const dLng = (distanceM * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(toRad(lat)))
  const newLat = Math.max(-90, Math.min(90, lat + toDeg(dLat)))
  let newLng = lng + toDeg(dLng)
  if (newLng > 180) newLng -= 360
  else if (newLng < -180) newLng += 360
  return { lat: newLat, lng: newLng }
}
