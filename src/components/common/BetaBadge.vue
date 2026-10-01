<script setup lang="ts">
// SPEC §5 beta mode: a small "Beta" chip in the header while
// config/app.launchMode is 'BETA'. Renders nothing once LIVE.
import { computed } from 'vue'
import { IonBadge } from '@ionic/vue'
import { useAppConfigStore } from '@/stores/appConfig'

const appConfig = useAppConfigStore()
const isBeta = computed(() => appConfig.config.launchMode === 'BETA')
</script>

<template>
  <ion-badge
    v-if="isBeta"
    color="tertiary"
    class="beta"
    data-testid="beta-badge"
    title="Porchlight is in private beta"
  >
    Beta
  </ion-badge>
</template>

<style scoped>
.beta {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  vertical-align: middle;
  margin-inline-start: 6px;
  padding: 3px 6px;
  border-radius: 999px;
}
</style>
