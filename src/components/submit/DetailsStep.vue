<script setup lang="ts">
// Details step (SPEC F5): title 3–60, description 0–500, privacy tip and the
// required consent checkbox (new displays only).
import { computed, ref } from 'vue'
import { IonButton, IonCheckbox, IonInput, IonTextarea } from '@ionic/vue'
import {
  CONSENT_TEXT,
  DESCRIPTION_MAX,
  TITLE_MAX,
  descriptionError,
  titleError,
} from './validation'

const props = defineProps<{
  title: string
  description: string
  consent: boolean
  /** Edit mode: no consent checkbox. */
  editing?: boolean
}>()
const emit = defineEmits<{
  'update:title': [value: string]
  'update:description': [value: string]
  'update:consent': [value: boolean]
  next: []
}>()

const touched = ref(false)
const titleMsg = computed(() => titleError(props.title))
const descMsg = computed(() => descriptionError(props.description))
const valid = computed(() => !titleMsg.value && !descMsg.value && (props.editing || props.consent))

function next(): void {
  touched.value = true
  if (valid.value) emit('next')
}
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="details-heading">
    <h2 id="details-heading" class="m-0 text-lg font-semibold">About your display</h2>

    <ion-input
      :value="title"
      label="Title"
      label-placement="stacked"
      fill="outline"
      :maxlength="TITLE_MAX"
      :counter="true"
      placeholder="e.g. The Haunted Villa"
      :class="{ 'ion-invalid': touched && titleMsg, 'ion-touched': touched }"
      :error-text="titleMsg ?? undefined"
      data-testid="title-input"
      @ion-input="emit('update:title', String($event.detail.value ?? ''))"
      @ion-blur="touched = true"
    />

    <ion-textarea
      :value="description"
      label="Description (optional)"
      label-placement="stacked"
      fill="outline"
      :maxlength="DESCRIPTION_MAX"
      :counter="true"
      :auto-grow="true"
      :rows="4"
      placeholder="What's worth seeing? Best time to visit?"
      :class="{ 'ion-invalid': touched && descMsg, 'ion-touched': touched }"
      :error-text="descMsg ?? undefined"
      data-testid="description-input"
      @ion-input="emit('update:description', String($event.detail.value ?? ''))"
    />

    <p class="tip m-0 rounded-lg p-3 text-sm">
      <strong>Tip:</strong> Don't include your house number or car plates.
    </p>

    <template v-if="!editing">
      <ion-checkbox
        :checked="consent"
        label-placement="end"
        justify="start"
        class="consent"
        data-testid="consent"
        @ion-change="emit('update:consent', $event.detail.checked)"
      >
        <span class="ion-text-wrap">{{ CONSENT_TEXT }}</span>
      </ion-checkbox>
      <p v-if="touched && !consent" class="error m-0 text-sm" role="alert">
        Please confirm you're allowed to share this house.
      </p>
    </template>

    <ion-button expand="block" class="tap m-0" @click="next">Next: preview</ion-button>
  </section>
</template>

<style scoped>
.tap {
  min-height: 48px;
}
.tip {
  background: rgba(var(--ion-color-primary-rgb, 0, 0, 0), 0.12);
}
.consent {
  min-height: 44px;
  white-space: normal;
}
.consent::part(label) {
  white-space: normal;
}
.error {
  color: var(--ion-color-danger);
}
</style>
