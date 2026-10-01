<script setup lang="ts">
// Locate-me button over the map (48 px, SPEC §7 tap targets).
import { IonIcon, IonSpinner } from '@ionic/vue'
import { locateOutline } from 'ionicons/icons'

defineProps<{ locating?: boolean }>()
const emit = defineEmits<{ locate: [] }>()
</script>

<template>
  <button
    type="button"
    class="locate flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
    :aria-label="locating ? 'Finding your location' : 'Show my location'"
    :disabled="locating"
    @click="emit('locate')"
  >
    <ion-spinner v-if="locating" name="crescent" class="h-5 w-5" />
    <ion-icon v-else :icon="locateOutline" class="text-2xl" aria-hidden="true" />
  </button>
</template>

<style scoped>
.locate {
  background: var(--ion-toolbar-background, var(--ion-background-color, #fff));
  color: var(--ion-color-primary);
  border: 1px solid rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.12);
}
.locate:disabled {
  opacity: 0.8;
}
</style>
