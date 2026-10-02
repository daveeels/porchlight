<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import TermsModal from '@/components/common/TermsModal.vue'
</script>

<template>
  <ion-app>
    <ion-router-outlet />
    <!-- Community rules: opens after a first sign-in, on TERMS_REQUIRED, or from the menu / About. -->
    <TermsModal />
  </ion-app>
</template>
