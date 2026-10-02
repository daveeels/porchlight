<script setup lang="ts">
// The community rules (SPEC §5 users, §6 TERMS_REQUIRED), mounted once in
// App.vue and driven by useTermsStore. "agree" mode: a required checkbox and
// "I agree" (→ acceptTerms) or "Not now". "view" mode: the same rules, read
// only, with the date the user agreed. A full-screen modal on phones (not a
// bottom sheet), a centred card on wider screens.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { COMMUNITY_RULES, FULL_TERMS_PATH, RULES_CHECKBOX_LABEL, RULES_TITLE } from '@/config/terms'
import { useAuthStore } from '@/stores/auth'
import { useTermsStore } from '@/stores/terms'

const terms = useTermsStore()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const ticked = ref(false)
const agreeMode = computed(() => terms.mode === 'agree')
/**
 * The modal is only in the DOM from opening until its dismiss animation ends,
 * so it never sits hidden next to the pin sheet's modal.
 */
const present = ref(terms.isOpen)

// Every opening starts unticked.
watch(
  () => terms.isOpen,
  (open) => {
    if (open) {
      ticked.value = false
      present.value = true
    }
  },
)

function onDidDismiss(): void {
  terms.dismissed()
  // Unmount on a later task: IonModal itself re-renders (drops its content)
  // on didDismiss, and unmounting it in the same flush breaks Vue's patch.
  setTimeout(() => {
    if (!terms.isOpen) present.value = false
  }, 0)
}

const agreedOn = computed(() => {
  const at = terms.acceptedAt
  if (!at) return null
  return at.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
})

async function agree(): Promise<void> {
  if (!ticked.value) return
  await terms.agree()
}

function close(): void {
  terms.dismissed()
}

function fullTerms(): void {
  terms.dismissed()
  const [path, hash] = FULL_TERMS_PATH.split('#')
  if (route.path === path && hash) {
    document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    return
  }
  void router.push({ path, hash: hash ? `#${hash}` : undefined })
}
</script>

<template>
  <ion-modal
    v-if="present"
    :is-open="terms.isOpen"
    class="terms-modal"
    aria-labelledby="rules-title"
    @did-dismiss="onDidDismiss"
  >
    <ion-header>
      <ion-toolbar>
        <ion-title>Community rules</ion-title>
        <ion-buttons slot="end">
          <ion-button class="tap" color="primary" data-testid="terms-close" @click="close">{{ agreeMode ? 'Not now' : 'Close' }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="mx-auto flex max-w-lg flex-col gap-3 pb-4" data-testid="terms-modal" :data-mode="terms.mode">
        <span class="pl-sticker self-start" style="--pl-tilt: -3deg">House rules</span>
        <h2 id="rules-title" class="pl-display m-0 text-3xl leading-tight">{{ RULES_TITLE }}</h2>
        <p class="m-0 pl-muted">Porchlight works because people play fair. The short version:</p>

        <ol class="rules m-0 flex flex-col gap-2 p-0" data-testid="rules-list">
          <li v-for="(rule, i) in COMMUNITY_RULES" :key="i" class="rule flex gap-3 rounded-xl p-3">
            <span class="num pl-display" aria-hidden="true">{{ i + 1 }}</span>
            <span class="flex-1">{{ rule }}</span>
          </li>
        </ol>

        <a :href="FULL_TERMS_PATH" class="pl-link self-start py-3" @click.prevent="fullTerms">Full terms and privacy policy</a>
      </div>
    </ion-content>

    <ion-footer class="footer">
      <div class="mx-auto flex max-w-lg flex-col gap-2 px-4 pt-3 pb-safe">
        <template v-if="agreeMode">
          <ion-checkbox
            :checked="ticked"
            label-placement="end"
            justify="start"
            class="check"
            data-testid="terms-checkbox"
            @ion-change="ticked = $event.detail.checked"
          >
            <span class="ion-text-wrap font-bold">{{ RULES_CHECKBOX_LABEL }}</span>
          </ion-checkbox>
          <p v-if="terms.saveError" class="error m-0 text-sm" role="alert">{{ terms.saveError }}</p>
          <ion-button
            expand="block"
            class="tap m-0"
            :disabled="!ticked || terms.saving"
            data-testid="terms-agree"
            @click="agree"
          >
            <ion-spinner v-if="terms.saving" slot="start" name="crescent" />
            I agree
          </ion-button>
        </template>
        <template v-else>
          <p class="m-0 text-sm font-bold" role="status" data-testid="terms-agreed-on">
            <template v-if="terms.accepted && agreedOn">You agreed on {{ agreedOn }}.</template>
            <template v-else-if="terms.accepted">You've agreed to these rules.</template>
            <template v-else-if="!auth.isSignedIn">You'll be asked to agree before you first post or vote.</template>
          </p>
          <ion-button expand="block" fill="outline" class="tap m-0" @click="close">Close</ion-button>
        </template>
      </div>
    </ion-footer>
  </ion-modal>
</template>

<style scoped>
/* Full screen on phones (Ionic's default); a centred card on wider screens. */
@media (min-width: 768px) {
  .terms-modal {
    --width: 560px;
    --height: min(760px, 92vh);
  }
}
.tap {
  min-height: 48px;
}
.rules {
  list-style: none;
}
.rule {
  background: var(--pl-surface);
  border: 1px solid var(--pl-line);
  line-height: 1.45;
}
.num {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ion-color-primary);
  color: var(--pl-on-primary);
  font-size: 1rem;
  box-shadow: 0 2px 0 var(--pl-shadow);
}
.footer {
  background: var(--pl-bg, var(--ion-background-color));
  border-top: 1px solid var(--pl-line);
}
.pb-safe {
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
.check {
  min-height: 44px;
  white-space: normal;
}
.check::part(label) {
  white-space: normal;
}
.error {
  color: var(--ion-color-danger);
}
</style>
