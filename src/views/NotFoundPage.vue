<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { alertCircleOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Porchlight</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <StateMessage
        :icon="alertCircleOutline"
        title="Nothing here"
        message="This page doesn't exist. The display may have been removed."
      >
        <ion-button class="tap" router-link="/" router-direction="back">Back to Porchlight</ion-button>
      </StateMessage>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.tap {
  min-height: 44px;
}
</style>
