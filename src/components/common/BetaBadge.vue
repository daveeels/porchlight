<script setup lang="ts">
// SPEC §5 beta mode: a small tilted "Beta" sticker in the header while
// config/app.launchMode is 'BETA'. Renders nothing once LIVE.
import { computed } from 'vue'
import { useAppConfigStore } from '@/stores/appConfig'

const appConfig = useAppConfigStore()
const isBeta = computed(() => appConfig.config.launchMode === 'BETA')
</script>

<template>
  <span
    v-if="isBeta"
    class="beta pl-sticker pl-sticker--ember"
    data-testid="beta-badge"
    title="Porchlight is in private beta"
  >
    Beta
  </span>
</template>

<style scoped>
.beta {
  --pl-tilt: -4deg;
  text-transform: uppercase;
  font-size: 0.75rem;
}
</style>
