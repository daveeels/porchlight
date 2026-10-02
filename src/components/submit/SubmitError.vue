<script setup lang="ts">
// A failed add/edit (SPEC F5 "Errors", §7 empty/error states), with the next
// step that makes sense for each reason.
import { computed } from 'vue'
import { IonButton } from '@ionic/vue'
import type { PinWriteError } from '@/services/pinWrites'
import { FINAL_SUBMIT_REASONS } from './validation'

const props = defineProps<{ error: PinWriteError }>()
const emit = defineEmits<{ retry: []; changePhoto: []; editDetails: [] }>()

const title = computed(() => {
  switch (props.error.reason) {
    case 'BETA_ONLY':
      return 'Private beta'
    case 'ALREADY_EXISTS':
      return 'You already have a display'
    case 'SUBMISSIONS_CLOSED':
      return 'Submissions closed'
    case 'RATE_LIMITED':
      return 'Try again tomorrow'
    case 'PHOTO_INVALID':
      return "That photo didn't work"
    case 'INVALID_INPUT':
      return 'Check your details'
    default:
      return "Couldn't save your display"
  }
})

/** Reasons where trying the same thing again could work. */
const retryable = computed(() => ['UPLOAD_FAILED', 'NETWORK', 'UNKNOWN'].includes(props.error.reason))
</script>

<template>
  <div class="box flex flex-col gap-3 rounded-xl p-4" data-testid="submit-error">
    <div role="alert">
      <h2 class="pl-display m-0 text-xl">{{ title }}</h2>
      <p class="m-0 mt-1 text-sm">{{ error.message }}</p>
    </div>
    <ion-button v-if="error.reason === 'ALREADY_EXISTS'" expand="block" class="tap m-0" router-link="/me">
      Go to My display
    </ion-button>
    <ion-button v-else-if="error.reason === 'UNAUTHENTICATED'" expand="block" class="tap m-0" router-link="/sign-in">
      Sign in again
    </ion-button>
    <ion-button v-else-if="error.reason === 'PHOTO_INVALID'" expand="block" class="tap m-0" @click="emit('changePhoto')">
      Choose another photo
    </ion-button>
    <ion-button v-else-if="error.reason === 'INVALID_INPUT'" expand="block" class="tap m-0" @click="emit('editDetails')">
      Edit details
    </ion-button>
    <ion-button v-else-if="retryable" expand="block" class="tap m-0" @click="emit('retry')">Try again</ion-button>
    <ion-button
      v-if="error.reason !== 'ALREADY_EXISTS' && FINAL_SUBMIT_REASONS.includes(error.reason)"
      expand="block"
      fill="outline"
      class="tap m-0"
      router-link="/"
      router-direction="back"
    >
      Back to Porchlight
    </ion-button>
  </div>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.box {
  background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), 0.12);
}
</style>
