<script setup lang="ts">
// Account menu entries (SPEC F6, §5 beta "Send feedback"): My display, Send
// feedback, About & privacy, Sign out. Render inside a popover or modal and
// close it on `done`; or use useAccountMenu().actionSheetButtons() instead.
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/vue'
import { beerOutline, chatbubbleEllipsesOutline, homeOutline, informationCircleOutline, logOutOutline } from 'ionicons/icons'
import { useAuthStore } from '@/stores/auth'
import { useAccountMenu } from './accountMenu'

const emit = defineEmits<{ done: [] }>()
const auth = useAuthStore()
const menu = useAccountMenu()

function feedback(): void {
  menu.sendFeedback()
  emit('done')
}

function signOut(): void {
  emit('done')
  void menu.signOut()
}
</script>

<template>
  <ion-list lines="none" class="account-menu" aria-label="Account">
    <ion-item button :detail="false" router-link="/me" class="item" @click="emit('done')">
      <ion-icon slot="start" :icon="homeOutline" aria-hidden="true" />
      <ion-label>My display</ion-label>
    </ion-item>
    <ion-item button :detail="false" class="item" @click="feedback">
      <ion-icon slot="start" :icon="chatbubbleEllipsesOutline" aria-hidden="true" />
      <ion-label>Send feedback</ion-label>
    </ion-item>
    <ion-item button :detail="false" router-link="/about" class="item" @click="emit('done')">
      <ion-icon slot="start" :icon="informationCircleOutline" aria-hidden="true" />
      <ion-label>About &amp; privacy</ion-label>
    </ion-item>
    <ion-item
      v-if="menu.donateUrl()"
      button
      :detail="false"
      :href="menu.donateUrl() ?? undefined"
      target="_blank"
      rel="noopener"
      class="item"
      data-testid="donate-menu"
      @click="emit('done')"
    >
      <ion-icon slot="start" :icon="beerOutline" aria-hidden="true" />
      <ion-label>Buy a bad decision 🍻</ion-label>
    </ion-item>
    <ion-item v-if="auth.isSignedIn" button :detail="false" class="item" @click="signOut">
      <ion-icon slot="start" :icon="logOutOutline" aria-hidden="true" />
      <ion-label>Sign out</ion-label>
    </ion-item>
  </ion-list>
</template>

<style scoped>
.item {
  --min-height: 48px;
}
</style>
