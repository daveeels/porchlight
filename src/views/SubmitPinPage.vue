<script setup lang="ts">
// /submit — Add my display (SPEC F5): location → photo → details → preview →
// submit → success. /submit?edit=1 edits the current pin: photo (optional) →
// details → preview, no location step (location can't change). Auth-guarded.
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  useIonRouter,
} from '@ionic/vue'
import { alertCircleOutline, chevronBack, closeCircleOutline, homeOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import { canEditPin } from '@/components/mypin/status'
import DetailsStep from '@/components/submit/DetailsStep.vue'
import LocationStep from '@/components/submit/LocationStep.vue'
import PhotoStep from '@/components/submit/PhotoStep.vue'
import PreviewStep from '@/components/submit/PreviewStep.vue'
import SubmitError from '@/components/submit/SubmitError.vue'
import { FINAL_SUBMIT_REASONS } from '@/components/submit/validation'
import type { LatLng } from '@/composables/useLocationPicker'
import type { PreparedImage } from '@/lib/image'
import { PIN_WRITE_MESSAGES, PinWriteError, toPinWriteError, type PinWriteReason } from '@/services/pinWrites'
import { SEASON_THEMES } from '@/config/seasons'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { useMyPinStore, type SubmitProgress } from '@/stores/myPin'
import { useSeasonStore } from '@/stores/season'

type Step = 'location' | 'photo' | 'details' | 'preview' | 'success'

const route = useRoute()
const router = useRouter()
const ionRouter = useIonRouter()
const myPin = useMyPinStore()
const season = useSeasonStore()
const appConfig = useAppConfigStore()
const auth = useAuthStore()

const isEdit = computed(() => route.query.edit === '1')
const steps = computed<Step[]>(() =>
  isEdit.value ? ['photo', 'details', 'preview'] : ['location', 'photo', 'details', 'preview'],
)

const step = ref<Step>(steps.value[0] ?? 'location')
const location = ref<LatLng | null>(null)
const photo = shallowRef<PreparedImage | null>(null)
const title = ref('')
const description = ref('')
const consent = ref(false)
const busy = ref(false)
const progress = ref<SubmitProgress | null>(null)
const submitError = shallowRef<PinWriteError | null>(null)
const createdPinId = ref<string | null>(null)
/**
 * The user and mode the form was last reset for (the page instance is reused
 * by Ionic, so on a shared device the next person must not see the last draft).
 */
let preparedFor: string | null = null

function reset(): void {
  step.value = steps.value[0] ?? 'location'
  location.value = null
  photo.value = null
  title.value = ''
  description.value = ''
  consent.value = false
  busy.value = false
  progress.value = null
  submitError.value = null
  createdPinId.value = null
}

async function prepare(force = false): Promise<void> {
  const key = `${auth.uid ?? ''}:${isEdit.value ? 'edit' : 'create'}`
  if (!force && preparedFor === key && step.value !== 'success') {
    void myPin.load()
    return
  }
  preparedFor = key
  reset()
  await myPin.load(true)
  if (isEdit.value && myPin.pin) {
    title.value = myPin.pin.title
    description.value = myPin.pin.description ?? ''
  }
}

onIonViewWillEnter(() => {
  void prepare()
})
watch(isEdit, () => {
  if (route.path === '/submit') void prepare(true)
})

/** Why a new display can't be added right now (checked again on the server). */
const blockedReason = computed<PinWriteReason | null>(() => {
  if (!season.ready) return null
  const ev = season.season ? appConfig.eventFor(season.season) : null
  const now = Date.now()
  // Edits are allowed until the event expires; new displays need submissions open.
  const closed = isEdit.value
    ? !ev || ev.expiresAt.toMillis() <= now
    : !ev || !ev.isActive || ev.submissionsOpenAt.toMillis() > now || ev.expiresAt.toMillis() <= now
  if (closed) return isEdit.value ? 'NOT_EDITABLE' : 'SUBMISSIONS_CLOSED'
  const p = myPin.pin
  if (isEdit.value) {
    if (!myPin.loaded) return null
    if (!p) return 'NOT_FOUND'
    return canEditPin(p) ? null : 'NOT_EDITABLE'
  }
  if (!p || step.value === 'success') return null
  if (p.status === 'ACTIVE' || p.status === 'HIDDEN') return 'ALREADY_EXISTS'
  if (p.status === 'REMOVED' && p.removedBy === 'ADMIN') return 'REMOVED_BY_ADMIN'
  if (p.status === 'REMOVED' && p.hiddenReason === 'REPORTS') return 'UNDER_REVIEW'
  return null
})

const blockedTitle = computed(() => {
  switch (blockedReason.value) {
    case 'ALREADY_EXISTS':
      return 'You already have a display'
    case 'SUBMISSIONS_CLOSED':
      return 'Submissions closed'
    case 'REMOVED_BY_ADMIN':
      return 'Removed by a moderator'
    case 'UNDER_REVIEW':
      return 'Under review'
    default:
      return 'Nothing to edit'
  }
})

const loading = computed(() => !season.ready || (!myPin.loaded && !myPin.error && !!myPin.pinId))

const seasonIcon = computed(() => (season.season ? SEASON_THEMES[season.season].icon : '🏠'))

const pageTitle =computed(() => (isEdit.value ? 'Edit my display' : 'Add my display'))
const stepIndex = computed(() => steps.value.indexOf(step.value))
const stepLabel = computed(() =>
  stepIndex.value >= 0 ? `Step ${stepIndex.value + 1} of ${steps.value.length}` : '',
)

function goTo(next: Step): void {
  submitError.value = null
  step.value = next
}

function nextStep(): void {
  const i = stepIndex.value
  const n = steps.value[i + 1]
  if (n) goTo(n)
}

function leave(): void {
  if (ionRouter.canGoBack()) router.back()
  else void router.replace(isEdit.value ? '/me' : '/')
}

function back(): void {
  const i = stepIndex.value
  const prev = i > 0 ? steps.value[i - 1] : undefined
  if (prev && !busy.value && step.value !== 'success') goTo(prev)
  else leave()
}

async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true
  submitError.value = null
  progress.value = null
  const onProgress = (p: SubmitProgress) => {
    progress.value = p
  }
  try {
    if (isEdit.value) {
      createdPinId.value = await myPin.update(
        { title: title.value, description: description.value, photo: photo.value?.blob ?? null },
        onProgress,
      )
    } else {
      const loc = location.value
      const img = photo.value
      if (!loc) return goTo('location')
      if (!img) return goTo('photo')
      if (!consent.value) return goTo('details')
      createdPinId.value = await myPin.create(
        {
          lat: loc.lat,
          lng: loc.lng,
          title: title.value,
          description: description.value,
          photo: img.blob,
          consent: consent.value,
        },
        onProgress,
      )
    }
    step.value = 'success'
  } catch (e) {
    submitError.value = toPinWriteError(e)
  } finally {
    busy.value = false
    progress.value = null
  }
}

