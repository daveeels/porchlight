import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { IonicVue } from '@ionic/vue'
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

import { fetchPlacePage } from '@/services/pins'
import { fetchPlaceIndex } from '@/services/places'
import { usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'
import ResultsList from '@/components/explore/ResultsList.vue'
import PlaceSearch from '@/components/explore/PlaceSearch.vue'
import TownChips from '@/components/explore/TownChips.vue'
import { formatDistance, hereCountLong, hereCountShort, mapsUrl, placeLine } from '@/components/pin/format'

const mockPage = vi.mocked(fetchPlacePage)
const mockPlaceIndex = vi.mocked(fetchPlaceIndex)

const INDEX = {
  areas: { tauranga: { area: 'Tauranga & surrounds', count: 12 } },
  towns: {
    'papamoa-beach': { town: 'Pāpāmoa Beach', areaKey: 'tauranga', region: 'Bay of Plenty', countryCode: 'NZ', count: 7 },
    'te-puke': { town: 'Te Puke', areaKey: 'tauranga', region: 'Bay of Plenty', countryCode: 'NZ', count: 5 },
  },
  updatedAt: null,
} as unknown as Awaited<ReturnType<typeof fetchPlaceIndex>>

const PAPAMOA = {
  areaKey: 'tauranga',
  area: 'Tauranga & surrounds',
  townKey: 'papamoa-beach',
  town: 'Pāpāmoa Beach',
  region: 'Bay of Plenty',
  countryCode: 'NZ',
}

function pin(id: string, over: Partial<Pin> = {}): Pin {
  return {
    id,
    title: `Display ${id}`,
    verified: false,
    isFeatured: false,
    hereVotes: 0,
    notThereVotes: 0,
    thumbUrl: `https://example.test/${id}.jpg`,
    geo: { latitude: -37.7, longitude: 176.29 },
    place: PAPAMOA,
    ...over,
  } as unknown as Pin
}

let pinia: Pinia

function mountList() {
  return mount(ResultsList, {
    props: { placeName: 'Tauranga & surrounds' },
    global: { plugins: [IonicVue, pinia] },
  })
}

/** happy-dom's text() skips the light DOM of hydrated Ionic elements; read the markup instead. */
function allText(wrapper: { html(): string }): string {
  return wrapper
    .html()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

function cardIds(wrapper: ReturnType<typeof mountList>): string[] {
  return wrapper.findAll('[data-pin-id]').map((w) => w.attributes('data-pin-id')!)
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  vi.clearAllMocks()
  useSeasonStore().season = 'HALLOWEEN'
})

describe('ResultsList', () => {
  it('renders cards in rankScore order (verified first) with badges and counts', async () => {
    mockPage.mockResolvedValueOnce({
      pins: [pin('v1', { verified: true, hereVotes: 5 }), pin('u1', { hereVotes: 1 })],
      cursor: null,
      done: false,
    })
    await usePinsStore().setSelection({ kind: 'area', key: 'tauranga' })
    const wrapper = mountList()
    await flushPromises()

    expect(cardIds(wrapper)).toEqual(['v1', 'u1'])
    const text = allText(wrapper)
    expect(text).toContain('✓ Verified')
    expect(text).toContain('Unverified')
    expect(text).toContain("5 say it's here")
    expect(text).toContain("1 says it's here")
    expect(text).toContain('Load more')
  })

  it('verified only stops at the first unverified pin and hides Load more', async () => {
    mockPage.mockResolvedValueOnce({
      pins: [
        pin('v1', { verified: true }),
        pin('fu', { isFeatured: true }),
        pin('v2', { verified: true }),
        pin('u1'),
        pin('v3', { verified: true }),
      ],
      cursor: null,
      done: false,
    })
    const store = usePinsStore()
    await store.setSelection({ kind: 'area', key: 'tauranga' })
    const wrapper = mountList()
    await flushPromises()
    expect(cardIds(wrapper)).toHaveLength(5)

    store.verifiedOnly = true
    await flushPromises()
    expect(cardIds(wrapper)).toEqual(['v1', 'v2'])
    expect(allText(wrapper)).not.toContain('Load more')
  })

  it('offers to show all when no loaded pin is verified', async () => {
    mockPage.mockResolvedValueOnce({ pins: [pin('u1'), pin('u2')], cursor: null, done: true })
    const store = usePinsStore()
    await store.setSelection({ kind: 'area', key: 'tauranga' })
    store.verifiedOnly = true
    const wrapper = mountList()
    await flushPromises()
    expect(cardIds(wrapper)).toEqual([])
    expect(allText(wrapper)).toContain('No verified displays yet')
  })

  it('shows the empty state for a place with no displays', async () => {
    mockPage.mockResolvedValueOnce({ pins: [], cursor: null, done: true })
    await usePinsStore().setSelection({ kind: 'town', key: 'te-puke' })
    const wrapper = mountList()
    await flushPromises()
    expect(allText(wrapper)).toContain('No displays in Tauranga & surrounds yet')
  })

  it('shows an error with retry when the first page fails', async () => {
    mockPage.mockRejectedValueOnce(new Error('offline'))
    await usePinsStore().setSelection({ kind: 'area', key: 'tauranga' })
    const wrapper = mountList()
    await flushPromises()
    expect(allText(wrapper)).toContain('load displays')

    mockPage.mockResolvedValueOnce({ pins: [pin('a')], cursor: null, done: true })
    await wrapper.findAll('ion-button').find((b) => (b.element.textContent ?? '').includes('Try again'))!.trigger('click')
    await flushPromises()
    expect(cardIds(wrapper)).toEqual(['a'])
  })

  it('emits select with the pin id when a card is tapped', async () => {
    mockPage.mockResolvedValueOnce({ pins: [pin('a')], cursor: null, done: true })
    await usePinsStore().setSelection({ kind: 'area', key: 'tauranga' })
    const wrapper = mountList()
    await flushPromises()
    await wrapper.find('[data-pin-id="a"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['a']])
  })
})

describe('PlaceSearch', () => {
  function mountSearch() {
    return mount(PlaceSearch, { global: { plugins: [IonicVue, pinia] } })
  }

  it('shows popular places under the box and selects one on tap', async () => {
    mockPlaceIndex.mockResolvedValueOnce(INDEX)
    await usePinsStore().loadPlaceIndex()
    const wrapper = mountSearch()
    await flushPromises()
    const chips = wrapper.findAll('nav[aria-label="Popular places"] ion-chip')
    expect(chips.map((c) => allText(c).trim())).toEqual(['Tauranga & surrounds', 'Pāpāmoa Beach', 'Te Puke'])
    await chips[1]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ kind: 'town', key: 'papamoa-beach' })
  })

  it('shows an inline error with Try again when the place index fails', async () => {
    mockPlaceIndex.mockRejectedValueOnce(new Error('offline'))
    const store = usePinsStore()
    await store.loadPlaceIndex()
    const wrapper = mountSearch()
    await flushPromises()
    expect(allText(wrapper)).toContain("Couldn't load places.")

    mockPlaceIndex.mockResolvedValueOnce(INDEX)
    await wrapper.findAll('ion-button').find((b) => (b.element.textContent ?? '').includes('Try again'))!.trigger('click')
    await flushPromises()
    expect(mockPlaceIndex).toHaveBeenCalledTimes(2)
    expect(store.placeIndex).toBe(INDEX)
    expect(allText(wrapper)).not.toContain("Couldn't load places.")
  })
})

