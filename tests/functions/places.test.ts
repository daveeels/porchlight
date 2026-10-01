import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { haversineKm } from '../../functions/src/lib/geo'
import { areaFor, coveredPlace, lookupPlace, MAX_PLACE_KM, nearestPlace, type PlaceRecord } from '../../functions/src/lib/places'

const places = JSON.parse(
  readFileSync(new URL('../../functions/data/places.json', import.meta.url), 'utf8'),
) as PlaceRecord[]

describe('lookupPlace', () => {
  // [label, lat, lng, expected town]. GeoNames has no "Welcome Bay" place, so
  // Welcome Bay resolves to neighbouring Hairini.
  const tauranga: Array<[string, number, number, string]> = [
    ['Mount Maunganui', -37.642, 176.183, 'Mount Maunganui'],
    ['Pāpāmoa', -37.73, 176.295, 'Pāpāmoa'],
    ['Te Puke', -37.784, 176.326, 'Te Puke'],
    ['The Lakes', -37.743, 176.109, 'The Lakes'],
    ['Bethlehem', -37.696, 176.107, 'Bethlehem'],
    ['Ōmokoroa', -37.65, 176.04, 'Ōmokoroa'],
    ['Welcome Bay', -37.723, 176.195, 'Hairini'],
  ]

  it.each(tauranga)('%s is in the Tauranga area', (_label, lat, lng, town) => {
    const place = lookupPlace(lat, lng)
    expect(place).toMatchObject({
      areaKey: 'tauranga',
      area: 'Tauranga & surrounds',
      town,
      region: 'Bay of Plenty',
      countryCode: 'NZ',
    })
    expect(place.townKey).toMatch(/^[a-z0-9-]+-e8-nz(-\d+)?$/)
  })

  it('puts Rotorua outside every area', () => {
    expect(lookupPlace(-38.1368, 176.2497)).toMatchObject({
      areaKey: null,
      area: null,
      town: 'Rotorua',
      townKey: 'rotorua-e8-nz',
      region: 'Bay of Plenty',
    })
    expect(areaFor(-38.1368, 176.2497)).toBeNull()
  })

  it('uses macron display names with ascii slugs', () => {
    const p = lookupPlace(-37.73, 176.295)
    expect(p.town).toBe('Pāpāmoa')
    expect(p.townKey).toBe('papamoa-e8-nz')
    expect(lookupPlace(-37.65, 176.04).townKey).toBe('omokoroa-e8-nz')
  })
})

describe('places.json', () => {
  it('has unique slugs and no dropped feature codes', () => {
    expect(places.length).toBeGreaterThan(2000)
    expect(new Set(places.map((p) => p.slug)).size).toBe(places.length)
    expect(places.every((p) => p.region !== '' && p.cc === 'NZ')).toBe(true)
  })
})

describe('nearestPlace', () => {
  it('matches a brute-force scan', () => {
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    for (let i = 0; i < 500; i++) {
      // Mainland NZ out to the Chatham Islands, across the antimeridian.
      const lng = 166 + rand() * 18
      const point = { lat: -48 + rand() * 14, lng: lng > 180 ? lng - 360 : lng }
      let best = places[0]!
      for (const p of places) if (haversineKm(point, p) < haversineKm(point, best)) best = p
      expect(haversineKm(point, nearestPlace(point.lat, point.lng))).toBeCloseTo(haversineKm(point, best), 9)
    }
  })

  it('searches across the antimeridian (Chatham Islands)', () => {
    const p = nearestPlace(-44.0, 179.9)
    expect(p.region).toBe('Chatham Islands')
    expect(p.lng).toBeLessThan(0)
  })

  it('still answers far from New Zealand', () => {
    expect(nearestPlace(51.5, -0.1).cc).toBe('NZ')
  })
})

describe('coveredPlace', () => {
  it('accepts points in New Zealand, including the Chatham Islands', () => {
    expect(coveredPlace(-37.7, 176.29)?.cc).toBe('NZ') // Pāpāmoa
    expect(coveredPlace(-36.85, 174.76)?.cc).toBe('NZ') // Auckland
    expect(coveredPlace(-43.95, -176.56)?.region).toBe('Chatham Islands')
  })

  it(`rejects points more than ${MAX_PLACE_KM} km from any place, and invalid points`, () => {
    expect(coveredPlace(-33.87, 151.21)).toBeNull() // Sydney
    expect(coveredPlace(-40, 170)).toBeNull() // Tasman Sea
    expect(coveredPlace(51.5, -0.1)).toBeNull() // London
    expect(coveredPlace(-90, 0)).toBeNull()
    expect(coveredPlace(90, 1e12)).toBeNull()
    expect(coveredPlace(Number.NaN, 176)).toBeNull()
  })
})
