// useMap with a fake MapLibre: style URLs, no token, OpenFreeMap fontstack,
// layers re-added on style.load and setStyle (same Map) on season change.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
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
    launchCenter: { lat: -37.6878, lng: 176.1651, zoom: 10 },
    defaultAreaKey: 'tauranga',
  },
  fetchAppConfig: vi.fn(),
  fetchEvents: vi.fn(),
}))

type Handler = (e?: unknown) => void

const created: FakeMap[] = []
const setWorkerUrl = vi.fn()

class FakeMap {
  options: Record<string, unknown>
  handlers = new Map<string, Handler[]>()
  layers = new Map<string, Record<string, unknown>>()
  sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  setStyle = vi.fn((_style: string, _opts?: unknown) => {
    // A full style swap wipes sources and layers.
    this.layers.clear()
    this.sources.clear()
  })
  touchZoomRotate = { disableRotation: vi.fn() }
  constructor(options: Record<string, unknown>) {
    this.options = options
    created.push(this)
  }
  on(type: string, a: unknown, b?: unknown) {
    const fn = (typeof a === 'function' ? a : b) as Handler
    const key = typeof a === 'string' ? `${type}:${a}` : type
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), fn])
    return this
  }
  once(type: string, fn: Handler) {
    const wrap: Handler = (e) => {
      this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== wrap))
      fn(e)
    }
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), wrap])
    return this
  }
  fire(type: string, e?: unknown) {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn(e)
  }
  hasImage() {
    return false
  }
  addImage() {}
  removeImage() {}
  getSource(id: string) {
    return this.sources.get(id)
  }
  addSource(id: string) {
    this.sources.set(id, { setData: vi.fn() })
  }
  getLayer(id: string) {
    return this.layers.get(id)
  }
  beforeIds = new Map<string, string | undefined>()
  addLayer(layer: Record<string, unknown>, beforeId?: string) {
    this.layers.set(layer.id as string, layer)
    this.beforeIds.set(layer.id as string, beforeId)
  }
  removeLayer(id: string) {
    this.layers.delete(id)
  }
  removeSource(id: string) {
    this.sources.delete(id)
  }
  setPaintProperty = vi.fn()
  flyTo = vi.fn()
  jumpTo = vi.fn()
  getZoom() {
    return 10
  }
  getCenter() {
    return { lat: -37.6878, lng: 176.1651 }
  }
  getBounds() {
    return null
  }
  getCanvas() {
    return document.createElement('canvas')
  }
  resize() {}
}

vi.mock('maplibre-gl', () => ({ Map: FakeMap, setWorkerUrl }))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/assets/maplibre-worker.js' }))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

import { HIGHLIGHT_MS, LAYER_HIGHLIGHT, MAP_TEXT_FONT, pinsToFeatureCollection, useMap } from '@/composables/useMap'
import { SEASON_THEMES } from '@/config/seasons'
import { FOCUS_ZOOM, useMapStore } from '@/stores/map'
import { useSeasonStore } from '@/stores/season'

beforeAll(() => {
  setActivePinia(createPinia())
})

describe('pinsToFeatureCollection', () => {
  const pins = [
    { id: 'a', title: 'A', verified: true, isFeatured: false, geo: { latitude: -37.7, longitude: 176.2 } },
    { id: 'b', title: 'B', verified: false, isFeatured: true, geo: { latitude: -37.6, longitude: 176.1 } },
  ] as unknown as Pin[]

  it('maps pins to [lng, lat] points with their props', () => {
    const fc = pinsToFeatureCollection(pins, false)
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0]!.geometry.coordinates).toEqual([176.2, -37.7])
    expect(fc.features[1]!.properties).toEqual({ id: 'b', verified: false, isFeatured: true, title: 'B' })
  })

  it('verified only drops unverified pins', () => {
    expect(pinsToFeatureCollection(pins, true).features.map((f) => f.properties.id)).toEqual(['a'])
  })

  it('always draws the "Show on map" pin, even unloaded or unverified', () => {
    const extra = { id: 'c', title: 'C', verified: false, isFeatured: false, geo: { latitude: -37.5, longitude: 176 } } as unknown as Pin
    expect(pinsToFeatureCollection(pins, true, extra).features.map((f) => f.properties.id)).toEqual(['a', 'c'])
    expect(pinsToFeatureCollection(pins, true, pins[1]!).features.map((f) => f.properties.id)).toEqual(['a', 'b'])
    expect(pinsToFeatureCollection(pins, false, pins[0]!).features).toHaveLength(2) // no duplicate
  })
})

