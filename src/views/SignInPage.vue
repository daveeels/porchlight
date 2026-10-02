<script setup lang="ts">
// SPEC F4, F11. Two ways in: Google (signInWithPopup, which must start
// synchronously in the tap handler or the browser blocks the popup) and an
// emailed sign-in link. Afterwards go to ?redirect= (set by the auth guard
// for /submit and /me) if present, else back to where the user was.
// Inside in-app browsers (Facebook etc.) Google refuses to sign in, so the
// email form comes first there, with a collapsed "Prefer Google? Open in
// Safari/Chrome" way out to the real browser (which reopens /sign-in with the
// same return path, so the display the user wanted isn't lost).
import { computed, ref } from 'vue'
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
import EmailLinkForm from '@/components/auth/EmailLinkForm.vue'
import InAppBrowserNotice from '@/components/auth/InAppBrowserNotice.vue'
import { returnPath } from '@/components/auth/emailLink'
import { detectInAppBrowser } from '@/lib/inAppBrowser'
import { safeRedirect } from '@/lib/redirect'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const ionRouter = useIonRouter()
const busy = ref(false)
const errorMessage = ref<string | null>(null)
/** "Check your inbox" is showing: hide Google and the "or" line. */
const emailSent = ref(false)
const browser = detectInAppBrowser(navigator.userAgent)
const inAppHeading = browser.app
  ? `You're inside ${browser.app} — sign in with your email below.`
  : "You're inside an app — sign in with your email below."

/** Where the email link brings the user back to (it opens in a new tab). */
const emailRedirect = computed(() => {
  void route.fullPath // re-evaluate when this page's route changes
  return returnPath(route.query.redirect, window.history.state)
})

/**
 * /sign-in as reopened in the real browser ("Open in Safari/Chrome", "Copy
 * link"): it has no history there, so the return path rides in ?redirect=.
 */
const browserLocation = computed(() => {
  const search = emailRedirect.value ? `?redirect=${encodeURIComponent(emailRedirect.value)}` : ''
  const { host, origin } = window.location
  return { host, pathname: '/sign-in', search, href: `${origin}/sign-in${search}` }
})

function messageFor(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'Sign-in was cancelled. Tap the button to try again.'
    case 'auth/popup-blocked':
      return browser.inApp
        ? 'Google sign-in is blocked here. Use the email link instead, or open Porchlight in your browser.'
        : 'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.'
    case 'auth/network-request-failed':
      return "You're offline or the connection dropped. Check your connection and try again."
    case 'auth/unauthorized-domain':
      return "Sign-in isn't set up for this address. Open Porchlight from its usual link."
    default:
      return browser.inApp
        ? "Couldn't sign in with Google here. Use the email link instead, or open Porchlight in your browser."
        : "Couldn't sign in. Please try again."
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
        <h1 class="pl-display m-0 text-3xl">Join Porchlight</h1>
        <p class="m-0 pl-muted">
          Members can use the map, add their own display and vote on whether displays are really there.
          Searching and browsing stay free without an account.
        </p>

        <template v-if="auth.isSignedIn">
          <p class="m-0 font-medium" role="status">You're signed in.</p>
          <ion-button expand="block" class="tap" @click="goBack">Continue</ion-button>
        </template>

        <!-- In-app browser: email first (it works here); Google is behind
             "Prefer Google?", which opens Porchlight in the real browser. -->
        <template v-else-if="browser.inApp">
          <p class="m-0 font-semibold" data-testid="in-app-heading">{{ inAppHeading }}</p>
          <email-link-form
            :redirect="emailRedirect"
            primary
            @signed-in="goBack"
            @sent="emailSent = true"
            @reset="emailSent = false"
          />
          <in-app-browser-notice v-if="!emailSent" :browser="browser" :location="browserLocation">
            <ion-button expand="block" fill="outline" class="tap" :disabled="busy || !auth.ready" @click="continueWithGoogle">
              <ion-spinner v-if="busy" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="logoGoogle" aria-hidden="true" />
              Continue with Google
            </ion-button>
            <p class="m-0 text-xs pl-muted">Google sign-in usually only works in your phone's browser.</p>
            <p v-if="errorMessage" class="error m-0 text-sm" role="alert">{{ errorMessage }}</p>
          </in-app-browser-notice>
        </template>

        <template v-else>
          <template v-if="!emailSent">
            <ion-button expand="block" class="tap" :disabled="busy || !auth.ready" @click="continueWithGoogle">
              <ion-spinner v-if="busy" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="logoGoogle" aria-hidden="true" />
              Continue with Google
            </ion-button>
            <p v-if="errorMessage" class="error m-0 text-sm" role="alert">{{ errorMessage }}</p>
            <div class="divider" aria-hidden="true"><span>or</span></div>
          </template>
          <email-link-form
            :redirect="emailRedirect"
            @signed-in="goBack"
            @sent="emailSent = true"
            @reset="emailSent = false"
          />
        </template>

        <p class="m-0 text-xs pl-muted">
          We only use your Google account or email address to sign you in. Your name and email are never
          shown on displays or stored with them.
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
  font-weight: 800;
  display: inline-block;
  padding: 12px 0;
}
.divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  opacity: 0.7;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid currentColor;
  opacity: 0.4;
}
</style>
