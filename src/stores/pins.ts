import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { cellsAround, distanceKm } from '@/lib/geoCells'
import { fetchCellPins, fetchPin, fetchPlacePage, type PageCursor } from '@/services/pins'
import { fetchPlaceIndex } from '@/services/places'
import type { EventId, Pin, PlaceIndex, PlaceSelection } from '@/types/models'
import { useSeasonStore } from './season'

/** Cell cache lifetime (SPEC F2). */
export const CELL_TTL_MS = 5 * 60 * 1000
/** Near me shows everything at once, capped (SPEC F1). */
export const NEAR_ME_CAP = 100
export const NEAR_ME_PRECISION = 5

export interface CellsResult {
  pins: Pin[]
  /** At least one cell returned the 200-pin cap: show "Zoom in for more". */
  truncated: boolean
}

export interface TownChip {
  key: string
  town: string
  count: number
}

interface CellEntry {
  pins: Pin[]
  truncated: boolean
  fetchedAt: number
}

function pinLatLng(pin: Pin) {
  return { lat: pin.geo.latitude, lng: pin.geo.longitude }
}

/**
 * SPEC F1 "Verified only" on area/town lists: rankScore puts verified first,
 * so stop at the first pin that is neither verified nor featured and drop
 * featured-but-unverified pins before that point.
 */
export function verifiedPrefix(pins: Pin[]): { pins: Pin[]; reachedEnd: boolean } {
  const out: Pin[] = []
  for (const p of pins) {
    if (!p.verified && !p.isFeatured) return { pins: out, reachedEnd: true }
    if (p.verified) out.push(p)
  }
  return { pins: out, reachedEnd: false }
}

