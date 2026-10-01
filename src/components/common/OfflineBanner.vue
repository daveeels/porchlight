<script setup lang="ts">
// "You're offline" strip (SPEC §7). Tracks navigator.onLine.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { IonIcon } from '@ionic/vue'
import { cloudOfflineOutline } from 'ionicons/icons'

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const update = () => {
  online.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
})
</script>

<template>
  <div v-if="!online" class="offline flex items-center gap-2 px-4 py-2 text-sm" role="status">
    <ion-icon :icon="cloudOfflineOutline" aria-hidden="true" />
    <span>You're offline. Showing what's already loaded.</span>
  </div>
</template>

<style scoped>
.offline {
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
}
</style>
