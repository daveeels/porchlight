<script setup lang="ts">
// One tile of the results grid: photo on top with a sticker ("✓ 15" when
// verified, "NEW" when not), then title and town. Verified tiles glow.
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
  <button
    type="button"
    class="pl-card pin-card"
    :class="{ verified: pin.verified }"
    :data-pin-id="pin.id"
    @click="$emit('select', pin.id)"
  >
    <span class="thumb">
      <img :src="pin.thumbUrl" alt="" loading="lazy" />
    </span>
    <!-- The sticker is visual; card-status says the same in words. -->
    <span
      class="sticker pl-sticker"
      :class="pin.verified ? undefined : 'pl-sticker--cream'"
      :data-verified="pin.verified ? 'true' : 'false'"
      aria-hidden="true"
      >{{ pin.verified ? `✓ ${pin.hereVotes}` : 'NEW' }}</span
    >
    <span class="txt">
      <span class="title">{{ pin.title }}</span>
      <span class="town pl-muted">
        {{ pin.place.town }}<template v-if="distanceKm != null"> · {{ formatDistance(distanceKm) }}</template>
      </span>
      <span class="sr-only" data-testid="card-status"
        >{{ pin.verified ? 'Verified' : 'Unverified' }} · {{ hereCountShort(pin.hereVotes) }}</span
      >
    </span>
  </button>
</template>

<style scoped>
.pin-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 18px;
  overflow: hidden;
  background: var(--pl-surface);
  text-align: start;
  cursor: pointer;
}
.pin-card.verified {
  box-shadow:
    0 0 0 2px var(--ion-color-primary),
    0 0 20px var(--pl-glow);
}
.pin-card:active {
  transform: translateY(1px);
}
@media (prefers-reduced-motion: reduce) {
  .pin-card:active {
    transform: none;
  }
}
.thumb {
  display: block;
  height: 104px;
  background: var(--pl-line);
}
.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sticker {
  position: absolute;
  top: 8px;
  right: 8px;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px 10px;
  min-width: 0;
}
.title {
  font-size: 0.875rem;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.town {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
