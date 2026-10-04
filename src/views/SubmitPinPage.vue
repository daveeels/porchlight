<script setup lang="ts">
// /submit — Add my display (SPEC F5): location → photo → details → preview →
// submit → success. /submit?edit=1 edits the current pin: photo (optional) →
// details → preview, no location step (location can't change). Auth-guarded.
// Each step after the first has a Back history entry (src/lib/backStack), so
// the phone's Back goes to the previous step with everything kept; on the
// first step Back leaves the page as before.
// Coming soon: a new display can be marked "My decorations aren't up yet"
// (photo optional, no votes). /submit?edit=1&lightsUp=1 ("My lights are up!")
// asks for a decorated photo and turns it into a ready display.
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
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
import { openBackEntry, settled, type BackEntry } from '@/lib/backStack'
import { PIN_WRITE_MESSAGES, PinWriteError, toPinWriteError, type PinWriteReason } from '@/services/pinWrites'
import { SEASON_THEMES } from '@/config/seasons'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { useMyPinStore, type SubmitProgress } from '@/stores/myPin'
import { useSeasonStore } from '@/stores/season'
import { useTermsStore } from '@/stores/terms'

type Step = 'location' | 'photo' | 'details' | 'preview' | 'success'

const route = useRoute()
const router = useRouter()
const ionRouter = useIonRouter()
const myPin = useMyPinStore()
const season = useSeasonStore()
const appConfig = useAppConfigStore()
const auth = useAuthStore()
const terms = useTermsStore()

const isEdit = computed(() => route.query.edit === '1')
const lightsUp = computed(() => isEdit.value && route.query.lightsUp === '1')
const steps = computed<Step[]>(() =>
  isEdit.value ? ['photo', 'details', 'preview'] : ['location', 'photo', 'details', 'preview'],
)

const step = ref<Step>(steps.value[0] ?? 'location')
const location = ref<LatLng | null>(null)
const photo = shallowRef<PreparedImage | null>(null)
const title = ref('')
const description = ref('')
const consent = ref(false)
const comingSoon = ref(false)
const busy = ref(false)
const progress = ref<SubmitProgress | null>(null)
const submitError = shallowRef<PinWriteError | null>(null)
const createdPinId = ref<string | null>(null)
/**
 * The user and mode the form was last reset for (the page instance is reused
 * by Ionic, so on a shared device the next person must not see the last draft).
 */
let preparedFor: string | null = null

// ---- Back history: stepEntries[i] is the entry for steps[i + 1] ----------

const stepEntries: BackEntry[] = []

function pushStepEntry(): void {
  const entry = openBackEntry(() => {
    // Can't stop an upload half way: stay on this step.
    if (busy.value) return false
    const i = stepEntries.indexOf(entry)
    if (i === -1) return
    stepEntries.splice(i)
    submitError.value = null
    step.value = steps.value[i] ?? steps.value[0] ?? 'location'
  })
  stepEntries.push(entry)
}

/** Drops the entries of steps after steps[index] (top first, so each is popped). */
function dropStepEntries(index: number): void {
  const dropped = stepEntries.splice(Math.max(0, index))
  for (const e of dropped.reverse()) void e.close()
}

onUnmounted(() => dropStepEntries(0))

function reset(): void {
  dropStepEntries(0)
  step.value = steps.value[0] ?? 'location'
  location.value = null
  photo.value = null
  title.value = ''
  description.value = ''
  consent.value = false
  comingSoon.value = false
  busy.value = false
  progress.value = null
  submitError.value = null
  createdPinId.value = null
}

async function prepare(force = false): Promise<void> {
  const key = `${auth.uid ?? ''}:${lightsUp.value ? 'lightsUp' : isEdit.value ? 'edit' : 'create'}`
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
watch([isEdit, lightsUp], () => {
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
  if (myPin.createsLeft === 0) return 'CREATE_CAP'
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
    case 'CREATE_CAP':
      return 'Season limit reached'
    default:
      return 'Nothing to edit'
  }
})

const success = computed(() => {
  if (lightsUp.value) {
    return {
      emoji: seasonIcon.value,
      title: 'Lights on!',
      message: "Your display is up. Voting is open, so people can now confirm it's there.",
    }
  }
  if (isEdit.value) return { emoji: '✓', title: 'Changes saved', message: 'Your display has been updated.' }
  if (comingSoon.value) {
    return {
      emoji: seasonIcon.value,
      title: "You're on the list!",
      message: 'It shows as Coming soon. When your decorations are up, open My display and tap “My lights are up!”.',
    }
  }
  return {
    emoji: seasonIcon.value,
    title: 'Your display is live!',
    message: "It shows as Unverified until a few people visit and tap “It's here”.",
  }
})

