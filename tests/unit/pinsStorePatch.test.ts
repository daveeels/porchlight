// usePinsStore().patchPin / forgetPin: what a vote or report changes locally.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Pin } from '@/types/models'

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
import { usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'

const mockPage = vi.mocked(fetchPlacePage)
const mockCell = vi.mocked(fetchCellPins)
const mockPin = vi.mocked(fetchPin)

function pin(id: string, over: Partial<Pin> = {}): Pin {
  return {
    id,
    status: 'ACTIVE',
    verified: false,
    isFeatured: false,
    hereVotes: 2,
    notThereVotes: 0,
    geo: { latitude: -37.7, longitude: 176.29 },
    ...over,
  } as unknown as Pin
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  useSeasonStore().season = 'HALLOWEEN'
})

async function loaded() {
  const store = usePinsStore()
  mockPage.mockResolvedValueOnce({ pins: [pin('a'), pin('b')], cursor: null, done: true })
  await store.setSelection({ kind: 'area', key: 'tauranga' })
  mockCell.mockResolvedValue({ pins: [pin('a'), pin('c')], truncated: false })
  await store.getCells(['rbs5'])
  await store.selectPin('a')
  return store
}

describe('patchPin', () => {
  it('updates the list, the map cells, the open sheet and later lookups', async () => {
    const store = await loaded()
    const before = store.cacheVersion
    store.patchPin('a', { hereVotes: 3, verified: true })

    expect(store.cacheVersion).toBe(before + 1)
    expect(store.listPins.find((p) => p.id === 'a')).toMatchObject({ hereVotes: 3, verified: true })
    expect(store.listPins.find((p) => p.id === 'b')).toMatchObject({ hereVotes: 2, verified: false })
    expect(store.selectedPin).toMatchObject({ id: 'a', hereVotes: 3, verified: true })
    // Served from the cell cache (no new query) with the new counts.
    const { pins } = await store.getCells(['rbs5'])
    expect(mockCell).toHaveBeenCalledTimes(1)
    expect(pins.find((p) => p.id === 'a')).toMatchObject({ hereVotes: 3, verified: true })

    await store.selectPin(null)
    await store.selectPin('a')
    expect(mockPin).not.toHaveBeenCalled()
    expect(store.selectedPin).toMatchObject({ hereVotes: 3 })
  })
})

describe('forgetPin', () => {
  it('drops a hidden pin from the list, the map cells and lookups', async () => {
    const store = await loaded()
    await store.selectPin(null)
    const before = store.cacheVersion
    store.forgetPin('a')

    expect(store.cacheVersion).toBe(before + 1)
    expect(store.listPins.map((p) => p.id)).toEqual(['b'])
    const { pins } = await store.getCells(['rbs5'])
    expect(pins.map((p) => p.id)).toEqual(['c'])

    // A later /?pin=a reads it again (the rules hide non-ACTIVE pins → not found).
    mockPin.mockResolvedValue(null)
    await store.selectPin('a')
    expect(mockPin).toHaveBeenCalledWith('a')
    expect(store.selectedPinNotFound).toBe(true)
  })
})