describe('season map styles', () => {
  it('default to OpenFreeMap public styles (no key)', () => {
    expect(SEASON_THEMES.HALLOWEEN.mapStyle).toBe('https://tiles.openfreemap.org/styles/dark')
    expect(SEASON_THEMES.CHRISTMAS.mapStyle).toBe('https://tiles.openfreemap.org/styles/positron')
  })
})

describe('useMap', () => {
  it('creates one MapLibre map, adds layers on style.load and swaps style on season change', async () => {
    useSeasonStore().season = 'HALLOWEEN'
    const host = ref<HTMLElement | null>(document.createElement('div'))
    const { status, activate } = useMap(host)
    await activate()

    expect(created).toHaveLength(1)
    const m = created[0]!
    expect(setWorkerUrl).toHaveBeenCalledWith('/assets/maplibre-worker.js')
    expect(m.options.style).toBe('https://tiles.openfreemap.org/styles/dark')
    expect(m.options.attributionControl).not.toBe(false)
    expect(m.options).not.toHaveProperty('accessToken')
    expect(status.value).toBe('loading')

    m.fire('style.load')
    expect(status.value).toBe('ready')
    expect([...m.layers.keys()]).toEqual(['pl-clusters', 'pl-cluster-count', 'pl-pins-unclustered', 'pl-me'])
    const count = m.layers.get('pl-cluster-count') as { layout: Record<string, unknown> }
    expect(count.layout['text-font']).toEqual(['Noto Sans Regular'])
    expect(MAP_TEXT_FONT).toEqual(['Noto Sans Regular'])

    // Season switch: same Map, new style, content re-added on the next style.load.
    useSeasonStore().season = 'CHRISTMAS'
    await nextTick()
    expect(m.setStyle).toHaveBeenCalledWith('https://tiles.openfreemap.org/styles/positron', { diff: false })
    expect(m.layers.size).toBe(0)
    m.fire('style.load')
    expect(m.layers.has('pl-pins-unclustered')).toBe(true)

    // Re-activating reuses the map.
    await activate()
    expect(created).toHaveLength(1)
  })

  it('"Show on map" flies the same map to the pin, draws it and rings it for a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const m = created[0]!
      const pin = {
        id: 'far_HALLOWEEN_2026',
        title: 'Far away',
        verified: false,
        isFeatured: false,
        geo: { latitude: -37.71, longitude: 176.31 },
      } as unknown as Pin
      useMapStore().focusPin(pin)
      await nextTick()

      expect(created).toHaveLength(1)
      expect(m.flyTo).toHaveBeenCalledWith({ center: [176.31, -37.71], zoom: FOCUS_ZOOM })
      // Drawn even though no cell has loaded it.
      const data = m.sources.get('pl-pins')!.setData.mock.lastCall![0] as { features: { properties: { id: string } }[] }
      expect(data.features.map((f) => f.properties.id)).toContain(pin.id)
      // The ring sits under the pin markers.
      expect(m.layers.has(LAYER_HIGHLIGHT)).toBe(true)
      expect(m.beforeIds.get(LAYER_HIGHLIGHT)).toBe('pl-pins-unclustered')
      expect(useMapStore().highlightedPinId).toBe(pin.id)

      // It pulses for HIGHLIGHT_MS once the flight has arrived.
      m.fire('moveend')
      vi.advanceTimersByTime(HIGHLIGHT_MS - 100)
      expect(m.layers.has(LAYER_HIGHLIGHT)).toBe(true)
      vi.advanceTimersByTime(100)
      expect(m.layers.has(LAYER_HIGHLIGHT)).toBe(false)
      expect(useMapStore().highlightedPinId).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('"Show on map" jumps instead of flying with reduced motion', async () => {
    const m = created[0]!
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q })) as typeof window.matchMedia
    try {
      const pin = { id: 'near_HALLOWEEN_2026', title: 'Near', verified: true, isFeatured: false, geo: { latitude: -37.69, longitude: 176.17 } } as unknown as Pin
      useMapStore().focusPin(pin)
      await nextTick()
      expect(m.jumpTo).toHaveBeenCalledWith({ center: [176.17, -37.69], zoom: FOCUS_ZOOM })
    } finally {
      window.matchMedia = original
    }
  })
})
