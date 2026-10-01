// The shared MapLibre loader: both maps (browse + location picker) must get the
// bundled worker URL, and MapLibre is only set up once.
import { describe, expect, it, vi } from 'vitest'

const setWorkerUrl = vi.fn()
class FakeMap {}

vi.mock('maplibre-gl', () => ({ Map: FakeMap, setWorkerUrl }))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/assets/maplibre-worker.js' }))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

import { loadMapLibre } from '@/composables/loadMapLibre'

describe('loadMapLibre', () => {
  it('sets the bundled worker URL once and reuses the module', async () => {
    const a = await loadMapLibre()
    const b = await loadMapLibre()
    expect(a).toBe(b)
    expect(a.Map).toBe(FakeMap)
    expect(setWorkerUrl).toHaveBeenCalledTimes(1)
    expect(setWorkerUrl).toHaveBeenCalledWith('/assets/maplibre-worker.js')
  })
})
