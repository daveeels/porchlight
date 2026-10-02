<script setup lang="ts">
// SPEC §3 rule 3: no usable season (Jan 8 – Sep 14, or no event docs yet).
import { SEASON_THEMES } from '@/config/seasons'
</script>

<template>
  <section class="flex flex-col items-center px-6 py-16 text-center">
    <div class="text-5xl" aria-hidden="true">{{ SEASON_THEMES.HALLOWEEN.icon }} {{ SEASON_THEMES.CHRISTMAS.icon }}</div>
    <h1 class="pl-display mt-4 mb-0 text-3xl">See you in October</h1>
    <p class="mt-3 mb-0 max-w-xs pl-muted">
      Porchlight finds the decorated houses worth the drive, for Halloween and Christmas.
      It's quiet right now. Come back when the lights go up.
    </p>
  </section>
</template>