function toMyDisplay(): void {
  // Replace so Back from /me doesn't return to a finished form.
  void router.replace('/me')
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button class="icon-tap" aria-label="Back" @click="back">
            <ion-icon slot="icon-only" :icon="chevronBack" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ pageTitle }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="mx-auto flex max-w-lg flex-col gap-4 pb-8">
        <StateMessage v-if="loading" loading title="Loading…" />

        <StateMessage
          v-else-if="myPin.error"
          :icon="alertCircleOutline"
          title="Couldn't reach Porchlight"
          message="Check your connection and try again."
          error
        >
          <ion-button class="tap" @click="prepare(true)">Try again</ion-button>
        </StateMessage>

        <StateMessage
          v-else-if="blockedReason"
          :icon="blockedReason === 'ALREADY_EXISTS' ? homeOutline : closeCircleOutline"
          :title="blockedTitle"
          :message="PIN_WRITE_MESSAGES[blockedReason]"
        >
          <ion-button v-if="blockedReason !== 'SUBMISSIONS_CLOSED'" class="tap" @click="toMyDisplay">Go to My display</ion-button>
          <ion-button fill="outline" class="tap" router-link="/" router-direction="back">Back to Porchlight</ion-button>
        </StateMessage>

        <template v-else-if="step === 'success'">
          <StateMessage
            :emoji="isEdit ? '✓' : seasonIcon"
            :title="isEdit ? 'Changes saved' : 'Your display is live!'"
            :message="
              isEdit
                ? 'Your display has been updated.'
                : 'It shows as Unverified until a few people visit and tap “It\'s here”.'
            "
          >
            <ion-button
              v-if="createdPinId"
              class="tap"
              :router-link="`/p/${createdPinId}`"
              router-direction="back"
            >
              See it on Porchlight
            </ion-button>
            <ion-button fill="outline" class="tap" @click="toMyDisplay">My display</ion-button>
          </StateMessage>
        </template>

        <template v-else>
          <p class="m-0 text-sm pl-muted" aria-live="polite">{{ stepLabel }}</p>

          <LocationStep v-if="step === 'location'" v-model="location" @next="nextStep" />

          <PhotoStep
            v-else-if="step === 'photo'"
            v-model="photo"
            :editing="isEdit"
            :current-photo-url="isEdit ? myPin.pin?.photoUrl ?? null : null"
            @next="nextStep"
          />

          <DetailsStep
            v-else-if="step === 'details'"
            v-model:title="title"
            v-model:description="description"
            v-model:consent="consent"
            :editing="isEdit"
            @next="nextStep"
          />

          <template v-else-if="step === 'preview'">
            <SubmitError
              v-if="submitError"
              :error="submitError"
              @retry="submit"
              @change-photo="goTo('photo')"
              @edit-details="goTo('details')"
            />
            <PreviewStep
              :photo="photo?.blob ?? null"
              :current-photo-url="isEdit ? myPin.pin?.photoUrl ?? null : null"
              :title="title"
              :description="description"
              :town="isEdit ? myPin.pin?.place.town ?? null : null"
              :editing="isEdit"
              :busy="busy"
              :progress="progress"
              :can-submit="!submitError || !FINAL_SUBMIT_REASONS.includes(submitError.reason)"
              @submit="submit"
            />
          </template>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.icon-tap {
  min-height: 44px;
  min-width: 44px;
}
</style>
