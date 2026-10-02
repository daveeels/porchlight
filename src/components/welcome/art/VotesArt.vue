<script setup lang="ts">
// Welcome card 3: a display in a photo frame above the "It's here ✓" and
// "Not there" buttons. Decorative; colours from the season's tokens.
</script>

<template>
  <svg viewBox="0 0 240 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="240" height="230" class="sky" />
    <rect x="30" y="34" width="180" height="104" rx="18" class="wall" />
    <rect x="44" y="48" width="152" height="76" rx="12" class="roof" />
    <polygon points="78,104 120,72 162,104" class="wall" />
    <rect x="92" y="102" width="56" height="22" class="wall-2" />
    <rect x="100" y="106" width="10" height="8" class="window" />
    <rect x="130" y="106" width="10" height="8" class="window" />
    <rect x="30" y="154" width="86" height="40" rx="14" class="yes" />
    <rect x="124" y="154" width="86" height="40" rx="14" class="no" />
    <text x="73" y="180" text-anchor="middle" class="label yes-text">It's here ✓</text>
    <text x="167" y="180" text-anchor="middle" class="label no-text">Not there</text>
  </svg>
</template>

<style scoped>
svg {
  display: block;
  width: 100%;
  height: 100%;
}
.sky {
  fill: var(--pl-art-sky);
}
.wall {
  fill: var(--pl-art-wall);
}
.wall-2 {
  fill: var(--pl-art-wall-2);
}
.roof {
  fill: var(--pl-art-roof);
}
.window {
  fill: var(--pl-art-window);
}
.yes {
  fill: var(--ion-color-primary);
}
.no {
  fill: var(--pl-surface);
  stroke: var(--pl-line);
}
.label {
  font-family: var(--pl-font-display);
  font-size: 15px;
  font-synthesis: none;
}
.yes-text {
  fill: var(--pl-on-primary);
}
.no-text {
  fill: var(--pl-text);
}
</style>
