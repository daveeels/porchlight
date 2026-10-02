<script setup lang="ts">
// Step 1 (SPEC F5): "Use my current location" + drag the pin on a small map.
// The picker map lives only while this step is mounted (useLocationPicker).
import { computed, onMounted, ref, watch } from 'vue'
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue'
import { locateOutline } from 'ionicons/icons'
import { ROUGH_FIX_M, useLocationPicker, type LatLng } from '@/composables/useLocationPicker'

const props = defineProps<{ modelValue: LatLng | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: LatLng]; next: [] }>()

const mapEl = ref<HTMLElement | null>(null)
const picker = useLocationPicker(mapEl, props.modelValue)

watch(
  () => picker.position.value,
  (p) => {
    if (p) emit('update:modelValue', { lat: p.lat, lng: p.lng })
  },
)

onMounted(() => {
  void picker.open()
})

const locateMessage = computed(() => {
  switch (picker.locateError.value) {
    case 'denied':
      return 'Location is turned off for Porchlight. Allow it in your browser settings, or drag the pin on the map.'
    case 'unsupported':
      return "This browser can't share your location. Drag the pin on the map instead."
    case 'unavailable':
      return "Couldn't find your location. Try again, or drag the pin on the map."
    default:
      return null
  }
})

const chosen = computed(() => !!props.modelValue)

/** The device's fix was rough: ask for a drag to the house before moving on. */
const roughFix = computed(() => {
  const m = picker.fixAccuracyM.value
  return m !== null && m > ROUGH_FIX_M
})
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="loc-heading">
    <div>
      <h2 id="loc-heading" class="pl-display m-0 text-2xl">Where is your display?</h2>
      <p class="m-0 mt-1 text-sm pl-muted">
        Stand out the front and use your location, or tap the map and drag the pin onto the house.
      </p>
    </div>

    <ion-button expand="block" fill="outline" class="tap m-0" :disabled="picker.locating.value" @click="picker.locateMe">
      <ion-spinner v-if="picker.locating.value" slot="start" name="crescent" />
      <ion-icon v-else slot="start" :icon="locateOutline" aria-hidden="true" />
      Use my current location
    </ion-button>

    <p v-if="locateMessage" class="notice m-0 rounded-lg p-3 text-sm" role="alert">{{ locateMessage }}</p>
    <p v-else-if="roughFix" class="notice m-0 rounded-lg p-3 text-sm" role="status" data-testid="rough-fix">
      Your location is only accurate to about {{ Math.round(picker.fixAccuracyM.value ?? 0) }} m. Check the pin is on
      your house, and drag it there if not.
    </p>

    <div class="map-wrap relative overflow-hidden rounded-xl">
      <div ref="mapEl" class="map-host" data-testid="location-map" aria-label="Map: tap or drag the pin to your display" />
      <div v-if="picker.mapStatus.value === 'loading'" class="overlay absolute inset-0 flex items-center justify-center">
        <ion-spinner name="crescent" />
      </div>
      <div
        v-else-if="picker.mapStatus.value === 'error'"
        class="overlay absolute inset-0 flex items-center justify-center p-4 text-center text-sm"
        role="status"
      >
        The map couldn't load on this device. Use your current location instead.
      </div>
    </div>

    <p class="m-0 text-sm pl-muted">
      Your pin will be shown about 25–50 m from where you place it. That makes the exact house a bit harder to find,
      but your photo still shows it.
    </p>
    <p v-if="chosen" class="m-0 text-sm font-medium" role="status" data-testid="location-set">Location set ✓</p>

    <!-- Pinned to the bottom of the screen: on small phones the map fills the
         view, and a finger on the map pans it instead of scrolling the page. -->
    <div class="next-bar">
      <ion-button expand="block" class="tap m-0" :disabled="!chosen" @click="emit('next')">Next: photo</ion-button>
    </div>
  </section>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.map-wrap {
  /* Scales with the screen so small phones keep room for the text and the
     Next button: ~200 px on an iPhone SE, 340 px on big phones. */
  height: clamp(190px, 34vh, 340px);
  background: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.08);
}
/* See MapView.vue: maplibre-gl.css would otherwise make this position:
   relative and 0 px tall. */
.map-host {
  position: absolute;
  inset: 0;
}
.next-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin-inline: -16px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: var(--pl-bg, var(--ion-background-color));
  border-top: 1px solid var(--pl-line, transparent);
}
.overlay {
  background: rgba(var(--ion-background-color-rgb, 0, 0, 0), 0.6);
  pointer-events: none;
}
.notice {
  background: rgba(var(--ion-color-warning-rgb, 255, 196, 9), 0.15);
}
</style>
