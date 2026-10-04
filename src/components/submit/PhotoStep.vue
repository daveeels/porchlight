<script setup lang="ts">
// Photo step (SPEC F5): required for a new display, optional when editing.
// A new display can be marked "My decorations aren't up yet" (Coming soon),
// which makes the photo optional; "My lights are up!" (lightsUp) needs one.
// The picked file is decoded, resized and re-encoded to JPEG on the device.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IonButton, IonCheckbox, IonIcon, IonSpinner } from '@ionic/vue'
import { cameraOutline, imageOutline } from 'ionicons/icons'
import { ACCEPTED_TYPES, ImageError, prepareImage, type PreparedImage } from '@/lib/image'

const props = defineProps<{
  modelValue: PreparedImage | null
  /** Edit mode: the photo is optional and the current one is shown. */
  editing?: boolean
  currentPhotoUrl?: string | null
  /** New display only: "My decorations aren't up yet" (v-model:coming-soon). */
  comingSoon?: boolean
  /** "My lights are up!": a new photo of the decorations is required. */
  lightsUp?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: PreparedImage | null]
  'update:comingSoon': [value: boolean]
  next: []
}>()

const input = ref<HTMLInputElement | null>(null)
const preparing = ref(false)
const errorMessage = ref<string | null>(null)
const previewUrl = ref<string | null>(null)

watch(
  () => props.modelValue,
  (img) => {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = img ? URL.createObjectURL(img.blob) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

// lightsUp: only the new photo counts (the current one is from before the decorations).
const shownUrl = computed(() => previewUrl.value ?? (props.lightsUp ? null : props.currentPhotoUrl) ?? null)
const photoOptional = computed(() => (props.editing && !props.lightsUp) || (!props.editing && props.comingSoon))
const canContinue = computed(() => !preparing.value && (!!props.modelValue || photoOptional.value))
const heading = computed(() =>
  props.lightsUp ? 'Show off your decorations' : props.editing ? 'Photo' : 'Add a photo',
)

function pick(): void {
  input.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = '' // picking the same file again still fires change
  if (!file) return
  preparing.value = true
  errorMessage.value = null
  try {
    emit('update:modelValue', await prepareImage(file))
  } catch (err) {
    errorMessage.value = err instanceof ImageError ? err.message : new ImageError('failed').message
  } finally {
    preparing.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="photo-heading">
    <div>
      <h2 id="photo-heading" class="pl-display m-0 text-2xl">{{ heading }}</h2>
      <p class="m-0 mt-1 text-sm pl-muted">
        Show the decorations from the street. Leave out house numbers, car plates and people's faces.
        <template v-if="lightsUp"> Once it's saved, people can vote that your display is there.</template>
        <template v-else-if="editing"> Keep the current photo or pick a new one — a new photo resets the "It's here" votes.</template>
      </p>
    </div>

    <ion-checkbox
      v-if="!editing"
      :checked="comingSoon"
      label-placement="end"
      justify="start"
      class="soon rounded-xl p-3"
      data-testid="coming-soon-toggle"
      @ion-change="emit('update:comingSoon', $event.detail.checked)"
    >
      <span class="ion-text-wrap text-sm">
        <strong>My decorations aren't up yet</strong><br />
        <span class="pl-muted">List it as Coming soon. The photo is optional; add one when your lights are up.</span>
      </span>
    </ion-checkbox>

    <input
      ref="input"
      type="file"
      :accept="ACCEPTED_TYPES"
      class="sr-only"
      data-testid="photo-input"
      aria-label="Choose a photo"
      @change="onFile"
    />

    <div class="preview flex items-center justify-center overflow-hidden rounded-xl">
      <ion-spinner v-if="preparing" name="crescent" />
      <img v-else-if="shownUrl" :src="shownUrl" alt="Your display photo" class="h-full w-full object-cover" />
      <ion-icon v-else :icon="imageOutline" class="text-5xl opacity-60" aria-hidden="true" />
    </div>

    <p v-if="errorMessage" class="error m-0 text-sm" role="alert">{{ errorMessage }}</p>

    <ion-button expand="block" fill="outline" class="tap m-0" :disabled="preparing" @click="pick">
      <ion-icon slot="start" :icon="cameraOutline" aria-hidden="true" />
      {{ modelValue || (editing && !lightsUp) ? 'Choose a different photo' : 'Take or choose a photo' }}
    </ion-button>
    <ion-button v-if="editing && !lightsUp && modelValue" fill="clear" class="tap m-0" @click="emit('update:modelValue', null)">
      Keep the current photo
    </ion-button>

    <ion-button expand="block" class="tap m-0" :disabled="!canContinue" @click="emit('next')">
      {{ !modelValue && comingSoon && !editing ? 'Skip the photo for now' : 'Next: details' }}
    </ion-button>
  </section>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.preview {
  aspect-ratio: 4 / 3;
  background: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.08);
}
.soon {
  min-height: 44px;
  white-space: normal;
  background: var(--pl-surface);
}
.soon::part(label) {
  white-space: normal;
}
.error {
  color: var(--ion-color-danger);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
