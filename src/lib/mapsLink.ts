// SPEC F3/F4: "Open in Maps" must open the real Maps app, including from
// in-app browsers (Facebook etc.), which swallow plain https Maps links.
//   Android in-app → geo: (handed to the Maps app by the system)
//   iPhone in-app  → maps:// (Apple Maps), Google Maps on the web as fallback
//   iPhone browser / home-screen app → https://maps.apple.com (a universal
//                    link: opens Apple Maps with no prompt, in a new tab, so a
//                    "Open in Maps?" confirm can never navigate Porchlight away)
//   everything else → Google Maps https URL (opens the app where installed)
import { detectInAppBrowser } from './inAppBrowser'

export interface MapsLink {
  /** Open this first. */
  primary: string
  /** Open this if the primary link didn't leave the page, or null. */
  fallback: string | null
}

function coords(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${coords(lat, lng)}`
}

export function appleMapsUrl(lat: number, lng: number): string {
  const c = coords(lat, lng)
  return `https://maps.apple.com/?q=${c}&ll=${c}`
}

export function mapsHref(lat: number, lng: number, ua: string = navigator.userAgent): MapsLink {
  const { inApp, os } = detectInAppBrowser(ua)
  const c = coords(lat, lng)
  if (os === 'android' && inApp) return { primary: `geo:${c}?q=${c}`, fallback: googleMapsUrl(lat, lng) }
  if (os === 'ios' && inApp) return { primary: `maps://?q=${c}`, fallback: googleMapsUrl(lat, lng) }
  if (os === 'ios') return { primary: appleMapsUrl(lat, lng), fallback: null }
  return { primary: googleMapsUrl(lat, lng), fallback: null }
}

/** How long to wait for the Maps app to take over before using the fallback. */
export const MAPS_FALLBACK_MS = 1500

export interface MapsWindow {
  location: { href: string }
  open(url: string, target: string, features?: string): unknown
  setTimeout(fn: () => void, ms: number): unknown
  document: { visibilityState: string }
}

/**
 * Opens the location in a Maps app. Call from a tap handler. App links
 * (geo:, maps://) navigate in place; if the page is still showing after
 * MAPS_FALLBACK_MS (no app took over), Google Maps on the web opens instead.
 * The https link opens in a new tab so Porchlight stays where it was.
 */
export function openInMaps(
  lat: number,
  lng: number,
  ua: string = navigator.userAgent,
  win: MapsWindow = window,
): void {
  const { primary, fallback } = mapsHref(lat, lng, ua)
  if (!fallback) {
    win.open(primary, '_blank', 'noopener')
    return
  }
  win.location.href = primary
  win.setTimeout(() => {
    if (win.document.visibilityState === 'visible') win.location.href = fallback
  }, MAPS_FALLBACK_MS)
}
