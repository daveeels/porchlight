<script setup lang="ts">
// "Add Porchlight to your home screen" card (SPEC F10). Inline (not an
// overlay), so it never covers results, and one compact row so it doesn't
// push them off the first screen; "How?" expands the steps. All show/hide
// rules live in lib/installPrompt: real use first, never once installed,
// 14-day dismissal. Inside an app's browser (Facebook…) installing is
// impossible, so it points to Safari/Chrome first. Counts opened pins from
// `?pin=` on the Explore page.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { IonButton, IonIcon } from '@ionic/vue'
import { addCircleOutline, closeOutline, shareOutline } from 'ionicons/icons'
import { detectInAppBrowser, openInChromeUrl, openInSafariUrl } from '@/lib/inAppBrowser'
import {
  captureInstallPrompt,
  dismissInstallPrompt,
  notePinOpened,
  promptInstall,
  useInstallPrompt,
} from '@/lib/installPrompt'

/** The home-screen icon itself (public/, so a plain URL, not an import). */
const ICON_URL = '/icons/icon-192.png'

const { mode } = useInstallPrompt()
const route = useRoute() as ReturnType<typeof useRoute> | undefined
const expanded = ref(false)

const os = detectInAppBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent).os
const browserName = os === 'android' ? 'Chrome' : 'Safari'
/** This page, opened in the phone's real browser (in-app mode). */
const openInBrowserUrl = computed(() => {
  void route?.fullPath // re-evaluate as the page's query changes
  return os === 'android' ? openInChromeUrl(window.location) : openInSafariUrl(window.location)
})

onMounted(() => captureInstallPrompt())

let lastPin: string | null = null
watch(
  () => route?.query.pin,
  (pin) => {
    if (typeof pin !== 'string' || !pin || pin === lastPin) return
    lastPin = pin
    notePinOpened()
  },
  { immediate: true },
)

function dismiss(): void {
  dismissInstallPrompt()
}

function install(): void {
  // Straight from the tap: Chrome only allows prompt() during user activation.
  void promptInstall()
}
</script>

<template>
  <section
    v-if="mode"
    class="install mx-4 my-2 rounded-xl py-1 pr-1 pl-3"
    aria-labelledby="install-title"
    data-testid="install-prompt"
    :data-mode="mode"
  >
    <div class="flex items-center gap-2">
      <img :src="ICON_URL" alt="" width="32" height="32" class="icon flex-none rounded-lg" />
      <h2 id="install-title" class="m-0 min-w-0 flex-1 text-sm font-extrabold leading-snug">
        Add Porchlight to your home screen
      </h2>
      <ion-button v-if="mode === 'native'" size="small" class="tap m-0" data-testid="install-button" @click="install">
        Install
      </ion-button>
      <ion-button
        v-else
        fill="clear"
        size="small"
        class="tap m-0"
        :aria-expanded="expanded ? 'true' : 'false'"
        aria-controls="install-steps"
        data-testid="install-how"
        @click="expanded = !expanded"
      >
        How?
      </ion-button>
      <ion-button fill="clear" class="close m-0" aria-label="Dismiss" @click="dismiss">
        <ion-icon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
      </ion-button>
    </div>

    <div v-if="expanded && mode === 'ios'" id="install-steps" class="pr-2 pb-2">
      <ol class="steps m-0 mt-1 flex list-none flex-col gap-2 p-0 text-sm" aria-label="How to add it on iPhone">
        <li class="flex items-center gap-2">
          <span class="num flex-none" aria-hidden="true">1</span>
          <span>
            Tap <strong>Share</strong>
            <ion-icon :icon="shareOutline" class="glyph" aria-hidden="true" />
            <span class="pl-muted"> (on newer iPhones, tap ··· first)</span>
          </span>
        </li>
        <li class="flex items-center gap-2">
          <span class="num flex-none" aria-hidden="true">2</span>
          <span>
            Choose <strong>Add to Home Screen</strong>
            <ion-icon :icon="addCircleOutline" class="glyph" aria-hidden="true" />
          </span>
        </li>
      </ol>
      <p class="m-0 mt-2 text-sm pl-muted">It opens full screen like an app, one tap away on the night.</p>
      <div class="mt-2 flex justify-end">
        <ion-button fill="outline" size="small" class="tap m-0" @click="dismiss">Got it</ion-button>
      </div>
    </div>

    <div v-else-if="expanded && mode === 'in-app'" id="install-steps" class="flex flex-col gap-2 pr-2 pb-2">
      <p class="m-0 text-sm">
        You can't add it from inside this app. Open Porchlight in {{ browserName }} first, then add it to your home
        screen from there.
      </p>
      <ion-button :href="openInBrowserUrl" expand="block" class="tap m-0" data-testid="install-open-browser">
        Open in {{ browserName }}
      </ion-button>
      <p class="m-0 text-xs pl-muted">
        Nothing happened? Tap <strong>⋯</strong> at the top or bottom of the screen, then
        <strong>Open in browser</strong>.
      </p>
    </div>
  </section>
</template>

<style scoped>
.install {
  background: var(--pl-surface);
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.45);
  border-radius: 18px;
  box-shadow: 0 3px 0 var(--pl-shadow);
}
.icon {
  width: 32px;
  height: 32px;
}
.tap {
  min-height: 44px;
}
.close {
  min-height: 44px;
  min-width: 44px;
}
.num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 0.8rem;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}
.glyph {
  margin-left: 3px;
  vertical-align: -3px;
  font-size: 1.15em;
  color: var(--ion-color-primary);
}
</style>
