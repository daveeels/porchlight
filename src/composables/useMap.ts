// All browse-map code lives here (CLAUDE.md stack rule). MapLibre GL JS with
// OpenFreeMap's public styles (no key). One Map per page for the whole session
// (golden rule 5): the Map is created once, into a module-level container
// element that is moved into whichever host mounts, and it is never removed
// except on a real page unload. Season changes call setStyle() and re-add
// images, sources and layers on 'style.load'. "Show on map" (SPEC F3) flies
// the same map to a pin and rings it for a few seconds (applyFocus).
import { readonly, ref, watch, type Ref } from 'vue'
import type {
  AddLayerObject,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  PointLike,
} from 'maplibre-gl'
import { loadMapLibre } from '@/composables/loadMapLibre'
import { SEASON_THEMES, type SeasonTheme } from '@/config/seasons'
import { cellPrecisionForZoom, cellsForViewport, type LatLng } from '@/lib/geoCells'
import { MARKER_IMAGE, markerImages, markerPixelRatio } from '@/lib/markerImages'
import { useAppConfigStore } from '@/stores/appConfig'
import { FOCUS_ZOOM, useMapStore, type FocusRequest } from '@/stores/map'
import { usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'
import type { Pin, Season } from '@/types/models'

export type MapStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LocateError = 'denied' | 'unavailable'

/** SPEC F2: re-query on moveend, debounced 400 ms. */
export const MOVE_DEBOUNCE_MS = 400
/** Zoom used by the locate-me button and when centering on the user. */
export const LOCATE_ZOOM = 14

const SRC_PINS = 'pl-pins'
const SRC_ME = 'pl-me'
const LAYER_CLUSTERS = 'pl-clusters'
const LAYER_CLUSTER_COUNT = 'pl-cluster-count'
const LAYER_PINS = 'pl-pins-unclustered'
const LAYER_ME = 'pl-me'
const SRC_HIGHLIGHT = 'pl-highlight'
export const LAYER_HIGHLIGHT = 'pl-highlight'
/** How long the "Show on map" ring pulses (SPEC F3). */
export const HIGHLIGHT_MS = 4000
/** One pulse of the ring. */
const PULSE_MS = 1200
/** Drop a ring that never got to start (style never loaded, map left covered). */
const RING_BACKSTOP_MS = 2 * 60 * 1000
const TAP_PAD_PX = 10
/** OpenFreeMap's glyph server only has this fontstack (SPEC §3). */
export const MAP_TEXT_FONT = ['Noto Sans Regular']

// ---- Minimal GeoJSON types (no @types/geojson in the project) -------------

interface PointGeometry {
  type: 'Point'
  coordinates: [number, number]
}

export interface PinFeatureProps {
  id: string
  verified: boolean
  isFeatured: boolean
  title: string
}

export interface PinFeatureCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; geometry: PointGeometry; properties: PinFeatureProps }[]
}

/** Pins → GeoJSON for the clustered source. "Verified only" filters here, client-side,
 *  so cluster counts match what is shown (a layer filter can't reach inside clusters).
 *  `always` (the "Show on map" pin) is drawn even if no loaded cell has it yet. */
export function pinsToFeatureCollection(
  pins: Pin[],
  verifiedOnly: boolean,
  always: Pin | null = null,
): PinFeatureCollection {
  const shown = pins.filter((p) => !verifiedOnly || p.verified || p.id === always?.id)
  if (always && !shown.some((p) => p.id === always.id)) shown.push(always)
  return {
    type: 'FeatureCollection',
    features: shown.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.geo.longitude, p.geo.latitude] as [number, number] },
        properties: { id: p.id, verified: p.verified, isFeatured: p.isFeatured, title: p.title },
      })),
  }
}

function meCollection(me: LatLng | null) {
  return {
    type: 'FeatureCollection' as const,
    features: me
      ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [me.lng, me.lat] }, properties: {} }]
      : [],
  }
}

// ---- Module-level singleton state ------------------------------------------

