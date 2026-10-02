<script setup lang="ts">
// Welcome card 4: a phone camera framing a house, and a map pin beside it.
// Decorative; colours from the season's tokens.
</script>

<template>
  <svg viewBox="0 0 240 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="240" height="230" class="sky" />
    <rect x="62" y="40" width="116" height="150" rx="18" class="phone" />
    <rect x="74" y="56" width="92" height="74" rx="10" class="screen" />
    <polygon points="88,108 120,84 152,108" class="roof" />
    <rect x="96" y="106" width="48" height="24" class="wall" />
    <rect x="104" y="112" width="10" height="8" class="window" />
    <rect x="126" y="112" width="10" height="8" class="window" />
    <circle cx="120" cy="160" r="15" class="shutter" />
    <circle cx="120" cy="160" r="7" class="lens" />
    <path d="M186 74 c0 -18 26 -18 26 0 c0 14 -13 26 -13 34 c0 -8 -13 -20 -13 -34z" class="pin" />
    <circle cx="199" cy="74" r="5" class="pin-dot" />
  </svg>
</template>

<style scoped>
svg {
  display: block;
  width: 100%;
  height: 100%;
}
.sky,
.screen {
  fill: var(--pl-art-sky);
}
.phone {
  fill: var(--pl-surface);
  stroke: var(--pl-line);
  stroke-width: 2;
}
.roof {
  fill: var(--pl-art-roof);
}
.wall {
  fill: var(--pl-art-wall);
}
.window {
  fill: var(--pl-art-window);
}
.shutter {
  fill: var(--ion-color-primary);
}
.lens {
  fill: var(--pl-on-primary);
}
.pin {
  fill: var(--ion-color-secondary);
  stroke: var(--pl-on-primary);
  stroke-width: 2;
}
.pin-dot {
  fill: var(--pl-text);
}
</style>
