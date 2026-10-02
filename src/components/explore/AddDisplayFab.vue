<script setup lang="ts">
// "Add my display" entry point on Explore (SPEC F5). Shown to everyone in
// season: anonymous users are sent to sign in by the /submit route guard.
import { IonButton, IonFab, IonIcon } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useSeasonStore } from '@/stores/season'

const season = useSeasonStore()
</script>

<template>
  <ion-fab v-if="season.eventId" slot="fixed" vertical="bottom" horizontal="end" class="add-fab">
    <ion-button shape="round" class="fab-button" router-link="/submit" data-testid="add-display">
      <ion-icon slot="start" :icon="addOutline" aria-hidden="true" />
      Add my display
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
</style>
