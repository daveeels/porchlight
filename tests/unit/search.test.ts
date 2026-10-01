import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { normalize, searchPlaces } from '@/lib/search'
import type { PlaceIndex } from '@/types/models'

const town = (name: string, count: number, areaKey: string | null = 'tauranga') => ({
  town: name,
  areaKey,
  region: 'Bay of Plenty',
  countryCode: 'NZ',
  count,
})

const index: PlaceIndex = {
  areas: { tauranga: { area: 'Tauranga & surrounds', count: 40 } },
  towns: {
    'papamoa-beach-bop-nz': town('Pāpāmoa Beach', 9),
    'papamoa-bop-nz': town('Pāpāmoa', 6),
    'tauranga-bop-nz': town('Tauranga', 12),
    'te-puke-bop-nz': town('Te Puke', 5),
    'mount-maunganui-bop-nz': town('Mount Maunganui', 8),
    'omokoroa-bop-nz': town('Ōmokoroa', 2),
    'rotorua-bop-nz': town('Rotorua', 3, null),
    'welcome-bay-bop-nz': town('Welcome Bay', 0),
  },
  updatedAt: Timestamp.fromMillis(0),
}

describe('normalize', () => {
  it('lowercases and strips macrons and diacritics', () => {
    expect(normalize('Pāpāmoa')).toBe('papamoa')
    expect(normalize('ŌMOKOROA')).toBe('omokoroa')
    expect(normalize('  Café  Crème ')).toBe('cafe creme')
  })
})

describe('searchPlaces', () => {
  it('finds Pāpāmoa without macrons', () => {
    const r = searchPlaces(index, 'papamoa')
    expect(r.map((x) => x.label)).toEqual(['Pāpāmoa Beach', 'Pāpāmoa'])
  })

  it('puts areas first, then towns', () => {
    const r = searchPlaces(index, 'tauranga')
    expect(r[0]).toMatchObject({ kind: 'area', key: 'tauranga', sublabel: 'Area' })
    expect(r[1]).toMatchObject({ kind: 'town', key: 'tauranga-bop-nz' })
  })

  it('shows the area name as the town context, else the region', () => {
    const [papamoa] = searchPlaces(index, 'pāpāmoa beach')
    expect(papamoa!.sublabel).toBe('Tauranga & surrounds')
    const [rotorua] = searchPlaces(index, 'roto')
    expect(rotorua!.sublabel).toBe('Bay of Plenty')
  })

  it('ranks prefix matches before substring matches', () => {
    const idx: PlaceIndex = {
      ...index,
      areas: {},
      towns: { a: town('Westlehm', 1), b: town('Lehmann', 1), c: town('Old Lehm Road', 50) },
    }
    expect(searchPlaces(idx, 'lehm').map((x) => x.key)).toEqual(['b', 'c', 'a'])
  })

  it('returns popular places by count for an empty query, skipping empty places', () => {
    const r = searchPlaces(index, '  ', 4)
    expect(r.map((x) => x.key)).toEqual([
      'tauranga',
      'tauranga-bop-nz',
      'papamoa-beach-bop-nz',
      'mount-maunganui-bop-nz',
    ])
    expect(searchPlaces(index, '', 50).some((x) => x.key === 'welcome-bay-bop-nz')).toBe(false)
  })

  it('respects the limit and returns nothing for no match', () => {
    expect(searchPlaces(index, 'a', 3)).toHaveLength(3)
    expect(searchPlaces(index, 'zzz')).toEqual([])
  })
})