let map: MapLibreMap | null = null
let creating: Promise<MapLibreMap | null> | null = null
let mapEl: HTMLDivElement | null = null
let styleLoadedOnce = false
let userMoved = false
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshSeq = 0
let lastPins: Pin[] = []
let myLocation: LatLng | null = null
let unloadHooked = false
let selectHandler: ((id: string) => void) | null = null
let locateErrorTimer: ReturnType<typeof setTimeout> | null = null
/** The "Show on map" pin: drawn even before (or without) its cell loading. */
let focusPin: Pin | null = null
let appliedFocusSeq = 0
/** The style is loaded and our layers are on it (false between setStyle and style.load). */
let styleReady = false
/**
 * The ring of the last "Show on map": it pulses for HIGHLIGHT_MS once the map
 * has arrived (a flight can take a couple of seconds) and the ring is drawn
 * (the style may still be loading). `timer` is the backstop until then.
 */
let ring: { id: string; arrived: boolean; drawn: boolean; started: boolean; timer: ReturnType<typeof setTimeout> } | null =
  null
let pulseFrame = 0

const status = ref<MapStatus>('idle')
/** Viewport at zoom >= 11 still needs more than 9 cells: treat like the zoom hint. */
const tooWide = ref(false)
/** The last cell query failed. */
const loadFailed = ref(false)
const locating = ref(false)
const locateError = ref<LocateError | null>(null)

function currentSeason(): Season {
  return useSeasonStore().season ?? 'HALLOWEEN'
}

function themeFor(season: Season): SeasonTheme {
  return SEASON_THEMES[season]
}

function getMapEl(): HTMLDivElement {
  if (!mapEl) {
    mapEl = document.createElement('div')
    mapEl.className = 'pl-map'
    mapEl.style.position = 'absolute'
    mapEl.style.inset = '0'
  }
  return mapEl
}

function initialView(): { lat: number; lng: number; zoom: number } {
  const mapStore = useMapStore()
  if (mapStore.center && mapStore.zoom !== null) {
    return { lat: mapStore.center.lat, lng: mapStore.center.lng, zoom: mapStore.zoom }
  }
  return useAppConfigStore().config.launchCenter
}

// ---- Style content (re-added after every setStyle) ------------------------

function addMarkerImages(m: MapLibreMap, theme: SeasonTheme): boolean {
  const images = markerImages(theme, markerPixelRatio(window.devicePixelRatio))
  for (const img of images) {
    if (m.hasImage(img.name)) m.removeImage(img.name)
    m.addImage(img.name, img.image, { pixelRatio: img.pixelRatio })
  }
  return images.length === 2
}

