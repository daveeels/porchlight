<script setup lang="ts">
// SPEC F3. Bottom sheet driven by usePinsStore().selectedPinId (set from ?pin=).
// Votes and reports live in VoteBar / ReportButton (F7/F8), never on your own pin.
// Opened from inside the app it has its own history entry (useExploreHistory),
// so Back closes it; closing it any other way pops that entry too.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonButton, IonContent, IonIcon, IonModal, IonNote } from '@ionic/vue'
import { alertCircleOutline, mapOutline, navigateOutline, shareSocialOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import { useExploreHistory } from '@/composables/useExploreHistory'
import { showOnMapPath } from '@/lib/exploreHistory'
import { googleMapsUrl, openInMaps } from '@/lib/mapsLink'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { usePinsStore } from '@/stores/pins'
import { isComingSoon, type Pin } from '@/types/models'
import ComingSoonArt from './ComingSoonArt.vue'
import VerifiedBadge from './VerifiedBadge.vue'
import ReportButton from './ReportButton.vue'
import VoteBar from './VoteBar.vue'
import { hereCountLong, mapAction, notThereCountLong, pinShareUrl, placeLine } from './format'
import { showToast } from './toast'

const props = defineProps<{
  /** The page is covered by another route: hide the sheet but keep ?pin. */
  suspended?: boolean
}>()

const emit = defineEmits<{ showOnMap: [pin: Pin] }>()

const pins = usePinsStore()
const auth = useAuthStore()
const appConfig = useAppConfigStore()
const route = useRoute()
const router = useRouter()
const nav = useExploreHistory()

const isOpen = computed(() => !!pins.selectedPinId && !props.suspended)
const isOwn = computed(() => !!auth.uid && pins.selectedPin?.ownerId === auth.uid)
/** fetchPin can return the owner's own non-ACTIVE pin; others never see those. */
const pin = computed(() => {
  const p = pins.selectedPin
  if (!p) return null
  return p.status === 'ACTIVE' || isOwn.value ? p : null
})
const soon = computed(() => !!pin.value && isComingSoon(pin.value))

const notFound = computed(
  () => pins.selectedPinNotFound || (!!pins.selectedPin && !pin.value && !pins.selectedPinLoading),
)

/** Plain web link for long-press / copy; a tap goes through openInMaps (native Maps app where it helps). */
const mapsWebUrl = computed(() => (pin.value ? googleMapsUrl(pin.value.geo.latitude, pin.value.geo.longitude) : undefined))

/** Clears the selection and removes the card's history entry (or ?pin). */
function close(): void {
  void nav.closePin()
}

/** Only a dismissal by the user clears the selection (not a suspend). */
function onDidDismiss(): void {
  if (props.suspended || route.name !== 'explore') return
  if (!pins.selectedPinId) return
  close()
}

/** A vote/report hid the pin (or it's under review): it's gone for everyone. */
function onGone(): void {
  close()
}

/** openInMaps picks geo: / maps:// (with a web fallback) in in-app browsers, Apple Maps on iPhone (SPEC F4). */
function openMaps(e: Event): void {
  const p = pin.value
  if (!p) return
  e.preventDefault()
  openInMaps(p.geo.latitude, p.geo.longitude)
}

/** "Show on map" (SPEC F3): signed in → the map at this pin; signed out → sign in first; map OFF → hidden. */
const mapLink = computed(() =>
  auth.ready ? mapAction(appConfig.mapAllowed(auth.isSignedIn), auth.isSignedIn, appConfig.mapAllowed(true)) : null,
)

function showOnMap(): void {
  const p = pin.value
  if (!p) return
  if (mapLink.value === 'show') emit('showOnMap', p)
  // Back from sign-in returns to this card; signing in lands on the map at it.
  else void router.push({ path: '/sign-in', query: { redirect: showOnMapPath(p.id) } })
}

function retry(): void {
  const id = pins.selectedPinId
  if (id) void pins.selectPin(id)
}

async function share(): Promise<void> {
  const p = pin.value
  if (!p) return
  const url = pinShareUrl(p.id)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: p.title, text: `${p.title} on Porchlight`, url })
      return
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    await showToast('Link copied')
  } catch {
    await showToast(url)
  }
}
</script>

