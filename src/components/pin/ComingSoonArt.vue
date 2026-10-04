<script setup lang="ts">
// Stand-in picture for a Coming soon display added without a photo: a house
// with its lights still off. Fills its box; colours follow the season theme.
defineProps<{ label?: boolean }>()
</script>

<template>
  <span class="art" role="img" aria-label="Decorations coming soon">
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <!-- ground -->
      <rect x="0" y="86" width="160" height="14" class="ground" />
      <!-- house -->
      <path d="M44 86 V50 L80 24 L116 50 V86 Z" class="house" />
      <rect x="72" y="62" width="16" height="24" rx="2" class="door" />
      <rect x="52" y="56" width="13" height="12" rx="1.5" class="window" />
      <rect x="95" y="56" width="13" height="12" rx="1.5" class="window" />
      <!-- an unlit string of bulbs along the roof -->
      <path d="M44 50 Q62 40 80 26 Q98 40 116 50" class="wire" />
      <circle v-for="(b, i) in BULBS" :key="i" :cx="b[0]" :cy="b[1]" r="2.6" class="bulb" />
    </svg>
    <span v-if="label" class="caption">Lights coming soon</span>
  </span>
</template>

<script lang="ts">
const BULBS: [number, number][] = [
  [50, 47],
  [58, 42],
  [66, 37],
  [73, 31],
  [87, 31],
  [94, 37],
  [102, 42],
  [110, 47],
]
</script>

<style scoped>
.art {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, var(--pl-surface), var(--pl-line));
  color: var(--pl-cream);
}
svg {
  width: 70%;
  max-height: 72%;
}
.ground {
  fill: var(--pl-line);
}
.house {
  fill: var(--ion-background-color);
  opacity: 0.85;
}
.door,
.window {
  fill: var(--pl-line);
}
.wire {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.5;
}
.bulb {
  fill: currentColor;
  opacity: 0.35;
}
.caption {
  font-size: 0.75rem;
  font-weight: 800;
  opacity: 0.8;
}
</style>
