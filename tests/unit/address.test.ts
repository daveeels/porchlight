import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADDRESS_MAX_RESULTS,
  formatAddress,
  NZ_BBOX,
  parsePhotonResults,
  photonSearchUrl,
} from '@/lib/address'
import { AddressSearchError, searchAddresses } from '@/services/addressSearch'

function feature(properties: Record<string, unknown>, coordinates: unknown = [176.18, -37.64]) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties }
}

const HOUSE = {
  osm_type: 'N',
  osm_id: 123,
  housenumber: '12',
  street: 'Ocean Beach Road',
  district: 'Mount Maunganui',
  city: 'Tauranga',
  state: 'Bay of Plenty',
  country: 'New Zealand / Aotearoa',
  countrycode: 'NZ',
  type: 'house',
}

describe('photonSearchUrl', () => {
  it('limits to 6 NZ results in English, biased to the launch centre', () => {
    const url = new URL(photonSearchUrl('https://photon.komoot.io/api/', '  ocean beach  ', { lat: -37.6878, lng: 176.1651 }))
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/')
    expect(url.searchParams.get('q')).toBe('ocean beach')
    expect(url.searchParams.get('limit')).toBe(String(ADDRESS_MAX_RESULTS))
    expect(ADDRESS_MAX_RESULTS).toBe(6)
    expect(url.searchParams.get('lang')).toBe('en')
    expect(url.searchParams.get('bbox')).toBe(NZ_BBOX)
    expect(NZ_BBOX).toBe('166.0,-47.6,179.0,-34.0')
    expect(url.searchParams.get('lat')).toBe('-37.6878')
    expect(url.searchParams.get('lon')).toBe('176.1651')
  })

  it('leaves the bias out when there is no centre', () => {
    const url = new URL(photonSearchUrl('https://photon.komoot.io/api/', 'papamoa'))
    expect(url.searchParams.has('lat')).toBe(false)
    expect(url.searchParams.has('lon')).toBe(false)
  })
})

describe('formatAddress', () => {
  it('is "house number + street, suburb, city"', () => {
    expect(formatAddress(HOUSE)).toEqual({
      title: '12 Ocean Beach Road',
      detail: 'Mount Maunganui, Tauranga',
      label: '12 Ocean Beach Road, Mount Maunganui, Tauranga',
    })
  })

  it('puts a named place before its street', () => {
    expect(formatAddress({ ...HOUSE, name: 'Mount Maunganui Primary School', housenumber: '42' })?.label).toBe(
      'Mount Maunganui Primary School, 42 Ocean Beach Road, Mount Maunganui, Tauranga',
    )
  })

  it('handles a street (its name is the street) and falls back to locality / county', () => {
    expect(formatAddress({ name: 'Papamoa Beach Road', locality: 'Pāpāmoa Beach', county: 'Tauranga City' })).toEqual({
      title: 'Papamoa Beach Road',
      detail: 'Pāpāmoa Beach, Tauranga City',
      label: 'Papamoa Beach Road, Pāpāmoa Beach, Tauranga City',
    })
    expect(formatAddress({ name: 'Ocean Beach Road', street: 'Ocean Beach Road', city: 'Tauranga' })?.label).toBe(
      'Ocean Beach Road, Tauranga',
    )
  })

  it('drops repeated parts, ignoring case and macrons', () => {
    expect(formatAddress({ name: 'Tauranga', city: 'Tauranga', state: 'Bay of Plenty' })?.label).toBe('Tauranga')
    expect(formatAddress({ housenumber: '5', street: 'Main Road', district: 'Pāpāmoa', city: 'papamoa' })?.label).toBe(
      '5 Main Road, Pāpāmoa',
    )
  })

  it('never includes the country, and gives up with nothing to show', () => {
    expect(formatAddress(HOUSE)?.label).not.toContain('New Zealand')
    expect(formatAddress({ country: 'New Zealand', countrycode: 'NZ' })).toBeNull()
    expect(formatAddress({ name: '   ' })).toBeNull()
  })
})

describe('parsePhotonResults', () => {
  it('maps GeoJSON points ([lng, lat]) to rows', () => {
    const [row] = parsePhotonResults({ type: 'FeatureCollection', features: [feature(HOUSE, [176.1815, -37.6395])] })
    expect(row).toEqual({
      id: 'N123',
      title: '12 Ocean Beach Road',
      detail: 'Mount Maunganui, Tauranga',
      label: '12 Ocean Beach Road, Mount Maunganui, Tauranga',
      lat: -37.6395,
      lng: 176.1815,
    })
  })

  it('skips bad geometry, other countries and duplicates; caps at 6', () => {
    const features = [
      feature(HOUSE),
      feature({ ...HOUSE, osm_id: 124 }), // same label
      feature({ ...HOUSE, housenumber: '13' }, ['176', -37.6]),
      feature({ ...HOUSE, housenumber: '14' }, [176.2]),
      feature({ ...HOUSE, housenumber: '15' }, [Number.NaN, -37.6]),
      feature({ ...HOUSE, housenumber: '16' }, [176.2, -95]),
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[176, -37]] }, properties: HOUSE },
      feature({ ...HOUSE, housenumber: '1', countrycode: 'AU', city: 'Sydney' }),
      null,
      ...Array.from({ length: 10 }, (_, i) => feature({ ...HOUSE, osm_id: 200 + i, housenumber: String(20 + i) })),
    ]
    const rows = parsePhotonResults({ features })
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.title)).toEqual([
      '12 Ocean Beach Road',
      '20 Ocean Beach Road',
      '21 Ocean Beach Road',
      '22 Ocean Beach Road',
      '23 Ocean Beach Road',
      '24 Ocean Beach Road',
    ])
  })

  it('is empty for anything that is not a feature collection', () => {
    expect(parsePhotonResults(null)).toEqual([])
    expect(parsePhotonResults({})).toEqual([])
    expect(parsePhotonResults({ features: 'nope' })).toEqual([])
  })
})

describe('searchAddresses', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches Photon without credentials or referrer and parses the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [feature(HOUSE)] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await searchAddresses('ocean beach', { near: { lat: -37.6878, lng: 176.1651 } })
    expect(rows.map((r) => r.label)).toEqual(['12 Ocean Beach Road, Mount Maunganui, Tauranga'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://photon.komoot.io/api/?q=ocean+beach')
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  })

  it('reports HTTP errors and network failures as "failed", offline as "offline"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 503 })))
    await expect(searchAddresses('ocean beach')).rejects.toMatchObject({ kind: 'failed' })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(searchAddresses('ocean beach')).rejects.toBeInstanceOf(AddressSearchError)

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(searchAddresses('ocean beach')).rejects.toMatchObject({ kind: 'offline' })
  })

  it('passes an abort through (a newer query replaced this one)', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    await expect(searchAddresses('ocean beach', { signal: new AbortController().signal })).rejects.toBe(abort)
  })
})