<template>
  <ion-modal
    :is-open="isOpen"
    :breakpoints="[0, 0.75, 0.95]"
    :initial-breakpoint="0.75"
    :handle="true"
    aria-label="Display details"
    @did-dismiss="onDidDismiss"
  >
    <ion-content>
      <div v-if="pins.selectedPinLoading || notFound || pins.selectedPinError || !pin" class="ion-padding">
        <StateMessage v-if="pins.selectedPinLoading" loading title="Loading display…" />

        <StateMessage
          v-else-if="notFound"
          :icon="alertCircleOutline"
          title="This display isn't available"
          message="It may have been removed or hidden."
        />

        <StateMessage
          v-else-if="pins.selectedPinError"
          :icon="alertCircleOutline"
          title="Couldn't load this display"
          error
          message="Check your connection and try again."
        >
          <ion-button @click="retry">Try again</ion-button>
        </StateMessage>
      </div>

      <!-- A short photo hero, then the panel. Voting sits right under the
           title so it's on screen at the sheet's first (40%) height; the
           description, Maps, Share and Report follow. -->
      <article v-else class="pb-6">
        <img v-if="pin.photoUrl" :src="pin.photoUrl" :alt="`Photo of ${pin.title}`" class="hero block w-full object-cover" />
        <div v-else class="hero"><ComingSoonArt label /></div>

        <div class="panel flex flex-col gap-3">
          <header class="flex flex-col items-start gap-1" data-testid="pin-counts">
            <VerifiedBadge :verified="pin.verified" :coming-soon="soon" class="mb-1" />
            <h2 class="title pl-display m-0">{{ pin.title }}</h2>
            <p class="pl-muted m-0 text-sm font-bold">{{ placeLine(pin) }}</p>
            <!-- One text run with a no-break space before the dot, so a wrap at
                 phone width never starts a line with "·". -->
            <p v-if="soon" class="pl-muted m-0 text-sm font-bold" data-testid="coming-soon-note">
              Decorations aren't up yet. Voting opens when they are.
            </p>
            <p v-else class="pl-muted m-0 text-sm font-bold">
              {{ hereCountLong(pin.hereVotes)
              }}<span v-if="pin.notThereVotes > 0">&nbsp;· {{ notThereCountLong(pin.notThereVotes) }}</span>
            </p>
          </header>

          <p v-if="isOwn" class="own m-0 rounded-xl p-3 text-sm font-bold" role="note" data-testid="own-pin-note">
            {{ pin.status === 'ACTIVE' ? 'This is your display.' : "This is your display. It isn't currently shown to other people." }}
          </p>
          <VoteBar v-else-if="!soon" :pin="pin" :report="false" @gone="onGone" />

          <p v-if="pin.description" class="m-0 whitespace-pre-line">{{ pin.description }}</p>

          <div class="links flex flex-wrap items-center gap-x-2">
            <ion-button :href="mapsWebUrl" target="_blank" rel="noopener" fill="clear" class="link-btn" @click="openMaps">
              <ion-icon slot="start" :icon="navigateOutline" aria-hidden="true" />
              Open in Maps
            </ion-button>
            <ion-button v-if="mapLink" fill="clear" class="link-btn" data-testid="show-on-map" @click="showOnMap">
              <ion-icon slot="start" :icon="mapOutline" aria-hidden="true" />
              {{ mapLink === 'show' ? 'Show on map' : 'Sign in to see it on the map' }}
            </ion-button>
            <ion-button fill="clear" class="link-btn" @click="share">
              <ion-icon slot="start" :icon="shareSocialOutline" aria-hidden="true" />
              Share
            </ion-button>
          </div>
          <ion-note class="pl-muted text-xs">Location is approximate — shown about 10–15 m from the house.</ion-note>

          <ReportButton v-if="!isOwn" :pin="pin" @gone="onGone" />
        </div>
      </article>
    </ion-content>
  </ion-modal>
</template>

<style scoped>
.hero {
  /* A little taller than the old 150 px so more of the house shows, scaling
     with the screen (~175 px on an iPhone SE, 210 px on big phones) while the
     vote buttons stay visible at the sheet's first height. */
  height: clamp(170px, 26vh, 210px);
  object-position: center;
  background: var(--pl-surface);
}
.panel {
  position: relative;
  margin-top: -22px;
  padding: 14px 16px 0;
  border-radius: 22px 22px 0 0;
  background: var(--ion-background-color);
}
.title {
  font-size: 1.75rem;
  line-height: 1.05;
  overflow-wrap: anywhere;
}
.own {
  background: var(--pl-surface);
}
.link-btn {
  --color: var(--ion-color-primary);
  --padding-start: 4px;
  --padding-end: 8px;
  min-height: 44px;
  margin: 0 0 0 -4px;
  font-weight: 800;
}
</style>
