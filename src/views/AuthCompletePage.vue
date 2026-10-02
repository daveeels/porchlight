<script setup lang="ts">
// SPEC F11: the email sign-in link lands here. Finish sign-in with the address
// saved on this device; if it was opened on another device or browser, ask
// for the address again. Expired or used links get a clear message and a way
// to send a new one. Then replace this page with ?redirect= (same-site only).
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import StateMessage from '@/components/common/StateMessage.vue'
import EmailLinkForm from '@/components/auth/EmailLinkForm.vue'
import { isPlausibleEmail, linkFailure } from '@/components/auth/emailLink'
import { safeRedirect } from '@/lib/redirect'
import { useAuthStore } from '@/stores/auth'

type Phase = 'checking' | 'not-link' | 'need-email' | 'signing-in' | 'expired' | 'error'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const phase = ref<Phase>('checking')
const email = ref('')
const emailError = ref<string | null>(null)
const errorMessage = ref('')
let link = ''

const target = ((): string => {
  const path = safeRedirect(route.query.redirect)
  return path && !path.startsWith('/auth/') ? path : '/'
})()

/**
 * Drops the one-time code from the address bar and history once it can't be
 * used any more (expired / already used), keeping only ?redirect=. While the
 * link may still work (asking for the email, offline) it stays, so a reload
 * — e.g. iOS reloading the tab after the user checks their mail app — can
 * still finish sign-in.
 */
function forgetLinkInUrl(): void {
  const path = target === '/' ? '/auth/complete' : `/auth/complete?redirect=${encodeURIComponent(target)}`
  try {
    const state = (window.history.state ?? {}) as Record<string, unknown>
    window.history.replaceState({ ...state, current: path }, '', path)
  } catch {
    // History API unavailable: nothing to clean up.
  }
}

async function finish(address: string): Promise<void> {
  phase.value = 'signing-in'
  emailError.value = null
  try {
    await auth.completeEmailLink(address, link)
    await router.replace(target)
  } catch (e: unknown) {
    switch (linkFailure(e)) {
      case 'expired':
        phase.value = 'expired'
        forgetLinkInUrl()
        break
      case 'wrong-email':
        email.value = address
        emailError.value = "That isn't the email address this link was sent to. Check it and try again."
        phase.value = 'need-email'
        break
      case 'offline':
        errorMessage.value = "You're offline or the connection dropped. Check your connection and try again."
        phase.value = 'error'
        break
      default:
        errorMessage.value = "Couldn't finish signing in. Please try again."
        phase.value = 'error'
    }
  }
}

function submitEmail(): void {
  if (!isPlausibleEmail(email.value)) {
    emailError.value = 'Enter your email address, like name@example.com.'
    return
  }
  void finish(email.value)
}

function retry(): void {
  const saved = auth.pendingEmail()
  if (saved) void finish(saved)
  else phase.value = 'need-email'
}

onMounted(() => {
  link = window.location.href
  if (!auth.isEmailLink(link)) {
    phase.value = 'not-link'
    return
  }
  const saved = auth.pendingEmail()
  email.value = saved ?? ''
  if (saved) void finish(saved)
  else phase.value = 'need-email'
})
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Signing in</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="mx-auto flex max-w-sm flex-col gap-4 pt-2">
        <state-message v-if="phase === 'checking' || phase === 'signing-in'" title="Signing you in…" loading />

        <state-message
          v-else-if="phase === 'not-link'"
          title="This isn't a sign-in link"
          message="Open the link from your Porchlight email, or ask for a new one."
          emoji="🔗"
        >
          <ion-button router-link="/sign-in" router-direction="root" class="tap">Go to sign in</ion-button>
        </state-message>

        <template v-else-if="phase === 'need-email'">
          <h1 class="pl-display m-0 text-3xl">Confirm your email</h1>
          <p class="m-0 pl-muted">
            It looks like you opened the link on a different phone or browser. Enter the email address you
            asked for the link with.
          </p>
          <form class="flex flex-col gap-3" novalidate @submit.prevent="submitEmail">
            <ion-input
              :value="email"
              label="Email"
              label-placement="stacked"
              fill="outline"
              type="email"
              inputmode="email"
              autocomplete="email"
              enterkeyhint="go"
              placeholder="name@example.com"
              data-testid="confirm-email-input"
              @ion-input="email = String($event.detail.value ?? '')"
            />
            <ion-button type="submit" expand="block" class="tap">Finish signing in</ion-button>
            <p v-if="emailError" class="error m-0 text-sm" role="alert">{{ emailError }}</p>
          </form>
        </template>

        <template v-else-if="phase === 'expired'">
          <state-message
            title="This link has expired or was already used"
            message="Sign-in links work once and only for a short time. We can send you a new one."
            emoji="⌛"
            error
          />
          <email-link-form :redirect="target" :initial-email="email" primary submit-label="Send a new link" />
        </template>

        <state-message v-else-if="phase === 'error'" title="Couldn't sign you in" :message="errorMessage" emoji="⚠️" error>
          <ion-button class="tap" @click="retry">Try again</ion-button>
        </state-message>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.error {
  color: var(--ion-color-danger);
}
</style>