describe('TownChips', () => {
  it('chips are focusable and select on Enter and Space', async () => {
    mockPlaceIndex.mockResolvedValueOnce(INDEX)
    await usePinsStore().loadPlaceIndex()
    const wrapper = mount(TownChips, {
      props: { areaKey: 'tauranga', townKey: null },
      global: { plugins: [IonicVue, pinia] },
    })
    const chips = wrapper.findAll('ion-chip')
    expect(chips).toHaveLength(3)
    for (const c of chips) expect(c.attributes('tabindex')).toBe('0')
    expect(chips[0]!.attributes('aria-pressed')).toBe('true')
    expect(chips[1]!.attributes('aria-pressed')).toBe('false')

    await chips[1]!.trigger('keydown', { key: 'Enter' })
    await chips[0]!.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('select')).toEqual([
      [{ kind: 'town', key: 'papamoa-beach' }],
      [{ kind: 'area', key: 'tauranga' }],
    ])
  })
})

describe('pin format helpers', () => {
  it('formats counts, place and directions', () => {
    expect(hereCountShort(0)).toBe('No votes yet')
    expect(hereCountLong(12)).toBe("12 people say it's here")
    expect(placeLine(pin('a'))).toBe('Pāpāmoa Beach · Tauranga & surrounds')
    const rotorua = { ...PAPAMOA, areaKey: null, area: null, townKey: 'rotorua', town: 'Rotorua' }
    expect(placeLine(pin('b', { place: rotorua }))).toBe('Rotorua · Bay of Plenty')
    expect(mapsUrl(pin('a'))).toBe('https://www.google.com/maps/search/?api=1&query=-37.700000,176.290000')
    expect(formatDistance(0.234)).toBe('230 m')
    expect(formatDistance(2.46)).toBe('2.5 km')
  })
})
