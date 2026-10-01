<script setup lang="ts">
// SPEC F11: "Email me a sign-in link" → "Check your inbox" with resend
// (60 s cooldown) and the spam hint. The link opens /auth/complete, which
// finishes sign-in. If the link opens somewhere else (the home-screen app on
// iPhone, or out of an in-app browser), the user can paste it here instead.
import { onUnmounted, ref } from 'vue'
import { IonButton, IonInput, IonSpinner } from '@ionic/vue'
import { useAuthStore } from '@/stores/auth'
import {
  RESEND_COOLDOWN_SECONDS,
  isPlausibleEmail,
  linkFailure,
  sendLinkErrorMessage,
} from './emailLink'

const props = withDefaults(
  defineProps<{
    /** Same-site path to return to after the link is opened. */
    redirect: string | null
    initialEmail?: string
    /** Filled (recommended) button rather than outline. */
    primary?: boolean
    submitLabel?: string
  }>(),
  { initialEmail: '', primary: false, submitLabel: 'Email me a sign-in link' },
)

const emit = defineEmits<{
  'signed-in': []
  /** "Check your inbox" is showing (the page hides its other sign-in options). */
  sent: []
  /** Back to the email field ("Use a different email"). */
  reset: []
}>()

const auth = useAuthStore()
const email = ref(props.initialEmail)
const sentTo = ref<string | null>(null)
const sending = ref(false)
const errorMessage = ref<string | null>(null)
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const pastedLink = ref('')
const pasteBusy = ref(false)
const pasteError = ref<string | null>(null)

function startCooldown(): void {
  cooldown.value = RESEND_COOLDOWN_SECONDS
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value = Math.max(0, cooldown.value - 1)
    if (cooldown.value === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

async function send(address: string): Promise<void> {
  if (sending.value) return
  errorMessage.value = null
  if (!isPlausibleEmail(address)) {
    errorMessage.value = 'Enter your email address, like name@example.com.'
    return
  }
  sending.value = true
  try {
    await auth.sendEmailLink(address, props.redirect)
    sentTo.value = address.trim()
    startCooldown()
    emit('sent')
  } catch (e: unknown) {
    errorMessage.value = sendLinkErrorMessage(e)
  } finally {
    sending.value = false
  }
}

function resend(): void {
  if (sentTo.value && cooldown.value === 0) void send(sentTo.value)
}

function useDifferentEmail(): void {
  sentTo.value = null
  emit('reset')
  errorMessage.value = null
  pasteError.value = null
}

async function usePastedLink(): Promise<void> {
  const link = pastedLink.value.trim()
  pasteError.value = null
  if (!sentTo.value) return
  if (!auth.isEmailLink(link)) {
    pasteError.value = "That isn't a Porchlight sign-in link. Copy the whole link from the email."
    return
  }
  pasteBusy.value = true
  try {
    await auth.completeEmailLink(sentTo.value, link)
    emit('signed-in')
  } catch (e: unknown) {
    pasteError.value =
      linkFailure(e) === 'expired'
        ? 'That link has expired or was already used. Tap Resend for a new one.'
        : "Couldn't sign in with that link. Please try again."
  } finally {
    pasteBusy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <form v-if="!sentTo" class="flex flex-col gap-3" novalidate @submit.prevent="send(email)">
      <ion-input
        :value="email"
        label="Email"
        label-placement="stacked"
        fill="outline"
        type="email"
        inputmode="email"
        autocomplete="email"
        enterkeyhint="send"
        placeholder="name@example.com"
        data-testid="email-input"
        @ion-input="email = String($event.detail.value ?? '')"
      />
      <ion-button
        type="submit"
        expand="block"
        class="tap"
        :fill="primary ? 'solid' : 'outline'"
        :disabled="sending"
      >
        <ion-spinner v-if="sending" slot="start" name="crescent" />
        {{ submitLabel }}
      </ion-button>
      <p v-if="errorMessage" class="error m-0 text-sm" role="alert">{{ errorMessage }}</p>
    </form>

    <section v-else class="inbox flex flex-col gap-3 rounded-xl p-4" aria-labelledby="inbox-heading">
      <div role="status" class="flex flex-col gap-2">
        <h2 id="inbox-heading" class="m-0 text-lg font-semibold">
          <span aria-hidden="true">📬 </span>Check your inbox
        </h2>
        <p class="m-0">
          We sent a sign-in link to <strong class="break-all">{{ sentTo }}</strong>. Open it on this phone to
          finish signing in.
        </p>
        <p class="m-0 text-sm opacity-85">Can't see it? Check your spam or junk folder.</p>
      </div>
      <ion-button expand="block" fill="outline" class="tap" :disabled="sending || cooldown > 0" @click="resend">
        <ion-spinner v-if="sending" slot="start" name="crescent" />
        {{ cooldown > 0 ? `Resend in ${cooldown} s` : 'Resend the link' }}
      </ion-button>
      <ion-button expand="block" fill="clear" class="tap" @click="useDifferentEmail">Use a different email</ion-button>
      <p v-if="errorMessage" class="error m-0 text-sm" role="alert">{{ errorMessage }}</p>

      <details class="text-sm">
        <summary class="summary">Link opened in another app? Paste it here</summary>
        <form class="mt-2 flex flex-col gap-2" @submit.prevent="usePastedLink">
          <ion-input
            :value="pastedLink"
            label="Sign-in link"
            label-placement="stacked"
            fill="outline"
            type="url"
            inputmode="url"
            autocomplete="off"
            data-testid="paste-link-input"
            @ion-input="pastedLink = String($event.detail.value ?? '')"
          />
          <ion-button type="submit" expand="block" fill="outline" class="tap" :disabled="pasteBusy || !pastedLink">
            <ion-spinner v-if="pasteBusy" slot="start" name="crescent" />
            Sign in with this link
          </ion-button>
          <p v-if="pasteError" class="error m-0" role="alert">{{ pasteError }}</p>
        </form>
      </details>
    </section>
  </div>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.error {
  color: var(--ion-color-danger);
}
.inbox {
  background: var(--ion-color-step-50, rgba(127, 127, 127, 0.08));
}
.summary {
  cursor: pointer;
  padding: 12px 0;
  color: var(--ion-color-primary);
}
</style>
