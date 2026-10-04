import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { LatLng } from '@/lib/geoCells'
import type { Pin } from '@/types/models'

/** Pins load only at zoom >= 11 (SPEC F2). */
export const MIN_PIN_ZOOM = 11
/** "Show on map" zooms to street level (SPEC F3). */
export const FOCUS_ZOOM = 16

export interface FocusRequest {
  pin: Pin
  /** Bumped per request, so showing the same pin twice flies there again. */
  seq: number
}

export const useMapStore = defineStore('map', () => {
  /** The Map segment is showing (the map itself stays mounted with v-show). */
  const mapVisible = ref(false)
  /** Set the first time the map is shown and never unset: gate map creation on it. */
  const mapCreated = ref(false)
  /** Last viewport, so the map reopens where the user left it. */
  const center = ref<LatLng | null>(null)
  const zoom = ref<number | null>(null)
  /** A visible cell hit the 200-pin cap: show "Zoom in for more". */
  const truncated = ref(false)
  /** Below zoom 11: show "Zoom in to see displays". */
  const zoomHint = computed(() => zoom.value !== null && zoom.value < MIN_PIN_ZOOM)
  /** "Show on map": fly here and ring the pin (useMap picks it up). */
  const focusRequest = shallowRef<FocusRequest | null>(null)
  /** The pin with the pulsing ring right now (cleared after a few seconds). */
  const highlightedPinId = ref<string | null>(null)
  /** A full-screen modal (community rules, welcome) covers the map: the ring waits for it. */
  const covered = ref(false)
  let focusSeq = 0

  function setMapVisible(visible: boolean): void {
    mapVisible.value = visible
    if (visible) mapCreated.value = true
  }

  function setViewport(next: LatLng, nextZoom: number): void {
    center.value = { lat: next.lat, lng: next.lng }
    zoom.value = nextZoom
  }

  /**
   * Show this pin on the map. The viewport is set too, so a map created
   * after this starts there instead of flying in from the launch town.
   */
  function focusPin(pin: Pin): void {
    focusSeq += 1
    focusRequest.value = { pin, seq: focusSeq }
    highlightedPinId.value = pin.id
    if (!mapCreated.value) setViewport({ lat: pin.geo.latitude, lng: pin.geo.longitude }, FOCUS_ZOOM)
  }

  function setCovered(value: boolean): void {
    covered.value = value
  }

  function clearHighlight(pinId?: string): void {
    if (!pinId || highlightedPinId.value === pinId) highlightedPinId.value = null
  }

  return {
    mapVisible,
    mapCreated,
    center,
    zoom,
    truncated,
    zoomHint,
    focusRequest,
    highlightedPinId,
    covered,
    setCovered,
    setMapVisible,
    setViewport,
    focusPin,
    clearHighlight,
  }
})
