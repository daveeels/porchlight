// The add-display location picker (SPEC F5): a small, separate MapLibre map
// with a draggable marker. It is the only map allowed besides the browse map
// (CLAUDE.md rule 5): created when the location step opens (`open`) and
// removed with map.remove() when it closes (`close`, or on unmount).
import { onBeforeUnmount, readonly, ref, shallowRef, type Ref } from 'vue'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { geolocate, GeolocateFailure, PRECISE_OPTIONS, type GeolocateError } from '@/components/explore/geolocate'
import { loadMapLibre } from '@/composables/loadMapLibre'
import { SEASON_THEMES } from '@/config/seasons'
import { useAppConfigStore } from '@/stores/appConfig'
import { useSeasonStore } from '@/stores/season'

/** The current season's map style (from config, overridable via VITE_MAP_STYLE_*). */
export function pickerStyleUrl(): string {
  return SEASON_THEMES[useSeasonStore().season ?? 'HALLOWEEN'].mapStyle
}
/** Zoom once a spot is chosen: street level, so the marker can be fine-tuned. */
export const PICKER_ZOOM = 17
/** A location fix less precise than this asks the user to check the pin. */
export const ROUGH_FIX_M = 30

export interface LatLng {
  lat: number
  lng: number
}

export type PickerMapStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useLocationPicker(container: Ref<HTMLElement | null>, initial: LatLng | null = null) {
  /** The chosen point; null until the user drags, taps or uses their location. */
  const position = ref<LatLng | null>(initial ? { ...initial } : null)
  const mapStatus = ref<PickerMapStatus>('idle')
  const locating = ref(false)
  const locateError = ref<GeolocateError | null>(null)
  /** Accuracy (m) of the last "use my location" fix; null once the pin is placed by hand. */
  const fixAccuracyM = ref<number | null>(null)

  const map = shallowRef<MapLibreMap | null>(null)
  let marker: Marker | null = null
  let closed = false

  /** The season's primary colour (no hardcoded season colours). */
  function themeColor(): string | undefined {
    return getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim() || undefined
  }

  function setPosition(p: LatLng): void {
    position.value = { lat: p.lat, lng: p.lng }
  }

  function placeMarker(p: LatLng, fly: boolean): void {
    const m = map.value
    if (!m || !marker) return
    marker.setLngLat([p.lng, p.lat])
    if (fly) m.easeTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), PICKER_ZOOM), duration: 600 })
  }

  async function open(): Promise<void> {
    if (map.value || mapStatus.value === 'loading') return
    closed = false
    const el = container.value
    if (!el) return
    mapStatus.value = 'loading'
    try {
      const { Map, Marker } = await loadMapLibre()
      if (closed) return
      const center = position.value ?? useAppConfigStore().config.launchCenter
      const zoom = position.value ? PICKER_ZOOM : useAppConfigStore().config.launchCenter.zoom
      const m = new Map({
        container: el,
        style: pickerStyleUrl(),
        center: [center.lng, center.lat],
        zoom,
        attributionControl: { compact: true },
        // One finger pans the page on phones less awkwardly than rotating.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      })
      m.touchZoomRotate.disableRotation()
      map.value = m
      marker = new Marker({ draggable: true, color: themeColor() }).setLngLat([center.lng, center.lat]).addTo(m)
      marker.on('dragend', () => {
        const ll = marker?.getLngLat()
        if (!ll) return
        fixAccuracyM.value = null
        setPosition({ lat: ll.lat, lng: ll.lng })
      })
      m.on('click', (e) => {
        fixAccuracyM.value = null
        setPosition({ lat: e.lngLat.lat, lng: e.lngLat.lng })
        placeMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng }, false)
      })
      m.once('load', () => {
        if (map.value === m) mapStatus.value = 'ready'
      })
      m.on('error', (e) => {
        // Tile hiccups are routine; only a style that never loads is fatal.
        if (!m.isStyleLoaded() && mapStatus.value === 'loading') mapStatus.value = 'error'
        console.warn('[picker] map error', e.error)
      })
    } catch (e) {
      // No WebGL, or the map code failed to load. "Use my current location"
      // still works without the map.
      console.warn('[picker] map unavailable', e)
      if (!closed) mapStatus.value = 'error'
    }
  }

  function close(): void {
    closed = true
    marker?.remove()
    marker = null
    map.value?.remove()
    map.value = null
    mapStatus.value = 'idle'
  }

  async function locateMe(): Promise<void> {
    if (locating.value) return
    locating.value = true
    locateError.value = null
    try {
      // Fresh and high-accuracy: the user is standing at the house.
      const p = await geolocate(PRECISE_OPTIONS)
      fixAccuracyM.value = p.accuracyM
      setPosition(p)
      placeMarker(p, true)
    } catch (e) {
      locateError.value = e instanceof GeolocateFailure ? e.kind : 'unavailable'
    } finally {
      locating.value = false
    }
  }

  /** Call when the container changes size (e.g. after a transition). */
  function resize(): void {
    map.value?.resize()
  }

  onBeforeUnmount(close)

  return {
    position: readonly(position),
    mapStatus: readonly(mapStatus),
    locating: readonly(locating),
    locateError: readonly(locateError),
    fixAccuracyM: readonly(fixAccuracyM),
    open,
    close,
    resize,
    locateMe,
  }
}
