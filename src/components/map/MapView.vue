<script setup lang="ts">
// Browse map (SPEC F2). Mounted lazily once by ExplorePage and kept with
// v-show: this component never creates a second mapbox Map and never removes
// the one it has (golden rule 5). The parent must give it a height.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMapbox } from '@/composables/useMapbox'
import { useMapStore } from '@/stores/map'
import StateMessage from '@/components/common/StateMessage.vue'
import LocateButton from './LocateButton.vue'
import MapChips from './MapChips.vue'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ 'select-pin': [id: string] }>()

const root = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const mapStore = useMapStore()

const { status, tooWide, loadFailed, locating, locateError, activate, resize, locate, zoomIn, retry } = useMapbox(
  host,
  { onSelectPin: (id) => emit('select-pin', id) },
)

let frame = 0
function resizeSoon(): void {
  if (!props.active) return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => resize())
}

watch(
  () => props.active,
  async (active) => {
    if (!active) return
    await nextTick()
    await activate()
    resizeSoon()
  },
  { immediate: true },
)

let observer: ResizeObserver | null = null
let ionPage: Element | null = null

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(resizeSoon)
    observer.observe(root.value)
  }
  ionPage = root.value?.closest('.ion-page') ?? null
  ionPage?.addEventListener('ionViewDidEnter', resizeSoon)
})

onBeforeUnmount(() => {
  // Deliberately no map.remove(): the Map lives for the whole page.
  observer?.disconnect()
  ionPage?.removeEventListener('ionViewDidEnter', resizeSoon)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="root" class="map-view relative h-full min-h-64 w-full overflow-hidden">
    <div ref="host" class="absolute inset-0" />

    <div v-if="status === 'no-token'" class="map-overlay absolute inset-0 flex items-center justify-center">
      <StateMessage title="Map needs a Mapbox token" message="Set VITE_MAPBOX_TOKEN in .env.local." />
    </div>
    <div v-else-if="status === 'error'" class="map-overlay absolute inset-0 flex items-center justify-center">
      <StateMessage title="Map temporarily unavailable" message="Try the list view for now." error />
    </div>
    <div
      v-else-if="status === 'loading' || status === 'idle'"
      class="map-overlay absolute inset-0 flex items-center justify-center"
    >
      <StateMessage title="Loading map…" loading />
    </div>

    <template v-if="status === 'ready'">
      <MapChips
        class="absolute top-3 right-0 left-0 z-10"
        :zoom-hint="mapStore.zoomHint || tooWide"
        :truncated="mapStore.truncated"
        :load-failed="loadFailed"
        :locate-error="locateError"
        @zoom-in="zoomIn"
        @retry="retry"
      />
      <!-- Above the attribution/logo row so Mapbox attribution stays visible. -->
      <LocateButton class="absolute right-3 bottom-10 z-10" :locating="locating" @locate="locate" />
    </template>
  </div>
</template>

<style scoped>
.map-overlay {
  background: var(--ion-background-color);
  z-index: 5;
}
.map-view :deep(.mapboxgl-ctrl-bottom-right),
.map-view :deep(.mapboxgl-ctrl-bottom-left) {
  z-index: 2;
}
</style>
