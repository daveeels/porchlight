<script setup lang="ts">
// The tilted "✓ Verified" pill (or a cream "Unverified" one) in the pin sheet
// and the add-display preview.
import { IonBadge } from '@ionic/vue'

defineProps<{ verified: boolean }>()
</script>

<template>
  <ion-badge v-if="verified" class="badge">✓ Verified</ion-badge>
  <ion-badge v-else class="badge unverified">Unverified</ion-badge>
</template>

<style scoped>
.badge {
  --background: var(--ion-color-primary);
  --color: var(--pl-on-primary);
  --padding-top: 4px;
  --padding-bottom: 4px;
  --padding-start: 10px;
  --padding-end: 10px;
  display: inline-block;
  border-radius: 10px;
  font-family: var(--pl-font-display);
  font-weight: 400;
  font-size: 0.875rem;
  font-synthesis: none;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 0 var(--pl-shadow);
  transform: rotate(-2deg);
  vertical-align: middle;
}
.unverified {
  --background: var(--pl-cream);
  --color: var(--pl-cream-text);
}
</style>
