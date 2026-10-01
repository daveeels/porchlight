import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LatLng } from '@/lib/geoCells'

/** Pins load only at zoom >= 11 (SPEC F2). */
export const MIN_PIN_ZOOM = 11

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

  function setMapVisible(visible: boolean): void {
    mapVisible.value = visible
    if (visible) mapCreated.value = true
  }

  function setViewport(next: LatLng, nextZoom: number): void {
    center.value = { lat: next.lat, lng: next.lng }
    zoom.value = nextZoom
  }

  return { mapVisible, mapCreated, center, zoom, truncated, zoomHint, setMapVisible, setViewport }
})
