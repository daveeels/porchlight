<script setup lang="ts">
// The Explore home button (SPEC F5/F6). Signed out, or no display this
// season: "Add my display" (anonymous users are sent to sign in by the
// /submit route guard). Signed in with a live or hidden display this season:
// "My display" with a short status, going to /me (Edit and Remove live
// there). Removed or archived → "Add my display" again. The myPin store
// re-reads the pin after create / update / remove, so this follows along.
import { computed, watch } from 'vue'
import { IonButton, IonFab, IonIcon } from '@ionic/vue'
import { addOutline, homeOutline } from 'ionicons/icons'
import { displayButton } from '@/components/mypin/status'
import { useAuthStore } from '@/stores/auth'
import { useMyPinStore } from '@/stores/myPin'
import { useSeasonStore } from '@/stores/season'

const season = useSeasonStore()
const auth = useAuthStore()
const myPin = useMyPinStore()

watch(
  () => [auth.uid, season.eventId] as const,
  ([uid, eventId]) => {
    if (uid && eventId) void myPin.load()
  },
  { immediate: true },
)

const button = computed(() => displayButton(auth.isSignedIn && myPin.loaded ? myPin.pin : null))
const ariaLabel = computed(() => (button.value.hint ? `${button.value.label}, ${button.value.hint}` : undefined))
</script>

<template>
  <ion-fab v-if="season.eventId" slot="fixed" vertical="bottom" horizontal="end" class="add-fab">
    <ion-button
      shape="round"
      class="fab-button"
      :router-link="button.to"
      :aria-label="ariaLabel"
      :data-mine="button.mine"
      data-testid="add-display"
    >
      <ion-icon slot="start" :icon="button.mine ? homeOutline : addOutline" aria-hidden="true" />
      {{ button.label }}
      <span
        v-if="button.hint"
        class="hint pl-sticker"
        :class="button.attention ? 'pl-sticker--ember' : 'pl-sticker--cream'"
        aria-hidden="true"
        data-testid="display-hint"
        >{{ button.hint }}</span
      >
    </ion-button>
  </ion-fab>
</template>

<style scoped>
.add-fab {
  margin-bottom: env(safe-area-inset-bottom, 0px);
}
.fab-button {
  min-height: 52px;
  --padding-start: 18px;
  --padding-end: 20px;
  --box-shadow: 0 3px 0 var(--pl-shadow), 0 8px 22px var(--pl-shadow);
  font-family: var(--pl-font-display);
  font-weight: 400;
  font-size: 1.05rem;
  font-synthesis: none;
  letter-spacing: 0.01em;
}
.hint {
  --pl-tilt: -4deg;
  margin-inline-start: 8px;
  font-size: 0.7rem;
}
</style>
