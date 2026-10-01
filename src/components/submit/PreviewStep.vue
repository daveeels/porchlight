<script setup lang="ts">
// Preview + submit (SPEC F5): what the display will look like, then upload
// with progress and create/update the pin.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IonButton, IonProgressBar, IonSpinner } from '@ionic/vue'
import VerifiedBadge from '@/components/pin/VerifiedBadge.vue'
import type { SubmitProgress } from '@/stores/myPin'

const props = defineProps<{
  photo: Blob | null
  /** Shown when there's no new photo (edit mode). */
  currentPhotoUrl?: string | null
  title: string
  description: string
  town?: string | null
  editing?: boolean
  busy: boolean
  progress: SubmitProgress | null
  /** False after a final error (e.g. BETA_ONLY): submitting again can't help. */
  canSubmit?: boolean
}>()
const emit = defineEmits<{ submit: [] }>()

const blobUrl = ref<string | null>(null)
watch(
  () => props.photo,
  (b) => {
    if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = b ? URL.createObjectURL(b) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
})

const imageUrl = computed(() => blobUrl.value ?? props.currentPhotoUrl ?? null)
const progressLabel = computed(() => {
  const p = props.progress
  if (!p) return ''
  if (p.phase === 'upload') return `Uploading photo… ${Math.round(p.fraction * 100)}%`
  return props.editing ? 'Saving changes…' : 'Putting your display on the map…'
})
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="preview-heading">
    <h2 id="preview-heading" class="m-0 text-lg font-semibold">Check it looks right</h2>

    <article class="card overflow-hidden rounded-xl" data-testid="preview-card">
      <img v-if="imageUrl" :src="imageUrl" alt="Your display photo" class="photo block w-full object-cover" />
      <div class="flex flex-col gap-1 p-3">
        <h3 class="m-0 text-lg font-bold break-words">{{ title.trim() }}</h3>
        <p v-if="town" class="m-0 text-sm opacity-80">{{ town }}</p>
        <div><VerifiedBadge :verified="false" /></div>
        <p v-if="description.trim()" class="m-0 mt-1 text-sm whitespace-pre-line break-words">{{ description.trim() }}</p>
      </div>
    </article>

    <p class="m-0 text-sm opacity-85">
      <template v-if="editing">Location can't be changed. To move it, delete your display and add it again.</template>
      <template v-else>
        New displays go live straight away as Unverified. The location is shown about 25–50 m from where you put the
        pin, and we remove all hidden data (like GPS) from your photo.
      </template>
    </p>

    <div v-if="busy" class="flex flex-col gap-2" role="status" aria-live="polite">
      <span class="text-sm">{{ progressLabel }}</span>
      <ion-progress-bar
        :value="progress?.phase === 'upload' ? progress.fraction : undefined"
        :type="progress?.phase === 'upload' ? 'determinate' : 'indeterminate'"
      />
    </div>

    <ion-button
      v-if="canSubmit !== false"
      expand="block"
      class="tap m-0"
      :disabled="busy"
      data-testid="submit-pin"
      @click="emit('submit')"
    >
      <ion-spinner v-if="busy" slot="start" name="crescent" />
      {{ editing ? 'Save changes' : 'Add my display' }}
    </ion-button>
  </section>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.card {
  background: var(--ion-card-background, var(--ion-item-background));
}
.photo {
  aspect-ratio: 4 / 3;
}
</style>
