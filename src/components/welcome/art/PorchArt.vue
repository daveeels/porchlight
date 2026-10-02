<script setup lang="ts">
// Welcome card 1: a house glowing at dusk. Decorative (the card text carries
// the meaning); colours come from the season's --pl-art-* tokens.
</script>

<template>
  <svg viewBox="0 0 240 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="pl-welcome-porch-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" class="glow-in" />
        <stop offset="1" class="glow-out" />
      </radialGradient>
    </defs>
    <rect width="240" height="230" class="sky" />
    <g class="stars">
      <circle cx="30" cy="30" r="1.4" /><circle cx="70" cy="18" r="1" /><circle cx="200" cy="40" r="1.4" />
      <circle cx="170" cy="16" r="1" /><circle cx="110" cy="44" r="1" />
    </g>
    <circle cx="196" cy="54" r="16" class="moon" />
    <rect y="190" width="240" height="40" class="ground" />
    <polygon points="56,104 120,58 184,104" class="roof" />
    <rect x="66" y="102" width="108" height="90" class="wall" />
    <rect x="80" y="118" width="24" height="20" class="window" />
    <rect x="136" y="118" width="24" height="20" class="window" />
    <rect x="108" y="146" width="24" height="46" class="roof" />
    <circle cx="120" cy="138" r="34" fill="url(#pl-welcome-porch-glow)" />
    <circle cx="120" cy="138" r="5" class="lamp" />
    <circle cx="84" cy="198" r="10" class="decor" />
    <circle cx="150" cy="199" r="8" class="decor" />
    <circle cx="166" cy="201" r="6" class="decor" />
    <path d="M62 104 Q90 116 120 104 Q150 116 178 104" class="wire" />
    <g class="bulb-a">
      <circle cx="70" cy="106" r="2.4" /><circle cx="85" cy="110" r="2.4" /><circle cx="100" cy="109" r="2.4" />
      <circle cx="140" cy="109" r="2.4" /><circle cx="155" cy="110" r="2.4" /><circle cx="170" cy="106" r="2.4" />
    </g>
    <g class="bulb-b">
      <circle cx="77" cy="109" r="2" /><circle cx="92" cy="110" r="2" /><circle cx="148" cy="110" r="2" />
      <circle cx="163" cy="109" r="2" />
    </g>
  </svg>
</template>

<style scoped>
svg {
  display: block;
  width: 100%;
  height: 100%;
}
.glow-in {
  stop-color: var(--ion-color-primary);
  stop-opacity: 0.55;
}
.glow-out {
  stop-color: var(--ion-color-primary);
  stop-opacity: 0;
}
.sky {
  fill: var(--pl-art-sky);
}
.stars {
  fill: var(--pl-text);
  opacity: 0.7;
}
.moon {
  fill: var(--pl-art-moon);
  opacity: 0.9;
}
.ground {
  fill: var(--pl-art-ground);
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
.lamp {
  fill: var(--pl-art-lamp);
}
.decor {
  fill: var(--ion-color-secondary);
}
.wire {
  fill: none;
  stroke: var(--pl-on-primary);
  stroke-width: 1;
}
.bulb-a {
  fill: var(--ion-color-primary);
}
.bulb-b {
  fill: var(--pl-art-bulb);
}
</style>
