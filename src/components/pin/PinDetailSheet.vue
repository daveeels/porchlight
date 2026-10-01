<script setup lang="ts">
// SPEC F3. Bottom sheet driven by usePinsStore().selectedPinId (set from ?pin=).
// Voting/reporting are Phase 3: the buttons are placeholders for now.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonButton,
  IonContent,
  IonIcon,
  IonModal,
  IonNote,
  toastController,
} from '@ionic/vue'
import {
  alertCircleOutline,
  checkmarkOutline,
  closeOutline,
  flagOutline,
  navigateOutline,
  shareSocialOutline,
} from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import { useAuthStore } from '@/stores/auth'
import { usePinsStore } from '@/stores/pins'
import VerifiedBadge from './VerifiedBadge.vue'
import { hereCountLong, mapsUrl, notThereCountLong, pinShareUrl, placeLine } from './format'

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

async function toast(message: string): Promise<void> {
  const t = await toastController.create({ message, duration: 2500, position: 'bottom' })
  await t.present()
}

/** Only a dismissal by the user clears the selection (not a suspend). */
function onDidDismiss(): void {
  if (props.suspended || route.name !== 'explore') return
  if (!pins.selectedPinId) return
  void pins.selectPin(null)
  if (route.query.pin !== undefined) {
    const { pin: _pin, ...query } = route.query
    void router.replace({ query })
  }
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
    await toast('Link copied')
  } catch {
    await toast(url)
  }
}

/** Anonymous users see write actions as prompts to sign in (CLAUDE.md UI conventions). */
function writeAction(): void {
  if (!auth.isSignedIn) {
    void router.push('/sign-in')
    return
  }
  void toast('Voting opens soon')
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

      <article v-else-if="pin" class="flex flex-col gap-3 pb-6">
        <header>
          <h2 class="m-0 text-xl font-bold">{{ pin.title }}</h2>
          <p class="mt-1 mb-0 text-sm opacity-80">{{ placeLine(pin) }}</p>
        </header>

        <div class="flex flex-wrap items-center gap-2">
          <VerifiedBadge :verified="pin.verified" />
          <!-- One text run with a no-break space before the dot, so a wrap at
               phone width never starts a line with "·". -->
          <span class="text-sm">
            {{ hereCountLong(pin.hereVotes)
            }}<span v-if="pin.notThereVotes > 0" class="opacity-70">&nbsp;· {{ notThereCountLong(pin.notThereVotes) }}</span>
          </span>
        </div>

        <p v-if="isOwn && pin.status !== 'ACTIVE'" class="m-0 text-sm" role="note">
          This is your display. It isn't currently shown to other people.
        </p>

        <img
          :src="pin.photoUrl"
          :alt="`Photo of ${pin.title}`"
          class="photo w-full rounded-lg object-cover"
          loading="lazy"
        />

        <p v-if="pin.description" class="m-0 whitespace-pre-line">{{ pin.description }}</p>

        <div class="grid grid-cols-2 gap-2">
          <ion-button :href="mapsUrl(pin)" target="_blank" rel="noopener" class="tap">
            <ion-icon slot="start" :icon="navigateOutline" aria-hidden="true" />
            Open in Maps
          </ion-button>
          <ion-button fill="outline" class="tap" @click="share">
            <ion-icon slot="start" :icon="shareSocialOutline" aria-hidden="true" />
            Share
          </ion-button>
        </div>
        <ion-note class="text-xs">Location is approximate — shown about 25–50 m from the house.</ion-note>

        <p v-if="isOwn" class="m-0 text-sm opacity-80">This is your display.</p>
        <template v-else>
          <div class="grid grid-cols-2 gap-2">
            <ion-button color="primary" fill="solid" class="tap" @click="writeAction">
              <ion-icon slot="start" :icon="checkmarkOutline" aria-hidden="true" />
              It's here
            </ion-button>
            <ion-button color="medium" fill="outline" class="tap" @click="writeAction">
              <ion-icon slot="start" :icon="closeOutline" aria-hidden="true" />
              Not there
            </ion-button>
          </div>
          <p v-if="!auth.isSignedIn" class="m-0 text-center text-sm opacity-80">Sign in to vote.</p>
          <ion-button fill="clear" color="medium" size="small" class="tap self-center" @click="writeAction">
            <ion-icon slot="start" :icon="flagOutline" aria-hidden="true" />
            Report
          </ion-button>
        </template>
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