function pinLayer(theme: SeasonTheme, haveImages: boolean): AddLayerObject {
  const notCluster = ['!', ['has', 'point_count']] as const
  if (haveImages) {
    return {
      id: LAYER_PINS,
      type: 'symbol',
      source: SRC_PINS,
      filter: notCluster as never,
      layout: {
        'icon-image': ['case', ['==', ['get', 'verified'], true], MARKER_IMAGE.verified, MARKER_IMAGE.unverified],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Verified drawn last, i.e. on top.
        'symbol-sort-key': ['case', ['==', ['get', 'verified'], true], 1, 0],
      },
    }
  }
  // Fallback when canvas icons couldn't be drawn.
  return {
    id: LAYER_PINS,
    type: 'circle',
    source: SRC_PINS,
    filter: notCluster as never,
    paint: {
      'circle-radius': 9,
      'circle-color': ['case', ['==', ['get', 'verified'], true], theme.marker.verified, theme.marker.unverified],
      'circle-opacity': ['case', ['==', ['get', 'verified'], true], 1, 0.55],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  }
}

function installStyleContent(m: MapLibreMap): void {
  const theme = themeFor(currentSeason())
  let haveImages = false
  try {
    haveImages = addMarkerImages(m, theme)
  } catch (e) {
    console.warn('[map] marker images failed', e)
  }

  if (!m.getSource(SRC_PINS)) {
    m.addSource(SRC_PINS, {
      type: 'geojson',
      data: pinsToFeatureCollection(lastPins, usePinsStore().verifiedOnly, focusPin) as never,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    })
  }
  if (!m.getSource(SRC_ME)) {
    m.addSource(SRC_ME, { type: 'geojson', data: meCollection(myLocation) as never })
  }

  if (!m.getLayer(LAYER_CLUSTERS)) {
    m.addLayer({
      id: LAYER_CLUSTERS,
      type: 'circle',
      source: SRC_PINS,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': theme.marker.cluster,
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.8,
      },
    })
  }
  if (!m.getLayer(LAYER_CLUSTER_COUNT)) {
    m.addLayer({
      id: LAYER_CLUSTER_COUNT,
      type: 'symbol',
      source: SRC_PINS,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': MAP_TEXT_FONT,
        'text-size': 13,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': theme.marker.clusterText },
    })
  }
  if (!m.getLayer(LAYER_PINS)) m.addLayer(pinLayer(theme, haveImages))
  if (!m.getLayer(LAYER_ME)) {
    m.addLayer({
      id: LAYER_ME,
      type: 'circle',
      source: SRC_ME,
      paint: {
        'circle-radius': 7,
        'circle-color': '#2f80ed',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    })
  }
}

/** Push the latest pins into the source; if the style isn't ready, style.load picks them up. */
function pushPins(): void {
  const src = map?.getSource<GeoJSONSource>(SRC_PINS)
  if (!src) return
  src.setData(pinsToFeatureCollection(lastPins, usePinsStore().verifiedOnly, focusPin) as never)
}

function pushMe(): void {
  const src = map?.getSource<GeoJSONSource>(SRC_ME)
  if (!src) return
  src.setData(meCollection(myLocation) as never)
}

// ---- "Show on map": fly to a pin and ring it ------------------------------

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function stopPulse(): void {
  if (pulseFrame) cancelAnimationFrame(pulseFrame)
  pulseFrame = 0
}

/** Removes the ring (after HIGHLIGHT_MS, or before a new one). */
function clearHighlight(): void {
  stopPulse()
  if (ring) clearTimeout(ring.timer)
  ring = null
  const m = map
  if (m && styleReady) {
    if (m.getLayer(LAYER_HIGHLIGHT)) m.removeLayer(LAYER_HIGHLIGHT)
    if (m.getSource(SRC_HIGHLIGHT)) m.removeSource(SRC_HIGHLIGHT)
  }
}

/** Rings the highlighted pin, under its marker; pulses unless reduced motion. */
function drawHighlight(): void {
  const m = map
  const pin = focusPin
  if (!m || !styleReady || !pin || useMapStore().highlightedPinId !== pin.id) return
  const color = themeFor(currentSeason()).marker.highlight
  const data = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [pin.geo.longitude, pin.geo.latitude] },
        properties: { id: pin.id },
      },
    ],
  }
  const src = m.getSource<GeoJSONSource>(SRC_HIGHLIGHT)
  if (src) src.setData(data as never)
  else m.addSource(SRC_HIGHLIGHT, { type: 'geojson', data: data as never })
  if (!m.getLayer(LAYER_HIGHLIGHT)) {
    m.addLayer(
      {
        id: LAYER_HIGHLIGHT,
        type: 'circle',
        source: SRC_HIGHLIGHT,
        paint: {
          'circle-radius': 22,
          'circle-color': color,
          'circle-opacity': 0.2,
          'circle-stroke-color': color,
          'circle-stroke-width': 4,
          'circle-stroke-opacity': 0.95,
        },
      },
      // Under the pin's marker, so the ring surrounds it.
      m.getLayer(LAYER_PINS) ? LAYER_PINS : undefined,
    )
  }
  if (ring?.id === pin.id) {
    ring.drawn = true
    startRingClock()
  }
  if (pulseFrame || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return
  const start = performance.now()
  const step = (now: number): void => {
    const mm = map
    if (!mm || !styleReady || !mm.getLayer(LAYER_HIGHLIGHT)) {
      pulseFrame = 0
      return
    }
    const t = ((now - start) % PULSE_MS) / PULSE_MS
    mm.setPaintProperty(LAYER_HIGHLIGHT, 'circle-radius', 16 + 26 * t)
    mm.setPaintProperty(LAYER_HIGHLIGHT, 'circle-stroke-opacity', 0.4 + 0.6 * (1 - t))
    mm.setPaintProperty(LAYER_HIGHLIGHT, 'circle-opacity', 0.3 * (1 - t))
    pulseFrame = requestAnimationFrame(step)
  }
  pulseFrame = requestAnimationFrame(step)
}

