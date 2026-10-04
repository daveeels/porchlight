<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import TermsModal from '@/components/common/TermsModal.vue'
import WelcomeFlow from '@/components/welcome/WelcomeFlow.vue'
import { watchOpenCount } from '@/lib/backStack'

/** Ionic's own default: iOS swipe-back on in "ios" mode (set on <html> by Ionic). */
const swipeDefault = document.documentElement.getAttribute('mode') === 'ios'
/**
 * Off while an overlay or add-display step holds a Back history entry
 * (src/lib/backStack): the gesture would animate to the previous page and
 * then only pop that entry. The phone's Back button still works.
 */
const swipeBack = ref(swipeDefault)
const stop = watchOpenCount((count) => {
  swipeBack.value = swipeDefault && count === 0
})
onBeforeUnmount(stop)
</script>

<template>
  <ion-app>
    <ion-router-outlet :swipe-gesture="swipeBack" />
    <!-- Community rules: opens after a first sign-in, on TERMS_REQUIRED, or from the menu / About. -->
    <TermsModal />
    <!-- First-run welcome (SPEC F14): cards 1–3 on a first visit, card 4 after a
         first sign-in (then the rules), or reopened from the menu / About. -->
    <WelcomeFlow />
  </ion-app>
</template>
