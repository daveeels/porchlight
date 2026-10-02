<script setup lang="ts">
// Loading / empty / error states (SPEC §7). Actions go in the default slot,
// outside the live region so screen readers don't re-announce the buttons.
import { IonIcon, IonSpinner } from '@ionic/vue'

defineProps<{
  title: string
  message?: string
  /** An ionicons icon (svg data). Ignored when loading. */
  icon?: string
  /** Emoji shown instead of an icon, e.g. the season icon. */
  emoji?: string
  loading?: boolean
  /** An error state: announced assertively (role="alert"). Others use role="status". */
  error?: boolean
}>()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-10 text-center">
    <div class="flex flex-col items-center" :role="error ? 'alert' : 'status'">
      <ion-spinner v-if="loading" name="crescent" color="primary" class="mb-3" />
      <div v-else-if="emoji" class="mb-2 text-4xl" aria-hidden="true">{{ emoji }}</div>
      <ion-icon v-else-if="icon" :icon="icon" color="medium" class="mb-2 text-4xl" aria-hidden="true" />
      <h2 class="title pl-display m-0">{{ title }}</h2>
      <p v-if="message" class="state-message mt-2 mb-0 max-w-xs text-sm">{{ message }}</p>
    </div>
    <div v-if="$slots.default" class="mt-4 flex flex-col items-center gap-2">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.title {
  font-size: 1.375rem;
  line-height: 1.15;
}
.state-message {
  color: var(--pl-muted);
  font-weight: 700;
}
</style>
