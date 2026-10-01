import { describe, expect, it, vi } from 'vitest'
import { MAPS_FALLBACK_MS, appleMapsUrl, googleMapsUrl, mapsHref, openInMaps, type MapsWindow } from '@/lib/mapsLink'
import { UA } from './userAgents'

const LAT = -37.6878
const LNG = 176.1651
const GOOGLE = 'https://www.google.com/maps/search/?api=1&query=-37.687800,176.165100'
const GEO = 'geo:-37.687800,176.165100?q=-37.687800,176.165100'
const APPLE = 'maps://?q=-37.687800,176.165100'
const APPLE_WEB = 'https://maps.apple.com/?q=-37.687800,176.165100&ll=-37.687800,176.165100'

describe('mapsHref (SPEC F3/F4)', () => {
  it('builds the Google Maps search URL', () => {
    expect(googleMapsUrl(LAT, LNG)).toBe(GOOGLE)
  })

  it.each(['facebookAndroid', 'instagramAndroid', 'messengerAndroid', 'androidWebView'] as const)(
    'Android in-app (%s) → geo: with Google Maps fallback',
    (key) => {
      expect(mapsHref(LAT, LNG, UA[key])).toEqual({ primary: GEO, fallback: GOOGLE })
    },
  )

  it.each(['facebookIos', 'instagramIos', 'messengerIos'] as const)(
    'iPhone in-app (%s) → maps:// with Google Maps fallback',
    (key) => {
      expect(mapsHref(LAT, LNG, UA[key])).toEqual({ primary: APPLE, fallback: GOOGLE })
    },
  )

  it.each(['safariIos', 'homeScreenIos', 'chromeIos'] as const)(
    'iPhone browser (%s) → Apple Maps universal link, no timer fallback',
    (key) => {
      expect(appleMapsUrl(LAT, LNG)).toBe(APPLE_WEB)
      expect(mapsHref(LAT, LNG, UA[key])).toEqual({ primary: APPLE_WEB, fallback: null })
    },
  )

  it.each(['chromeAndroid', 'samsungAndroid', 'chromeDesktop', 'safariMac'] as const)(
    '%s → Google Maps https',
    (key) => {
      expect(mapsHref(LAT, LNG, UA[key])).toEqual({ primary: GOOGLE, fallback: null })
    },
  )
})

function fakeWindow(): MapsWindow & { timers: Array<() => void> } {
  const timers: Array<() => void> = []
  return {
    timers,
    location: { href: 'https://porchlight-nz.firebaseapp.com/?pin=x' },
    open: vi.fn(),
    setTimeout: vi.fn((fn: () => void) => {
      timers.push(fn)
      return 1
    }),
    document: { visibilityState: 'visible' },
  }
}

describe('openInMaps', () => {
  it('iPhone Safari opens Apple Maps in a new tab and never navigates Porchlight away', () => {
    const win = fakeWindow()
    const before = win.location.href
    openInMaps(LAT, LNG, UA.safariIos, win)
    expect(win.open).toHaveBeenCalledWith(APPLE_WEB, '_blank', 'noopener')
    expect(win.setTimeout).not.toHaveBeenCalled()
    expect(win.location.href).toBe(before)
  })

  it('opens the https link in a new tab when there is no app link', () => {
    const win = fakeWindow()
    openInMaps(LAT, LNG, UA.chromeDesktop, win)
    expect(win.open).toHaveBeenCalledWith(GOOGLE, '_blank', 'noopener')
    expect(win.setTimeout).not.toHaveBeenCalled()
  })

  it('tries the app link, then falls back if the page is still showing', () => {
    const win = fakeWindow()
    openInMaps(LAT, LNG, UA.facebookIos, win)
    expect(win.location.href).toBe(APPLE)
    expect(win.setTimeout).toHaveBeenCalledWith(expect.any(Function), MAPS_FALLBACK_MS)
    win.timers[0]!()
    expect(win.location.href).toBe(GOOGLE)
  })

  it('does not fall back once the Maps app has taken over', () => {
    const win = fakeWindow()
    openInMaps(LAT, LNG, UA.facebookAndroid, win)
    expect(win.location.href).toBe(GEO)
    win.document.visibilityState = 'hidden'
    win.timers[0]!()
    expect(win.location.href).toBe(GEO)
  })
})
