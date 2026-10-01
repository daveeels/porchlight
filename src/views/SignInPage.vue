<script setup lang="ts">
// SPEC F4. signInWithPopup must start synchronously in the tap handler or the
// browser blocks the popup. Afterwards go to ?redirect= (set by the auth guard
// for /submit and /me) if present, else back to where the user was.
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/vue'
import { logoGoogle } from 'ionicons/icons'
import { safeRedirect } from '@/lib/redirect'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const ionRouter = useIonRouter()
const busy = ref(false)
const errorMessage = ref<string | null>(null)

function messageFor(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'Sign-in was cancelled. Tap the button to try again.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.'
    case 'auth/network-request-failed':
      return "You're offline or the connection dropped. Check your connection and try again."
    case 'auth/unauthorized-domain':
      return "Sign-in isn't set up for this address. Open Porchlight from its usual link."
    default:
      return "Couldn't sign in. Please try again."
  }
}

/**
 * To the guarded page that sent the user here (replacing /sign-in, so Explore
 * stays at the root of the stack); otherwise back to where they came from, or
 * to Explore if they landed here directly.
 */
function goBack(): void {
  const target = safeRedirect(route.query.redirect)
  if (target) void router.replace(target)
  else if (ionRouter.canGoBack()) router.back()
  else void router.replace('/')
}

function continueWithGoogle(): void {
  // Must be the first statement: no await or other async work before it.
  const pending = auth.signIn()
  busy.value = true
  errorMessage.value = null
  pending
    .then(() => goBack())
    .catch((e: unknown) => {
      errorMessage.value = messageFor(e)
    })
    .finally(() => {
      busy.value = false
    })
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" class="back" />
        </ion-buttons>
        <ion-title>Sign in</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="mx-auto flex max-w-sm flex-col gap-4 pt-6">
        <h1 class="m-0 text-2xl font-bold">Join Porchlight</h1>
        <p class="m-0 opacity-85">
          Members can use the map, add their own display and vote on whether displays are really there.
          Searching and browsing stay free without an account.
        </p>

        <template v-if="auth.isSignedIn">
          <p class="m-0 font-medium" role="status">You're signed in.</p>
          <ion-button expand="block" class="tap" @click="goBack">Continue</ion-button>
        </template>
        <template v-else>
          <ion-button expand="block" class="tap" :disabled="busy || !auth.ready" @click="continueWithGoogle">
            <ion-spinner v-if="busy" slot="start" name="crescent" />
            <ion-icon v-else slot="start" :icon="logoGoogle" aria-hidden="true" />
            Continue with Google
          </ion-button>
          <p v-if="errorMessage" class="error m-0 text-sm" role="alert">{{ errorMessage }}</p>
        </template>

        <p class="m-0 text-xs opacity-75">
          We only use your Google account to sign you in. Your name and email are never shown on displays
          or stored with them.
          <router-link to="/about" class="link">Privacy &amp; terms</router-link>
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.back {
  --min-height: 44px;
  --min-width: 44px;
}
.tap {
  min-height: 48px;
}
.error {
  color: var(--ion-color-danger);
}
.link {
  color: var(--ion-color-primary);
  display: inline-block;
  padding: 12px 0;
}
</style>
