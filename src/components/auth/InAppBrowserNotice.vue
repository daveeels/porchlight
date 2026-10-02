<script setup lang="ts">
// SPEC F4: shown on /sign-in inside Facebook, Instagram, Messenger, etc.,
// where Google refuses to sign in. The email form comes first on that page;
// this is the collapsed "Prefer Google?" way out to the real browser:
// Android → "Open in Chrome" (intent:// URL); iPhone → "Open in Safari"
// (x-safari-https://, iOS 17+) plus a 2-step picture guide that always works.
// The default slot (the page's Google button) goes at the end.
import { computed, ref } from 'vue'
import { IonButton } from '@ionic/vue'
import { openInChromeUrl, openInSafariUrl, type InAppBrowser, type PageLocation } from '@/lib/inAppBrowser'

const props = defineProps<{
  browser: InAppBrowser
  /** The page to reopen in the browser (defaults to this page). */
  location?: PageLocation & { href: string }
}>()

const loc = computed(() => props.location ?? window.location)
const chromeUrl = computed(() => openInChromeUrl(loc.value))
const safariUrl = computed(() => openInSafariUrl(loc.value))
const appName = computed(() => props.browser.app ?? 'this app')
const browserName = computed(() =>
  props.browser.os === 'android' ? 'Chrome' : props.browser.os === 'ios' ? 'Safari' : 'your browser',
)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(loc.value.href)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }
}
</script>

<template>
  <details class="notice rounded-xl" data-testid="in-app-notice">
    <summary class="summary px-4 text-sm font-semibold">Prefer Google? Open Porchlight in {{ browserName }}</summary>
    <div class="flex flex-col gap-3 px-4 pb-4">
      <p class="m-0 text-sm">
        Google sign-in doesn't work inside {{ appName }}. Open Porchlight in {{ browserName }}, then tap Continue
        with Google there.
      </p>

      <ion-button v-if="browser.os === 'android'" :href="chromeUrl" expand="block" class="tap">
        Open in Chrome
      </ion-button>

      <template v-else>
        <ion-button v-if="browser.os === 'ios'" :href="safariUrl" expand="block" class="tap">
          Open in Safari
        </ion-button>
        <p class="m-0 text-sm font-medium">{{ browser.os === 'ios' ? "If that doesn't work:" : 'How to open it:' }}</p>
        <ol class="steps m-0 grid list-none grid-cols-2 gap-3 p-0" aria-label="How to open Porchlight in your browser">
          <li class="flex flex-col items-center gap-2 text-center text-sm">
            <!-- Step 1: the app's menu button -->
            <svg viewBox="0 0 120 80" class="picture" role="img" aria-label="The menu button, three dots, at the top right">
              <rect x="2" y="2" width="116" height="76" rx="10" class="frame" />
              <rect x="2" y="2" width="116" height="20" rx="10" class="bar" />
              <rect x="12" y="34" width="64" height="6" rx="3" class="line" />
              <rect x="12" y="46" width="48" height="6" rx="3" class="line" />
              <circle cx="100" cy="12" r="9" class="ring" />
              <circle cx="95" cy="12" r="1.8" class="dot" />
              <circle cx="100" cy="12" r="1.8" class="dot" />
              <circle cx="105" cy="12" r="1.8" class="dot" />
            </svg>
            <span><strong>1.</strong> Tap <strong>⋯</strong> (top or bottom of the screen)</span>
          </li>
          <li class="flex flex-col items-center gap-2 text-center text-sm">
            <!-- Step 2: the menu item -->
            <svg viewBox="0 0 120 80" class="picture" role="img" aria-label="The Open in browser menu item">
              <rect x="2" y="2" width="116" height="76" rx="10" class="frame" />
              <rect x="10" y="12" width="100" height="16" rx="4" class="line" />
              <rect x="10" y="32" width="100" height="16" rx="4" class="ring-fill" />
              <text x="60" y="43.5" text-anchor="middle" class="label">Open in browser ↗</text>
              <rect x="10" y="52" width="100" height="16" rx="4" class="line" />
            </svg>
            <span><strong>2.</strong> Tap <strong>Open in browser</strong> (it may say "Open in external browser")</span>
          </li>
        </ol>
      </template>

      <ion-button fill="clear" size="small" class="tap" @click="copyLink">
        {{ copyState === 'copied' ? 'Link copied — paste it in your browser' : 'Copy link' }}
      </ion-button>
      <p v-if="copyState === 'failed'" class="m-0 text-sm break-all">
        Copy this link into your browser: <span class="select-all">{{ loc.href }}</span>
      </p>

      <slot />
    </div>
  </details>
</template>

<style scoped>
.notice {
  background: rgba(var(--ion-color-warning-rgb, 255, 196, 9), 0.14);
  border: 1px solid rgba(var(--ion-color-warning-rgb, 255, 196, 9), 0.5);
}
.tap {
  min-height: 44px;
}
.summary {
  cursor: pointer;
  min-height: 44px;
  display: list-item; /* keeps the disclosure triangle */
  padding-top: 12px;
  padding-bottom: 12px;
  color: var(--ion-color-primary);
  font-weight: 800;
}
.picture {
  width: 100%;
  max-width: 140px;
  height: auto;
}
.frame {
  fill: var(--ion-background-color, #fff);
  stroke: currentColor;
  stroke-opacity: 0.35;
  stroke-width: 2;
}
.bar {
  fill: currentColor;
  fill-opacity: 0.1;
}
.line {
  fill: currentColor;
  fill-opacity: 0.15;
}
.ring {
  fill: none;
  stroke: var(--ion-color-primary);
  stroke-width: 2.5;
}
.dot {
  fill: currentColor;
}
.ring-fill {
  fill: var(--ion-color-primary);
}
.label {
  fill: var(--ion-color-primary-contrast, #fff);
  font-size: 9px;
  font-weight: 600;
}
</style>
