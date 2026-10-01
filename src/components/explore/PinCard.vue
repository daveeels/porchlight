<script setup lang="ts">
import { IonItem, IonLabel, IonThumbnail } from '@ionic/vue'
import VerifiedBadge from '@/components/pin/VerifiedBadge.vue'
import { formatDistance, hereCountShort } from '@/components/pin/format'
import type { Pin } from '@/types/models'

defineProps<{
  pin: Pin
  /** Km from the user (near me only). */
  distanceKm?: number | null
}>()

defineEmits<{ select: [id: string] }>()
</script>

<template>
  <ion-item button :detail="false" lines="full" class="pin-card" :data-pin-id="pin.id" @click="$emit('select', pin.id)">
    <ion-thumbnail slot="start" class="thumb">
      <img :src="pin.thumbUrl" :alt="`Photo of ${pin.title}`" loading="lazy" />
    </ion-thumbnail>
    <ion-label class="ion-text-wrap">
      <h3 class="title m-0 font-semibold">{{ pin.title }}</h3>
      <p class="m-0 mt-0.5">
        {{ pin.place.town }}<template v-if="distanceKm != null"> · {{ formatDistance(distanceKm) }}</template>
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <VerifiedBadge :verified="pin.verified" />
        <span class="text-xs">{{ hereCountShort(pin.hereVotes) }}</span>
      </div>
    </ion-label>
  </ion-item>
</template>

<style scoped>
.pin-card {
  --min-height: 88px;
}
.thumb {
  --size: 72px;
  --border-radius: 8px;
  background: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.08);
  border-radius: 8px;
}
.title {
  font-size: 1rem;
}
</style>
