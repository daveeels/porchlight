// Explore's history rules (src/lib/exploreHistory) and the card's map action.
import { describe, expect, it } from 'vitest'
import {
  MAP_KEY,
  SHEET_KEY,
  exploreIntent,
  isMapEntry,
  isSheetEntry,
  showOnMapPath,
  withoutParams,
} from '@/lib/exploreHistory'
import { mapAction } from '@/components/pin/format'

describe('exploreHistory', () => {
  it('knows the entries the app pushed for a card or the map', () => {
    expect(isSheetEntry({ position: 3, [SHEET_KEY]: 'a_HALLOWEEN_2026' }, 'a_HALLOWEEN_2026')).toBe(true)
    // A shared link / redirect: no marker, or a marker for another pin.
    expect(isSheetEntry({ position: 3 }, 'a_HALLOWEEN_2026')).toBe(false)
    expect(isSheetEntry({ [SHEET_KEY]: 'b' }, 'a')).toBe(false)
    expect(isSheetEntry(null, 'a')).toBe(false)
    expect(isSheetEntry({ [SHEET_KEY]: 'a' }, null)).toBe(false)
    expect(isMapEntry({ [MAP_KEY]: true })).toBe(true)
    expect(isMapEntry({ [MAP_KEY]: null })).toBe(false)
    expect(isMapEntry(undefined)).toBe(false)
  })

  it('reads pin + view=map as "show on the map", pin alone as the card', () => {
    expect(exploreIntent({ pin: 'x', view: 'map' })).toEqual({ pin: 'x', map: true })
    expect(exploreIntent({ pin: 'x' })).toEqual({ pin: 'x', map: false })
    expect(exploreIntent({ area: 'tauranga' })).toEqual({ pin: null, map: false })
    expect(exploreIntent({ pin: ['x', 'y'], view: 'list' })).toEqual({ pin: 'x', map: false })
  })

  it('drops params without touching the rest', () => {
    expect(withoutParams({ area: 'tauranga', pin: 'x', view: 'map' }, 'pin', 'view')).toEqual({ area: 'tauranga' })
  })

  it('builds the sign-in return path onto the map', () => {
    expect(showOnMapPath('u1_HALLOWEEN_2026')).toBe('/?pin=u1_HALLOWEEN_2026&view=map')
    expect(showOnMapPath('a b')).toBe('/?pin=a%20b&view=map')
  })
})

describe('mapAction (card "Show on map")', () => {
  it('shows it when the map is allowed now', () => {
    expect(mapAction(true, true, true)).toBe('show')
    expect(mapAction(true, false, true)).toBe('show') // mapAccess PUBLIC
  })
  it('asks a signed-out visitor to sign in when members get the map', () => {
    expect(mapAction(false, false, true)).toBe('sign-in')
  })
  it('hides it when the map is off', () => {
    expect(mapAction(false, false, false)).toBeNull()
    expect(mapAction(false, true, false)).toBeNull()
  })
})
