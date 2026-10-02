<script setup lang="ts">
// Welcome card 2: a dark map with glowing (verified) and faded pins and the
// "you are here" dot. Decorative; colours from the season's tokens.
</script>

<template>
  <svg viewBox="0 0 240 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="pl-welcome-map-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" class="glow-in" />
        <stop offset="1" class="glow-out" />
      </radialGradient>
    </defs>
    <rect width="240" height="230" class="map" />
    <g class="road">
      <path d="M-10 70 L250 40" /><path d="M40 -10 L90 240" /><path d="M-10 160 L250 190" />
      <path d="M170 -10 L150 240" />
    </g>
    <g class="road-minor"><path d="M-10 115 L250 105" /><path d="M120 -10 L125 240" /></g>
    <circle cx="70" cy="60" r="26" fill="url(#pl-welcome-map-glow)" />
    <circle cx="160" cy="150" r="26" fill="url(#pl-welcome-map-glow)" />
    <circle cx="70" cy="60" r="11" class="pin" />
    <circle cx="160" cy="150" r="11" class="pin" />
    <circle cx="196" cy="70" r="9" class="pin faded" />
    <circle cx="54" cy="176" r="9" class="pin faded" />
    <circle cx="118" cy="104" r="7" class="you" />
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
.map {
  fill: var(--pl-art-map);
}
.road,
.road-minor {
  fill: none;
  stroke-linecap: round;
}
.road {
  stroke: var(--pl-art-road);
  stroke-width: 7;
}
.road-minor {
  stroke: var(--pl-art-road-minor);
  stroke-width: 2.5;
}
.pin {
  fill: var(--ion-color-primary);
  stroke: var(--pl-on-primary);
  stroke-width: 2;
}
.pin.faded {
  fill: var(--pl-art-pin-faded);
}
.you {
  fill: var(--pl-art-you);
  stroke: var(--pl-text);
  stroke-width: 2.5;
}
</style>
