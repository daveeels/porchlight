<script setup lang="ts">
// First-run welcome (SPEC F14), "storybook cards": one full-screen modal,
// mounted once in App.vue and driven by useWelcomeStore. Each card has a big
// picture (decorative: the text carries the meaning), a heading, one line of
// text, progress dots and a big button; Skip is always top right. Swiping
// left/right also moves between cards. No slide animation with reduced motion.
import { computed, onBeforeUnmount, ref, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { IonButton, IonModal } from '@ionic/vue'
import { SEASON_THEMES } from '@/config/seasons'
import { welcomeCard, type WelcomeStep } from '@/config/welcome'
import { openBackEntry, type BackEntry } from '@/lib/backStack'
import { useAppConfigStore } from '@/stores/appConfig'
import { usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'
import { useTermsStore } from '@/stores/terms'
import { useWelcomeStore } from '@/stores/welcome'
import AddArt from './art/AddArt.vue'
import MapArt from './art/MapArt.vue'
import PorchArt from './art/PorchArt.vue'
import VotesArt from './art/VotesArt.vue'

const ART: Record<WelcomeStep, Component> = { find: PorchArt, search: MapArt, vote: VotesArt, add: AddArt }

const welcome = useWelcomeStore()
const season = useSeasonStore()
const appConfig = useAppConfigStore()
const pins = usePinsStore()
const terms = useTermsStore()
const route = useRoute()

// main.ts mounts after the first navigation, so this is the landing route:
// deep links to /sign-in, /auth/complete, /submit, /about… don't get cards 1–3.
welcome.setLanding(route.name === 'explore')

const reducedMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
})()

const seasonLabel = computed(() => SEASON_THEMES[season.season ?? 'HALLOWEEN'].label)
const card = computed(() => (welcome.step ? welcomeCard(welcome.step, seasonLabel.value) : null))

// ---- When cards 1–3 show: Explore has loaded, nothing else is on top -------

const exploreSettled = computed(
  () =>
    route.name === 'explore' &&
    season.ready &&
    !season.offSeason &&
    !!season.eventId &&
    !appConfig.error &&
    !pins.loading &&
    !pins.selectedPinId &&
    !terms.isOpen,
)
let offerTimer: ReturnType<typeof setTimeout> | null = null
watch(
  exploreSettled,
  (settled) => {
    if (offerTimer) clearTimeout(offerTimer)
    offerTimer = null
    if (!settled) return
    // A beat after the results appear, so the page is visibly there behind it.
    offerTimer = setTimeout(() => {
      offerTimer = null
      if (exploreSettled.value) welcome.offerFirstVisit()
    }, 600)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (offerTimer) clearTimeout(offerTimer)
})

// A sign-in's rules ask waits for these cards; if they can't show soon, the
// rules (a must for members) open now instead.
watch(
  () => route.name !== 'explore' || season.offSeason || !!appConfig.error,
  (blocked) => {
    if (blocked) welcome.releaseHeldRules()
  },
  { immediate: true },
)

// ---- Modal lifecycle (as TermsModal: only in the DOM while open) -----------

const present = ref(welcome.isOpen)
watch(
  () => welcome.isOpen,
  (open) => {
    if (open) present.value = true
  },
)

// Back = Skip (SPEC F14): the open cards own one history entry, so the
// phone's Back closes them instead of leaving Porchlight.
let backEntry: BackEntry | null = null

function onDidPresent(): void {
  focusHeading()
  backEntry ??= openBackEntry(() => {
    backEntry = null
    welcome.finish()
  })
}

function onDidDismiss(): void {
  // Dropped before closed(): the rules may open next and add their own entry.
  void backEntry?.close()
  backEntry = null
  welcome.closed()
  // Unmount on a later task: IonModal re-renders on didDismiss itself.
  setTimeout(() => {
    if (!welcome.isOpen) present.value = false
  }, 0)
}

const heading = ref<HTMLElement | null>(null)

function focusHeading(): void {
  heading.value?.focus({ preventScroll: true })
}

// ---- Navigation ------------------------------------------------------------

const direction = ref<'next' | 'back'>('next')
const transitionName = computed(() => (reducedMotion ? '' : `welcome-${direction.value}`))

function next(): void {
  direction.value = 'next'
  welcome.next()
}

function back(): void {
  direction.value = 'back'
  welcome.back()
}

let touchStart: { x: number; y: number } | null = null

function onTouchStart(e: TouchEvent): void {
  const t = e.touches[0]
  touchStart = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null
}

function onTouchEnd(e: TouchEvent): void {
  const t = e.changedTouches[0]
  const from = touchStart
  touchStart = null
  if (!from || !t) return
  const dx = t.clientX - from.x
  const dy = t.clientY - from.y
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  if (dx < 0 && !welcome.isLast) next()
  else if (dx > 0) back()
}
</script>

