<script setup lang="ts">
import { IonBadge } from '@ionic/vue'

defineProps<{ verified: boolean }>()
</script>

<template>
  <ion-badge v-if="verified" color="primary" class="badge">✓ Verified</ion-badge>
  <ion-badge v-else color="medium" class="badge">Unverified</ion-badge>
</template>

<style scoped>
.badge {
  font-weight: 600;
  vertical-align: middle;
}
</style>
