<script setup lang="ts">
// Photo step (SPEC F5): required for a new display, optional when editing.
// The picked file is decoded, resized and re-encoded to JPEG on the device.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue'
import { cameraOutline, imageOutline } from 'ionicons/icons'
import { ACCEPTED_TYPES, ImageError, prepareImage, type PreparedImage } from '@/lib/image'

const props = defineProps<{
  modelValue: PreparedImage | null
  /** Edit mode: the photo is optional and the current one is shown. */
  editing?: boolean
  currentPhotoUrl?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: PreparedImage | null]; next: [] }>()

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

const shownUrl = computed(() => previewUrl.value ?? props.currentPhotoUrl ?? null)
const canContinue = computed(() => !preparing.value && (!!props.modelValue || props.editing))

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
      <h2 id="photo-heading" class="pl-display m-0 text-2xl">{{ editing ? 'Photo' : 'Add a photo' }}</h2>
      <p class="m-0 mt-1 text-sm pl-muted">
        Show the decorations from the street. Leave out house numbers, car plates and people's faces.
        <template v-if="editing"> Keep the current photo or pick a new one — a new photo resets the "It's here" votes.</template>
      </p>
    </div>

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
      {{ modelValue || editing ? 'Choose a different photo' : 'Take or choose a photo' }}
    </ion-button>
    <ion-button v-if="editing && modelValue" fill="clear" class="tap m-0" @click="emit('update:modelValue', null)">
      Keep the current photo
    </ion-button>

    <ion-button expand="block" class="tap m-0" :disabled="!canContinue" @click="emit('next')">Next: details</ion-button>
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
