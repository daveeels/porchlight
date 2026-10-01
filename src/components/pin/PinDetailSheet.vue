<script setup lang="ts">
// SPEC F3. Bottom sheet driven by usePinsStore().selectedPinId (set from ?pin=).
// Votes and reports live in VoteBar / ReportButton (F7/F8), never on your own pin.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonButton, IonContent, IonIcon, IonModal, IonNote } from '@ionic/vue'
import { alertCircleOutline, navigateOutline, shareSocialOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import { googleMapsUrl, openInMaps } from '@/lib/mapsLink'
import { useAuthStore } from '@/stores/auth'
import { usePinsStore } from '@/stores/pins'
import VerifiedBadge from './VerifiedBadge.vue'
import ReportButton from './ReportButton.vue'
import VoteBar from './VoteBar.vue'
import { hereCountLong, notThereCountLong, pinShareUrl, placeLine } from './format'
import { showToast } from './toast'

const props = defineProps<{
  /** The page is covered by another route: hide the sheet but keep ?pin. */
  suspended?: boolean
}>()

const pins = usePinsStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const isOpen = computed(() => !!pins.selectedPinId && !props.suspended)
const isOwn = computed(() => !!auth.uid && pins.selectedPin?.ownerId === auth.uid)
/** fetchPin can return the owner's own non-ACTIVE pin; others never see those. */
const pin = computed(() => {
  const p = pins.selectedPin
  if (!p) return null
  return p.status === 'ACTIVE' || isOwn.value ? p : null
})
const notFound = computed(
  () => pins.selectedPinNotFound || (!!pins.selectedPin && !pin.value && !pins.selectedPinLoading),
)

/** Plain web link for long-press / copy; a tap goes through openInMaps (native Maps app where it helps). */
const mapsWebUrl = computed(() => (pin.value ? googleMapsUrl(pin.value.geo.latitude, pin.value.geo.longitude) : undefined))

/** Clears the selection and drops ?pin from the URL. */
function close(): void {
  void pins.selectPin(null)
  if (route.name === 'explore' && route.query.pin !== undefined) {
    const { pin: _pin, ...query } = route.query
    void router.replace({ query })
  }
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
    :breakpoints="[0, 0.4, 0.9]"
    :initial-breakpoint="0.4"
    :handle="true"
    aria-label="Display details"
    @did-dismiss="onDidDismiss"
  >
    <ion-content class="ion-padding">
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

      <!-- Voting sits right under the title so it's on screen at the sheet's
           first (40%) height; the photo, Maps, Share and Report follow. -->
      <article v-else-if="pin" class="flex flex-col gap-3 pb-6">
        <header>
          <h2 class="m-0 text-xl font-bold">{{ pin.title }}</h2>
          <p class="mt-1 mb-0 text-sm opacity-80">{{ placeLine(pin) }}</p>
        </header>

        <div class="flex flex-wrap items-center gap-2" data-testid="pin-counts">
          <VerifiedBadge :verified="pin.verified" />
          <!-- One text run with a no-break space before the dot, so a wrap at
               phone width never starts a line with "·". -->
          <span class="text-sm">
            {{ hereCountLong(pin.hereVotes)
            }}<span v-if="pin.notThereVotes > 0" class="opacity-70">&nbsp;· {{ notThereCountLong(pin.notThereVotes) }}</span>
          </span>
        </div>

        <p v-if="isOwn" class="m-0 text-sm opacity-80" role="note" data-testid="own-pin-note">
          {{ pin.status === 'ACTIVE' ? 'This is your display.' : "This is your display. It isn't currently shown to other people." }}
        </p>
        <VoteBar v-else :pin="pin" :report="false" @gone="onGone" />

        <img
          :src="pin.photoUrl"
          :alt="`Photo of ${pin.title}`"
          class="photo w-full rounded-lg object-cover"
          loading="lazy"
        />

        <p v-if="pin.description" class="m-0 whitespace-pre-line">{{ pin.description }}</p>

        <div class="grid grid-cols-2 gap-2">
          <ion-button :href="mapsWebUrl" target="_blank" rel="noopener" class="tap" @click="openMaps">
            <ion-icon slot="start" :icon="navigateOutline" aria-hidden="true" />
            Open in Maps
          </ion-button>
          <ion-button fill="outline" class="tap" @click="share">
            <ion-icon slot="start" :icon="shareSocialOutline" aria-hidden="true" />
            Share
          </ion-button>
        </div>
        <ion-note class="text-xs">Location is approximate — shown about 25–50 m from the house.</ion-note>

        <ReportButton v-if="!isOwn" :pin="pin" @gone="onGone" />
      </article>
    </ion-content>
  </ion-modal>
</template>

<style scoped>
.photo {
  aspect-ratio: 4 / 3;
  background: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.08);
}
.tap {
  min-height: 44px;
  margin: 0;
}
</style>
