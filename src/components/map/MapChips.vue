<script setup lang="ts">
// Status chips across the top of the map (SPEC F2 / §7 empty states).
// One chip at a time, most important first. Tappable chips are >= 44 px.
import { computed } from 'vue'
import type { LocateError } from '@/composables/useMap'

const props = defineProps<{
  zoomHint: boolean
  truncated: boolean
  loadFailed: boolean
  locateError: LocateError | null
}>()
const emit = defineEmits<{ 'zoom-in': []; retry: [] }>()

type Chip = { text: string; action: 'zoom-in' | 'retry' | null }

const chip = computed<Chip | null>(() => {
  if (props.locateError === 'denied')
    return { text: 'Location is off. Allow it in your browser settings.', action: null }
  if (props.locateError === 'unavailable') return { text: "Couldn't find your location.", action: null }
  if (props.loadFailed) return { text: "Couldn't load displays. Tap to retry.", action: 'retry' }
  if (props.zoomHint) return { text: 'Zoom in to see displays', action: 'zoom-in' }
  if (props.truncated) return { text: 'Zoom in for more', action: 'zoom-in' }
  return null
})

function onTap(): void {
  if (chip.value?.action === 'zoom-in') emit('zoom-in')
  else if (chip.value?.action === 'retry') emit('retry')
}
</script>

<template>
  <div class="pointer-events-none flex justify-center px-4" aria-live="polite">
    <button
      v-if="chip && chip.action"
      type="button"
      class="map-chip pointer-events-auto min-h-11 rounded-full px-4 text-sm"
      @click="onTap"
    >
      {{ chip.text }}
    </button>
    <div
      v-else-if="chip"
      class="map-chip flex min-h-11 items-center rounded-full px-4 text-center text-sm"
      role="status"
    >
      {{ chip.text }}
    </div>
  </div>
</template>

<style scoped>
.map-chip {
  font-family: var(--pl-font-body);
  font-weight: 800;
  box-shadow: 0 3px 0 var(--pl-shadow);
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  border: 0;
  max-width: 100%;
}
</style>