<template>
  <ion-modal
    v-if="present"
    :is-open="welcome.isOpen"
    :animated="!reducedMotion"
    class="welcome-modal"
    aria-labelledby="welcome-title"
    @did-present="onDidPresent"
    @did-dismiss="onDidDismiss"
  >
    <div
      class="ion-page welcome"
      data-testid="welcome"
      :data-step="welcome.step"
      :data-run="welcome.run"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div class="top">
        <button type="button" class="pl-reset skip" data-testid="welcome-skip" @click="welcome.finish()">Skip</button>
      </div>

      <!-- The new card's heading takes focus once it's in (also with no animation). -->
      <Transition :name="transitionName" mode="out-in" @after-enter="focusHeading">
        <div v-if="card" :key="card.step" class="card">
          <div class="art" aria-hidden="true">
            <component :is="ART[card.step]" />
            <span v-if="card.step === 'search'" class="pl-sticker sticker" style="left: 14px; bottom: 14px">✓ 15</span>
            <span
              v-else-if="card.step === 'add'"
              class="pl-sticker pl-sticker--cream sticker"
              style="right: 14px; top: 14px; --pl-tilt: -4deg"
              >NEW</span
            >
          </div>
          <div class="body">
            <h2 id="welcome-title" ref="heading" tabindex="-1" class="title pl-display">{{ card.title }}</h2>
            <p class="text" data-testid="welcome-text">{{ card.text }}</p>
          </div>
        </div>
      </Transition>

      <div class="foot">
        <div
          class="dots"
          role="img"
          :aria-label="`Step ${welcome.index + 1} of ${welcome.steps.length}`"
          data-testid="welcome-dots"
        >
          <i v-for="(s, i) in welcome.steps" :key="s" :class="{ on: i === welcome.index }" />
        </div>
        <ion-button expand="block" class="go m-0" data-testid="welcome-next" @click="next">
          {{ welcome.buttonLabel }}
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<style scoped>
/* Full screen on phones (Ionic's default); a centred card on wider screens. */
@media (min-width: 768px) {
  .welcome-modal {
    --width: 440px;
    --height: min(780px, 92vh);
  }
}
.welcome {
  justify-content: flex-start;
  background: var(--pl-bg, var(--ion-background-color));
  color: var(--ion-text-color);
  padding-top: env(safe-area-inset-top, 0px);
  touch-action: pan-y;
}
.top {
  display: flex;
  flex: none;
  justify-content: flex-end;
  padding: 2px 8px 0;
}
.skip {
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--pl-muted);
  font-weight: 800;
  font-size: 0.9375rem;
  cursor: pointer;
}
@media (any-hover: hover) {
  .skip:hover {
    color: var(--ion-text-color);
  }
}
/* The card takes the space between Skip and the button; on short phones the
   picture shrinks first, so the button always stays on screen. */
.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.art {
  position: relative;
  flex: 1 1 340px;
  min-height: 88px;
  /* Tall phones: a taller picture, but never so tall the scene is cropped. */
  max-height: min(480px, calc((100vw - 32px) * 1.25));
  margin: 2px 16px 0;
  border-radius: 22px;
  overflow: hidden;
  background: var(--pl-art-sky);
  box-shadow: 0 3px 0 var(--pl-shadow);
}
.sticker {
  position: absolute;
  font-size: 0.875rem;
  padding: 3px 10px;
  border-radius: 10px;
}
.body {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px 0;
}
.title {
  margin: 0;
  font-size: 1.75rem;
  line-height: 1.05;
  outline: none;
}
.text {
  margin: 0;
  color: var(--pl-muted);
  font-size: 1rem;
  line-height: 1.45;
}
.foot {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 16px 20px calc(20px + env(safe-area-inset-bottom, 0px));
}
.dots {
  display: flex;
  gap: 6px;
}
.dots i {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 99px;
  background: var(--pl-line);
}
.dots i.on {
  width: 20px;
  background: var(--ion-color-primary);
}
.go {
  width: 100%;
  min-height: 52px;
  --border-radius: 16px;
  font-family: var(--pl-font-display);
  font-weight: 400;
  font-size: 1.125rem;
  letter-spacing: 0.01em;
  font-synthesis: none;
}

/* Slide between cards (off with reduced motion: no transition name then). */
@media (prefers-reduced-motion: no-preference) {
  .welcome-next-enter-active,
  .welcome-next-leave-active,
  .welcome-back-enter-active,
  .welcome-back-leave-active {
    transition:
      transform 0.18s ease,
      opacity 0.18s ease;
  }
  .dots i {
    transition: width 0.2s ease;
  }
}
.welcome-next-enter-from,
.welcome-back-leave-to {
  opacity: 0;
  transform: translateX(32px);
}
.welcome-next-leave-to,
.welcome-back-enter-from {
  opacity: 0;
  transform: translateX(-32px);
}
</style>
