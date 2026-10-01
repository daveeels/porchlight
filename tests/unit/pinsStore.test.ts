import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Pin, PlaceIndex } from '@/types/models'

vi.mock('@/services/pins', () => ({
  PAGE_SIZE: 20,
  CELL_LIMIT: 200,
  fetchPlacePage: vi.fn(),
  fetchCellPins: vi.fn(),
  fetchPin: vi.fn(),
}))
vi.mock('@/services/places', () => ({ fetchPlaceIndex: vi.fn() }))
vi.mock('@/services/config', () => ({
  DEFAULT_APP_CONFIG: {
    mapAccess: 'ACCOUNT',
    launchCenter: { lat: -37.6878, lng: 176.1651, zoom: 11 },
    defaultAreaKey: 'tauranga',
  },
  fetchAppConfig: vi.fn(),
  fetchEvents: vi.fn(),
}))

import { fetchCellPins, fetchPin, fetchPlacePage } from '@/services/pins'
import { fetchPlaceIndex } from '@/services/places'
import { cellsAround } from '@/lib/geoCells'
import { CELL_TTL_MS, usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'

const mockPage = vi.mocked(fetchPlacePage)
const mockCell = vi.mocked(fetchCellPins)
const mockPin = vi.mocked(fetchPin)
const mockIndex = vi.mocked(fetchPlaceIndex)

function pin(id: string, over: Partial<Pin> & { lat?: number; lng?: number } = {}): Pin {
  const { lat = -37.7, lng = 176.29, ...rest } = over
  return {
    id,
    verified: false,
    isFeatured: false,
    geo: { latitude: lat, longitude: lng },
    ...rest,
  } as unknown as Pin
}

const cursor = (n: number) => ({ cursor: n }) as never

let eventId: string

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const season = useSeasonStore()
  season.season = 'HALLOWEEN'
  eventId = season.eventId!
})

afterEach(() => {
  vi.useRealTimers()
})

describe('area/town list', () => {
  it('loads the first page for the selection and pages with the cursor', async () => {
    const store = usePinsStore()
    mockPage.mockResolvedValueOnce({ pins: [pin('a'), pin('b')], cursor: cursor(1), done: false })
    await store.setSelection({ kind: 'area', key: 'tauranga' })
    expect(mockPage).toHaveBeenCalledWith(eventId, { kind: 'area', key: 'tauranga' }, null)
    expect(store.listPins.map((p) => p.id)).toEqual(['a', 'b'])
    expect(store.canLoadMore).toBe(true)

    // 'b' reappears on page 2 (its score changed): de-duplicated.
    mockPage.mockResolvedValueOnce({ pins: [pin('b'), pin('c')], cursor: cursor(2), done: true })
    await store.loadMore()
    expect(mockPage).toHaveBeenLastCalledWith(eventId, { kind: 'area', key: 'tauranga' }, cursor(1))
    expect(store.listPins.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(store.done).toBe(true)
    expect(store.canLoadMore).toBe(false)

    await store.loadMore()
    expect(mockPage).toHaveBeenCalledTimes(2)
  })

  it('records errors', async () => {
    const store = usePinsStore()
    mockPage.mockRejectedValueOnce(new Error('offline'))
    await store.setSelection({ kind: 'town', key: 'te-puke-bop-nz' })
    expect(store.error).toBeInstanceOf(Error)
    expect(store.loading).toBe(false)
  })

  it('ignores a stale page after the selection changes', async () => {
    const store = usePinsStore()
    let resolveFirst!: (v: Awaited<ReturnType<typeof fetchPlacePage>>) => void
    mockPage.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
    const first = store.setSelection({ kind: 'town', key: 'x' })
    mockPage.mockResolvedValueOnce({ pins: [pin('y1')], cursor: cursor(1), done: true })
    await store.setSelection({ kind: 'town', key: 'y' })
    resolveFirst({ pins: [pin('x1')], cursor: cursor(9), done: false })
    await first
    expect(store.listPins.map((p) => p.id)).toEqual(['y1'])
  })

  it('verified only: stops at the first unverified non-featured pin, dropping featured-unverified', async () => {
    const store = usePinsStore()
    mockPage.mockResolvedValueOnce({
      pins: [
        pin('fv', { isFeatured: true, verified: true }),
        pin('fu', { isFeatured: true }),
        pin('v1', { verified: true }),
        pin('u1'),
        pin('v2', { verified: true }),
      ],
      cursor: cursor(1),
      done: false,
    })
    await store.setSelection({ kind: 'area', key: 'tauranga' })
    expect(store.visibleListPins).toHaveLength(5)
    expect(store.canLoadMore).toBe(true)

    store.verifiedOnly = true
    expect(store.visibleListPins.map((p) => p.id)).toEqual(['fv', 'v1'])
    expect(store.canLoadMore).toBe(false)
    await store.loadMore()
    expect(mockPage).toHaveBeenCalledTimes(1)
  })

  it('verified only keeps loading while every pin so far is verified', async () => {
    const store = usePinsStore()
    store.verifiedOnly = true
    mockPage.mockResolvedValueOnce({
      pins: [pin('v1', { verified: true })],
      cursor: cursor(1),
      done: false,
    })
    await store.setSelection({ kind: 'area', key: 'tauranga' })
    expect(store.canLoadMore).toBe(true)
  })
})

describe('near me', () => {
  it('loads the 9 precision-5 cells, sorts by distance and caps at 100', async () => {
    const store = usePinsStore()
    const here = { lat: -37.7, lng: 176.29 }
    const far = Array.from({ length: 120 }, (_, i) =>
      pin(`far${i}`, { lat: -37.7 - 0.0001 * (i + 10), lng: 176.29 }),
    )
    mockCell.mockImplementation(async (_e, cell) =>
      cell === cellsAround(here.lat, here.lng)[0]
        ? { pins: [...far, pin('near', { lat: -37.70001, lng: 176.29 })], truncated: false }
        : { pins: [], truncated: false },
    )
    await store.loadNearMe(here.lat, here.lng)
    expect(mockCell).toHaveBeenCalledTimes(9)
    for (const c of cellsAround(here.lat, here.lng, 5)) expect(mockCell).toHaveBeenCalledWith(eventId, c)
    expect(store.selection).toEqual({ kind: 'nearMe', lat: here.lat, lng: here.lng })
    expect(store.listPins).toHaveLength(100)
    expect(store.listPins[0]!.id).toBe('near')
    expect(store.listPins[1]!.id).toBe('far0')
    expect(store.canLoadMore).toBe(false)
    expect(store.distanceFromSelection(store.listPins[0]!)).toBeLessThan(0.01)
  })

  it('verified only filters on pin.verified', async () => {
    const store = usePinsStore()
    mockCell.mockResolvedValue({ pins: [], truncated: false })
    mockCell.mockResolvedValueOnce({
      pins: [pin('u1'), pin('v1', { verified: true }), pin('fu', { isFeatured: true })],
      truncated: false,
    })
    await store.loadNearMe(-37.7, 176.29)
    store.verifiedOnly = true
    expect(store.visibleListPins.map((p) => p.id)).toEqual(['v1'])
  })
})

describe('shared cell cache', () => {
  it('fetches only uncached cells and refetches after 5 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'))
    const store = usePinsStore()
    mockCell.mockImplementation(async (_e, cell) => ({ pins: [pin(`p-${cell}`)], truncated: cell === 'rbzz' }))

    const r1 = await store.getCells(['rbzx', 'rbzy'])
    expect(r1.pins.map((p) => p.id).sort()).toEqual(['p-rbzx', 'p-rbzy'])
    expect(r1.truncated).toBe(false)
    expect(mockCell).toHaveBeenCalledTimes(2)

    const r2 = await store.getCells(['rbzy', 'rbzz'])
    expect(mockCell).toHaveBeenCalledTimes(3)
    expect(mockCell).toHaveBeenLastCalledWith(eventId, 'rbzz')
    expect(r2.truncated).toBe(true)

    vi.setSystemTime(Date.now() + CELL_TTL_MS + 1)
    await store.getCells(['rbzx'])
    expect(mockCell).toHaveBeenCalledTimes(4)
  })

  it('shares cells between near me and the map', async () => {
    const store = usePinsStore()
    mockCell.mockResolvedValue({ pins: [], truncated: false })
    await store.loadNearMe(-37.7, 176.29)
    expect(mockCell).toHaveBeenCalledTimes(9)
    await store.getCells(cellsAround(-37.7, 176.29))
    expect(mockCell).toHaveBeenCalledTimes(9)
  })

  it('de-duplicates concurrent requests for the same cell', async () => {
    const store = usePinsStore()
    mockCell.mockResolvedValue({ pins: [], truncated: false })
    await Promise.all([store.getCells(['rbzx']), store.getCells(['rbzx'])])
    expect(mockCell).toHaveBeenCalledTimes(1)
  })
})