/** Ends the ring HIGHLIGHT_MS after it is both drawn and the map has arrived. */
function startRingClock(): void {
  const r = ring
  // Not while the rules or welcome cover the map (e.g. after "Sign in to see
  // it on the map"): the ring is for the user to see.
  if (!r || r.started || !r.arrived || !r.drawn || useMapStore().covered) return
  r.started = true
  clearTimeout(r.timer)
  r.timer = setTimeout(() => endRing(r.id), HIGHLIGHT_MS)
}

function endRing(id: string): void {
  if (ring?.id !== id) return
  clearHighlight()
  useMapStore().clearHighlight(id)
  // From now on the pin shows only as its cell has it (so a pin hidden by
  // votes later leaves the map like any other).
  if (focusPin?.id === id) {
    focusPin = null
    pushPins()
  }
}

/** A new "Show on map" request, once the map exists: move there, draw the pin, ring it. */
function applyFocus(req: FocusRequest | null): void {
  const m = map
  if (!m || !req || req.seq === appliedFocusSeq) return
  appliedFocusSeq = req.seq
  clearHighlight()
  focusPin = req.pin
  // Our own move: "centre on the user" mustn't jump away from the pin.
  userMoved = true
  const id = req.pin.id
  const r = { id, arrived: false, drawn: false, started: false, timer: setTimeout(() => endRing(id), RING_BACKSTOP_MS) }
  ring = r
  m.once('moveend', () => {
    r.arrived = true
    if (ring === r) startRingClock()
  })
  const center: [number, number] = [req.pin.geo.longitude, req.pin.geo.latitude]
  if (prefersReducedMotion()) m.jumpTo({ center, zoom: FOCUS_ZOOM })
  else m.flyTo({ center, zoom: FOCUS_ZOOM })
  pushPins()
  drawHighlight()
}

// ---- Data ---------------------------------------------------------------

function scheduleRefresh(delay = MOVE_DEBOUNCE_MS): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refresh()
  }, delay)
}

/** Zoom hint / too wide: drop drawn pins and clusters so stale ones don't sit
 *  next to the "Zoom in" chip. The cell cache stays warm for zooming back in. */
function clearDrawnPins(): void {
  refreshSeq++
  useMapStore().truncated = false
  loadFailed.value = false
  if (!lastPins.length) return
  lastPins = []
  pushPins()
}

