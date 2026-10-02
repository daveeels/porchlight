<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import TermsModal from '@/components/common/TermsModal.vue'
import WelcomeFlow from '@/components/welcome/WelcomeFlow.vue'
</script>

<template>
  <ion-app>
    <ion-router-outlet />
    <!-- Community rules: opens after a first sign-in, on TERMS_REQUIRED, or from the menu / About. -->
    <TermsModal />
    <!-- First-run welcome (SPEC F14): cards 1–3 on a first visit, card 4 after a
         first sign-in (then the rules), or reopened from the menu / About. -->
    <WelcomeFlow />
  </ion-app>
</template>
