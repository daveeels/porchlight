<script setup lang="ts">
// The owner's view of their pin (SPEC F6): photo, title, town, status in
// plain words, and the vote count.
import { computed } from 'vue'
import { IonBadge } from '@ionic/vue'
import { hereCountLong, placeLine } from '@/components/pin/format'
import type { Pin } from '@/types/models'
import ComingSoonArt from '@/components/pin/ComingSoonArt.vue'
import { pinStatusInfo } from './status'

const props = defineProps<{ pin: Pin }>()
const info = computed(() => pinStatusInfo(props.pin))
const live = computed(() => props.pin.status === 'ACTIVE')
</script>

<template>
  <article class="card overflow-hidden rounded-xl" data-testid="my-pin">
    <img
      v-if="pin.photoUrl && pin.status !== 'REMOVED'"
      :src="pin.photoUrl"
      :alt="`Photo of ${pin.title}`"
      class="photo block w-full object-cover"
    />
    <div v-else-if="pin.stage === 'COMING_SOON' && pin.status !== 'REMOVED'" class="photo"><ComingSoonArt label /></div>
    <div class="flex flex-col gap-2 p-4">
      <h2 class="pl-display m-0 text-2xl break-words">{{ pin.title }}</h2>
      <p class="m-0 text-sm pl-muted">{{ placeLine(pin) }}</p>
      <div>
        <ion-badge :color="info.tone" class="status" data-testid="pin-status">{{ info.label }}</ion-badge>
      </div>
      <p class="m-0 text-sm">{{ info.detail }}</p>
      <p v-if="live" class="m-0 text-sm pl-muted">{{ hereCountLong(pin.hereVotes) }}</p>
      <p v-if="pin.description" class="m-0 text-sm whitespace-pre-line break-words">{{ pin.description }}</p>
    </div>
  </article>
</template>

<style scoped>
.card {
  background: var(--pl-surface);
}
.photo {
  aspect-ratio: 4 / 3;
}
.status {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 6px 10px;
  white-space: normal;
  text-align: left;
}
</style>