async function refresh(): Promise<void> {
  const m = map
  if (!m) return
  const mapStore = useMapStore()
  const zoom = m.getZoom()
  const precision = cellPrecisionForZoom(zoom)
  if (precision === null) {
    // Below zoom 11: the map store's zoomHint shows the chip; no queries.
    tooWide.value = false
    clearDrawnPins()
    return
  }
  const b = m.getBounds()
  if (!b) return
  // Precision 5 falls back to 4 before declaring the viewport too wide.
  const cells = cellsForViewport(
    { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
    precision,
  )
  if (!cells) {
    tooWide.value = true
    clearDrawnPins()
    return
  }
  tooWide.value = false
  if (!useSeasonStore().eventId) return

  const seq = ++refreshSeq
  try {
    const result = await usePinsStore().getCells(cells)
    if (seq !== refreshSeq) return
    lastPins = result.pins
    mapStore.truncated = result.truncated
    loadFailed.value = false
    pushPins()
  } catch (e) {
    if (seq !== refreshSeq) return
    console.warn('[map] cell query failed', e)
    loadFailed.value = true
  }
}

// ---- Events -------------------------------------------------------------

function saveViewport(m: MapLibreMap): void {
  const c = m.getCenter()
  useMapStore().setViewport({ lat: c.lat, lng: c.lng }, m.getZoom())
}

function onClick(e: MapMouseEvent): void {
  const m = map
  if (!m) return
  const layers = [LAYER_PINS, LAYER_CLUSTERS].filter((id) => m.getLayer(id))
  if (!layers.length) return
  const box: [PointLike, PointLike] = [
    [e.point.x - TAP_PAD_PX, e.point.y - TAP_PAD_PX],
    [e.point.x + TAP_PAD_PX, e.point.y + TAP_PAD_PX],
  ]
  const features = m.queryRenderedFeatures(box, { layers })

  const pin = features.find((f) => f.layer?.id === LAYER_PINS)
  const pinId = pin?.properties?.id
  if (typeof pinId === 'string') {
    void usePinsStore().selectPin(pinId)
    selectHandler?.(pinId)
    return
  }

  const cluster = features.find((f) => f.layer?.id === LAYER_CLUSTERS)
  const clusterId = cluster?.properties?.cluster_id
  if (!cluster || typeof clusterId !== 'number') return
  const geom = cluster.geometry
  const coords = geom?.type === 'Point' ? (geom.coordinates as [number, number]) : null
  const src = m.getSource<GeoJSONSource>(SRC_PINS)
  if (!src || !coords) return
  src
    .getClusterExpansionZoom(clusterId)
    .then((zoom) => m.easeTo({ center: coords, zoom }))
    .catch(() => {
      // The cluster went away (data changed mid-tap): nothing to expand.
    })
}

function wire(m: MapLibreMap): void {
  m.on('style.load', () => {
    try {
      installStyleContent(m)
    } catch (e) {
      console.error('[map] could not add layers', e)
    }
    styleLoadedOnce = true
    styleReady = true
    status.value = 'ready'
    // A ring waiting for the style, or running when the season's style
    // swapped, is drawn (again).
    if (ring) drawHighlight()
    applyFocus(useMapStore().focusRequest)
    scheduleRefresh(0)
  })
  m.on('styleimagemissing', (e: { id?: string }) => {
    if (e.id === MARKER_IMAGE.verified || e.id === MARKER_IMAGE.unverified) {
      try {
        addMarkerImages(m, themeFor(currentSeason()))
      } catch {
        // Nothing more to do; the pin layer shows without icons.
      }
    }
  })
  m.on('movestart', (e: { originalEvent?: unknown }) => {
    if (e.originalEvent) userMoved = true
  })
  m.on('moveend', () => {
    saveViewport(m)
    scheduleRefresh()
  })
  m.on('click', onClick)
  for (const layer of [LAYER_PINS, LAYER_CLUSTERS]) {
    m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'))
    m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''))
  }
  m.on('error', (e: { error?: unknown }) => {
    console.warn('[map]', e.error ?? e)
    // Before the first style loads (style 404, offline) the map is unusable.
    if (!styleLoadedOnce) status.value = 'error'
  })
}

function hookUnload(): void {
  if (unloadHooked) return
  unloadHooked = true
  // Only a real unload; a bfcache'd page keeps its map.
  window.addEventListener('pagehide', (e) => {
    if (e.persisted || !map) return
    map.remove()
    map = null
  })
}

async function createMap(): Promise<MapLibreMap | null> {
  status.value = 'loading'
  try {
    const maplibre = await loadMapLibre()
    const view = initialView()
    const m = new maplibre.Map({
      container: getMapEl(),
      style: themeFor(currentSeason()).mapStyle,
      center: [view.lng, view.lat],
      zoom: view.zoom,
      // OSM / OpenMapTiles credit comes from the style; collapses to an (i)
      // button on narrow maps once the user pans.
      attributionControl: {},
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    m.touchZoomRotate.disableRotation()
    map = m
    // Development builds only (the E2E suite runs on the dev server): lets
    // tests read the one browse map's camera and layers. Never in production.
    if (import.meta.env.DEV) (window as unknown as { __porchlightMap?: MapLibreMap }).__porchlightMap = m
    wire(m)
    hookUnload()
    if (!useMapStore().center) void centerOnUserIfGranted()
    return m
  } catch (e) {
    console.error('[map] failed to create', e)
    status.value = 'error'
    return null
  }
}

// ---- Location -------------------------------------------------------------

function setMyLocation(ll: LatLng): void {
  myLocation = ll
  pushMe()
}

function currentPosition(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts))
}