export const usePinsStore = defineStore('pins', () => {
  const season = useSeasonStore()

  function requireEventId(): EventId {
    const id = season.eventId
    if (!id) throw new Error('No active season')
    return id
  }

  // ---- Place index ---------------------------------------------------------

  const placeIndex = shallowRef<PlaceIndex | null>(null)
  const placeIndexLoading = ref(false)
  const placeIndexError = ref<unknown>(null)
  let placeIndexFor: EventId | null = null

  /** Loads placeIndex/{eventId} once per event (pass force to refresh). */
  async function loadPlaceIndex(force = false): Promise<void> {
    const eventId = requireEventId()
    if (!force && placeIndexFor === eventId && placeIndex.value) return
    placeIndexLoading.value = true
    placeIndexError.value = null
    try {
      const idx = await fetchPlaceIndex(eventId)
      if (season.eventId !== eventId) return
      placeIndex.value = idx
      placeIndexFor = eventId
    } catch (e) {
      placeIndexError.value = e
    } finally {
      placeIndexLoading.value = false
    }
  }

  /** Towns in an area for the chips row, most pins first. */
  function townsInArea(areaKey: string): TownChip[] {
    const towns = placeIndex.value?.towns ?? {}
    return Object.entries(towns)
      .filter(([, t]) => t.areaKey === areaKey && t.count > 0)
      .map(([key, t]) => ({ key, town: t.town, count: t.count }))
      .sort((a, b) => b.count - a.count || a.town.localeCompare(b.town))
  }

  // ---- Known pins (for selectPin lookups) ---------------------------------

  const knownPins = new Map<string, Pin>()
  function remember(pins: Pin[]): void {
    for (const p of pins) knownPins.set(p.id, p)
  }

  // ---- Shared cell cache (near me + map) ----------------------------------

  const cellCache = new Map<string, CellEntry>()
  const inFlight = new Map<string, Promise<CellEntry>>()

  function loadCell(eventId: EventId, cell: string): Promise<CellEntry> {
    const key = `${eventId}:${cell}`
    const cached = cellCache.get(key)
    if (cached && Date.now() - cached.fetchedAt < CELL_TTL_MS) return Promise.resolve(cached)
    const running = inFlight.get(key)
    if (running) return running
    const p = fetchCellPins(eventId, cell)
      .then((r) => {
        const entry = { pins: r.pins, truncated: r.truncated, fetchedAt: Date.now() }
        cellCache.set(key, entry)
        remember(r.pins)
        return entry
      })
      .finally(() => inFlight.delete(key))
    inFlight.set(key, p)
    return p
  }

  /** Pins in the given fixed cells, fetching only cells not cached in the last 5 min. */
  async function getCells(cells: string[]): Promise<CellsResult> {
    const eventId = requireEventId()
    const entries = await Promise.all([...new Set(cells)].map((c) => loadCell(eventId, c)))
    const byId = new Map<string, Pin>()
    let truncated = false
    for (const e of entries) {
      truncated ||= e.truncated
      for (const p of e.pins) byId.set(p.id, p)
    }
    return { pins: [...byId.values()], truncated }
  }

  function clearCellCache(): void {
    cellCache.clear()
  }

  // ---- Results list --------------------------------------------------------

  const selection = ref<PlaceSelection | null>(null)
  const listPins = shallowRef<Pin[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  /** No more pages from the server. */
  const done = ref(false)
  const verifiedOnly = ref(false)
  const nearMeTruncated = ref(false)
  let cursor: PageCursor = null
  let listToken = 0

  const visibleListPins = computed<Pin[]>(() => {
    const pins = listPins.value
    if (!verifiedOnly.value) return pins
    if (selection.value?.kind === 'nearMe') return pins.filter((p) => p.verified)
    return verifiedPrefix(pins).pins
  })

  /** Whether "Load more" should show (never for near me; stops at the verified cutoff). */
  const canLoadMore = computed(() => {
    if (done.value || !selection.value || selection.value.kind === 'nearMe') return false
    if (verifiedOnly.value && verifiedPrefix(listPins.value).reachedEnd) return false
    return true
  })

  function resetList(): void {
    listToken++
    listPins.value = []
    cursor = null
    done.value = false
    error.value = null
    loading.value = false
    nearMeTruncated.value = false
  }

  /** Changes what the list shows and loads its first page (or near-me results). */
  function setSelection(sel: PlaceSelection | null): Promise<void> {
    selection.value = sel
    return loadFirstPage()
  }

  async function loadFirstPage(): Promise<void> {
    const sel = selection.value
    resetList()
    if (!sel) return
    if (sel.kind === 'nearMe') return loadNearMe(sel.lat, sel.lng)
    await loadPage(sel)
  }

  async function loadMore(): Promise<void> {
    const sel = selection.value
    if (!sel || sel.kind === 'nearMe' || loading.value || !canLoadMore.value) return
    await loadPage(sel)
  }

  async function loadPage(sel: { kind: 'area' | 'town'; key: string }): Promise<void> {
    const token = listToken
    loading.value = true
    error.value = null
    try {
      const page = await fetchPlacePage(requireEventId(), sel, cursor)
      if (token !== listToken) return
      const seen = new Set(listPins.value.map((p) => p.id))
      const fresh = page.pins.filter((p) => !seen.has(p.id))
      remember(page.pins)
      listPins.value = [...listPins.value, ...fresh]
      cursor = page.cursor
      done.value = page.done
    } catch (e) {
      if (token === listToken) error.value = e
    } finally {
      if (token === listToken) loading.value = false
    }
  }

  /** Near me: the precision-5 cell around the user + 8 neighbours, by distance, max 100. */
  async function loadNearMe(lat: number, lng: number): Promise<void> {
    const cur = selection.value
    if (cur?.kind !== 'nearMe' || cur.lat !== lat || cur.lng !== lng) {
      selection.value = { kind: 'nearMe', lat, lng }
    }
    resetList()
    const token = listToken
    loading.value = true
    try {
      const { pins, truncated } = await getCells(cellsAround(lat, lng, NEAR_ME_PRECISION))
      if (token !== listToken) return
      const here = { lat, lng }
      listPins.value = pins
        .map((p) => ({ p, d: distanceKm(here, pinLatLng(p)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, NEAR_ME_CAP)
        .map((x) => x.p)
      nearMeTruncated.value = truncated
      done.value = true
    } catch (e) {
      if (token === listToken) error.value = e
    } finally {
      if (token === listToken) loading.value = false
    }
  }

  /** Km from the near-me point, or null when the list isn't near me. */
  function distanceFromSelection(pin: Pin): number | null {
    const sel = selection.value
    if (sel?.kind !== 'nearMe') return null
    return distanceKm({ lat: sel.lat, lng: sel.lng }, pinLatLng(pin))
  }

  // ---- Selected pin (detail sheet) ----------------------------------------

  const selectedPinId = ref<string | null>(null)
  const selectedPin = shallowRef<Pin | null>(null)
  const selectedPinLoading = ref(false)
  /** The requested pin doesn't exist or isn't readable (hidden/removed). */
  const selectedPinNotFound = ref(false)
  const selectedPinError = ref<unknown>(null)

  async function selectPin(id: string | null): Promise<void> {
    selectedPinId.value = id
    selectedPinNotFound.value = false
    selectedPinError.value = null
    selectedPinLoading.value = false
    if (!id) {
      selectedPin.value = null
      return
    }
    const known = knownPins.get(id)
    if (known) {
      selectedPin.value = known
      return
    }
    selectedPin.value = null
    selectedPinLoading.value = true
    try {
      const pin = await fetchPin(id)
      if (selectedPinId.value !== id) return
      selectedPin.value = pin
      selectedPinNotFound.value = !pin
      if (pin) remember([pin])
    } catch (e) {
      if (selectedPinId.value === id) selectedPinError.value = e
    } finally {
      if (selectedPinId.value === id) selectedPinLoading.value = false
    }
  }

  /** A pin by id, from what's loaded or one read (e.g. "Show on map" from a link). Null if missing. */
  async function getPin(id: string): Promise<Pin | null> {
    const known = knownPins.get(id) ?? (selectedPin.value?.id === id ? selectedPin.value : null)
    if (known) return known
    const pin = await fetchPin(id)
    if (pin) remember([pin])
    return pin
  }

  // ---- Local updates after a vote / report (SPEC F7/F8) -------------------

  /** Bumped whenever cached pins change locally, so the map can redraw from the cache. */
  const cacheVersion = ref(0)

  /** Merges server-returned fields (counts, verified, status) into every cached copy. */
  function patchPin(id: string, patch: Partial<Omit<Pin, 'id'>>): void {
    const apply = (p: Pin): Pin => (p.id === id ? { ...p, ...patch } : p)
    const known = knownPins.get(id)
    if (known) knownPins.set(id, apply(known))
    if (listPins.value.some((p) => p.id === id)) listPins.value = listPins.value.map(apply)
    for (const entry of cellCache.values()) {
      if (entry.pins.some((p) => p.id === id)) entry.pins = entry.pins.map(apply)
    }
    if (selectedPin.value?.id === id) selectedPin.value = apply(selectedPin.value)
    cacheVersion.value++
  }

  /** Drops a pin that is no longer ACTIVE (hidden by votes/reports) from the list, map cells and lookups. */
  function forgetPin(id: string): void {
    knownPins.delete(id)
    if (listPins.value.some((p) => p.id === id)) listPins.value = listPins.value.filter((p) => p.id !== id)
    for (const entry of cellCache.values()) {
      if (entry.pins.some((p) => p.id === id)) entry.pins = entry.pins.filter((p) => p.id !== id)
    }
    cacheVersion.value++
  }

  /**
   * The user just added, edited or removed their own display. Every cached
   * view of the area could now be wrong: the place list (search, chips,
   * counts), the map's cells and the current list. Drop the caches and reload
   * what's on screen; the map redraws via cacheVersion.
   */
  function afterOwnPinChanged(pinId: string): void {
    knownPins.delete(pinId)
    clearCellCache()
    cacheVersion.value++
    void loadPlaceIndex(true)
    const sel = selection.value
    if (!sel) return
    if (sel.kind === 'nearMe') void loadNearMe(sel.lat, sel.lng)
    else void loadFirstPage()
  }

  return {
    // local updates (votes / reports)
    cacheVersion,
    patchPin,
    forgetPin,
    afterOwnPinChanged,
    // place index
    placeIndex,
    placeIndexLoading,
    placeIndexError,
    loadPlaceIndex,
    townsInArea,
    // list
    selection,
    listPins,
    loading,
    error,
    done,
    verifiedOnly,
    visibleListPins,
    canLoadMore,
    nearMeTruncated,
    setSelection,
    loadFirstPage,
    loadMore,
    loadNearMe,
    distanceFromSelection,
    // cells (shared with the map)
    getCells,
    clearCellCache,
    // detail sheet
    selectedPinId,
    selectedPin,
    selectedPinLoading,
    selectedPinNotFound,
    selectedPinError,
    selectPin,
    getPin,
  }
})