const loading = computed(() => !season.ready || (!myPin.loaded && !myPin.error && !!myPin.pinId))

const seasonIcon = computed(() => (season.season ? SEASON_THEMES[season.season].icon : '🏠'))

const pageTitle = computed(() => (lightsUp.value ? 'My lights are up!' : isEdit.value ? 'Edit my display' : 'Add my display'))
/** Shown as Coming soon in the preview: a new one marked so, or an edit that stays so. */
const previewComingSoon = computed(() =>
  isEdit.value ? !lightsUp.value && myPin.pin?.stage === 'COMING_SOON' : comingSoon.value,
)
const stepIndex = computed(() => steps.value.indexOf(step.value))
const stepLabel = computed(() =>
  stepIndex.value >= 0 ? `Step ${stepIndex.value + 1} of ${steps.value.length}` : '',
)

function goTo(next: Step): void {
  submitError.value = null
  const from = stepIndex.value
  const to = steps.value.indexOf(next)
  if (from >= 0 && to > from) for (let i = from; i < to; i++) pushStepEntry()
  else if (to >= 0 && to < from) dropStepEntries(to)
  step.value = next
}

/** Finished: no step entries left, so Back from here (or from /me) leaves the form. */
function showSuccess(): void {
  dropStepEntries(0)
  step.value = 'success'
}

function nextStep(): void {
  const i = stepIndex.value
  const n = steps.value[i + 1]
  if (n) goTo(n)
}

async function leave(): Promise<void> {
  await settled()
  if (ionRouter.canGoBack()) router.back()
  else void router.replace(isEdit.value ? '/me' : '/')
}

function back(): void {
  const i = stepIndex.value
  const prev = i > 0 ? steps.value[i - 1] : undefined
  if (prev && !busy.value && step.value !== 'success') goTo(prev)
  else void leave()
}

async function submit(): Promise<void> {
  if (busy.value) return
  submitError.value = null
  // Community rules first (server-enforced as TERMS_REQUIRED).
  if (!(await terms.ensureAgreed())) {
    submitError.value = new PinWriteError('TERMS_REQUIRED')
    return
  }
  busy.value = true
  progress.value = null
  let retry = false
  const onProgress = (p: SubmitProgress) => {
    progress.value = p
  }
  try {
    if (isEdit.value) {
      if (lightsUp.value && !photo.value) return goTo('photo')
      createdPinId.value = await myPin.update(
        {
          title: title.value,
          description: description.value,
          photo: photo.value?.blob ?? null,
          lightsUp: lightsUp.value,
        },
        onProgress,
      )
    } else {
      const loc = location.value
      const img = photo.value
      if (!loc) return goTo('location')
      if (!img && !comingSoon.value) return goTo('photo')
      if (!consent.value) return goTo('details')
      createdPinId.value = await myPin.create(
        {
          lat: loc.lat,
          lng: loc.lng,
          title: title.value,
          description: description.value,
          photo: img?.blob ?? null,
          comingSoon: comingSoon.value,
          consent: consent.value,
        },
        onProgress,
      )
    }
    showSuccess()
  } catch (e) {
    const err = toPinWriteError(e)
    // The rules changed since this device last checked: agree, then send again.
    if (err.reason === 'TERMS_REQUIRED' && (await terms.onTermsRequired())) retry = true
    else submitError.value = err
  } finally {
    busy.value = false
    progress.value = null
  }
  if (retry) await submit()
}

async function toMyDisplay(): Promise<void> {
  // Replace so Back from /me doesn't return to a finished form.
  await settled()
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
          <StateMessage :emoji="success.emoji" :title="success.title" :message="success.message">
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
            v-model:coming-soon="comingSoon"
            :editing="isEdit"
            :lights-up="lightsUp"
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
              :current-photo-url="isEdit && !lightsUp ? myPin.pin?.photoUrl ?? null : null"
              :title="title"
              :description="description"
              :town="isEdit ? myPin.pin?.place.town ?? null : null"
              :editing="isEdit"
              :coming-soon="previewComingSoon"
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