describe('selected pin', () => {
  it('uses an already loaded pin without fetching', async () => {
    const store = usePinsStore()
    mockPage.mockResolvedValueOnce({ pins: [pin('a', { title: 'Spooky' })], cursor: null, done: true })
    await store.setSelection({ kind: 'area', key: 'tauranga' })
    await store.selectPin('a')
    expect(store.selectedPin?.title).toBe('Spooky')
    expect(mockPin).not.toHaveBeenCalled()
  })

  it('fetches an unknown pin and flags a missing one', async () => {
    const store = usePinsStore()
    mockPin.mockResolvedValueOnce(pin('z'))
    await store.selectPin('z')
    expect(mockPin).toHaveBeenCalledWith('z')
    expect(store.selectedPin?.id).toBe('z')

    mockPin.mockResolvedValueOnce(null)
    await store.selectPin('gone')
    expect(store.selectedPin).toBeNull()
    expect(store.selectedPinNotFound).toBe(true)

    await store.selectPin(null)
    expect(store.selectedPinId).toBeNull()
    expect(store.selectedPinNotFound).toBe(false)
  })
})

describe('place index', () => {
  it('loads once per event and lists towns in an area by count', async () => {
    const store = usePinsStore()
    const idx = {
      areas: { tauranga: { area: 'Tauranga & surrounds', count: 10 } },
      towns: {
        'te-puke': { town: 'Te Puke', areaKey: 'tauranga', region: 'BOP', countryCode: 'NZ', count: 2 },
        papamoa: { town: 'Pāpāmoa', areaKey: 'tauranga', region: 'BOP', countryCode: 'NZ', count: 5 },
        rotorua: { town: 'Rotorua', areaKey: null, region: 'BOP', countryCode: 'NZ', count: 4 },
        empty: { town: 'Empty', areaKey: 'tauranga', region: 'BOP', countryCode: 'NZ', count: 0 },
      },
    } as unknown as PlaceIndex
    mockIndex.mockResolvedValue(idx)
    await store.loadPlaceIndex()
    await store.loadPlaceIndex()
    expect(mockIndex).toHaveBeenCalledTimes(1)
    expect(mockIndex).toHaveBeenCalledWith(eventId)
    expect(store.townsInArea('tauranga')).toEqual([
      { key: 'papamoa', town: 'Pāpāmoa', count: 5 },
      { key: 'te-puke', town: 'Te Puke', count: 2 },
    ])
  })
})
