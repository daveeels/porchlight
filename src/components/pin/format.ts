// Display helpers shared by the pin card and the detail sheet.
import type { Pin } from '@/types/models'

/** Card line: "3 say it's here". */
export function hereCountShort(n: number): string {
  if (n <= 0) return 'No votes yet'
  return n === 1 ? "1 says it's here" : `${n} say it's here`
}

/** Sheet line: "12 people say it's here". */
export function hereCountLong(n: number): string {
  if (n <= 0) return "No one has confirmed it's here yet"
  return n === 1 ? "1 person says it's here" : `${n} people say it's here`
}

export function notThereCountLong(n: number): string {
  return n === 1 ? "1 person says it's not there" : `${n} people say it's not there`
}

/** "Pāpāmoa Beach · Tauranga & surrounds" (region when the town has no area). */
export function placeLine(pin: Pin): string {
  const { town, area, region } = pin.place
  const context = area ?? region
  return context && context !== town ? `${town} · ${context}` : town
}

/** Directions to the (already offset) pin location. */
export function mapsUrl(pin: Pin): string {
  const { latitude, longitude } = pin.geo
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`
}

/** The short share link (a redirect route onto /?pin=). */
export function pinShareUrl(pinId: string, origin = window.location.origin): string {
  return `${origin}/p/${encodeURIComponent(pinId)}`
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}