/** SPEC F2: centre on the user if location is already permitted (never prompts). */
async function centerOnUserIfGranted(): Promise<void> {
  try {
    if (!navigator.permissions || !('geolocation' in navigator)) return
    const perm = await navigator.permissions.query({ name: 'geolocation' })
    if (perm.state !== 'granted') return
    const pos = await currentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 })
    const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    setMyLocation(ll)
    if (map && !userMoved) map.jumpTo({ center: [ll.lng, ll.lat], zoom: LOCATE_ZOOM })
  } catch {
    // Unsupported or failed: stay on the launch centre.
  }
}

function showLocateError(err: LocateError): void {
  locateError.value = err
  if (locateErrorTimer) clearTimeout(locateErrorTimer)
  locateErrorTimer = setTimeout(() => (locateError.value = null), 5000)
}

// ---- Public composable -----------------------------------------------------

export interface UseMapOptions {
  onSelectPin?: (id: string) => void
}

export function useMap(host: Ref<HTMLElement | null>, options: UseMapOptions = {}) {
  selectHandler = options.onSelectPin ?? null
  const season = useSeasonStore()
  const pins = usePinsStore()
  const mapStore = useMapStore()

  /** Show the map in the host: creates the single Map the first time, reattaches after. */
  async function activate(): Promise<void> {
    const el = host.value
    if (!el) return
    const container = getMapEl()
    if (container.parentElement !== el) el.appendChild(container)
    if (!map) {
      creating ??= createMap().finally(() => (creating = null))
      await creating
    }
    resize()
    applyFocus(mapStore.focusRequest)
  }

  function resize(): void {
    if (!map || !mapEl || mapEl.clientWidth === 0 || mapEl.clientHeight === 0) return
    map.resize()
  }

  /** Locate-me button: prompts for permission, then flies to the user. */
  function locate(): void {
    if (!('geolocation' in navigator)) {
      showLocateError('unavailable')
      return
    }
    locating.value = true
    locateError.value = null
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating.value = false
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(ll)
        map?.flyTo({ center: [ll.lng, ll.lat], zoom: LOCATE_ZOOM })
      },
      (err) => {
        locating.value = false
        showLocateError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  /** "Zoom in" chips: up to a zoom where pins load, else one step further. */
  function zoomIn(): void {
    if (!map) return
    const z = map.getZoom()
    map.easeTo({ zoom: z < 12 ? 12 : z + 1 })
  }

  /** Re-run the cell query now (e.g. a retry button). */
  function retry(): void {
    scheduleRefresh(0)
  }

  // Season switch: same Map, new style. style.load re-adds images/sources/layers.
  watch(
    () => season.season,
    (next, prev) => {
      if (!map || !next || next === prev) return
      lastPins = []
      styleReady = false
      stopPulse()
      refreshSeq++
      useMapStore().truncated = false
      pushPins()
      // diff: false forces a full reload so 'style.load' always fires.
      map.setStyle(themeFor(next).mapStyle, { diff: false })
    },
  )

  // Verified only: client-side filter of what's already loaded.
  watch(() => pins.verifiedOnly, pushPins)

  // "Show on map" (SPEC F3): fly the one map to the pin and ring it.
  watch(
    () => mapStore.focusRequest,
    (req) => applyFocus(req),
  )
  watch(
    () => mapStore.covered,
    () => startRingClock(),
  )

  // A vote/report patched or dropped a cached pin: redraw from the cell cache
  // (cache hits, no queries) so a pin hidden by votes leaves the map now.
  watch(() => pins.cacheVersion, () => scheduleRefresh(0))

  return {
    status: readonly(status),
    tooWide: readonly(tooWide),
    loadFailed: readonly(loadFailed),
    locating: readonly(locating),
    locateError: readonly(locateError),
    activate,
    resize,
    locate,
    zoomIn,
    retry,
  }
}
