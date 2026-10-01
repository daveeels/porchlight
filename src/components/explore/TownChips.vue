<script setup lang="ts">
// "All · Mount Maunganui · Pāpāmoa · …" across the top of an area (SPEC F1).
// The row scrolls sideways on its own; the page never does. Chips are
// focusable and work with Enter/Space like buttons.
import { computed } from 'vue'
import { IonChip, IonLabel } from '@ionic/vue'
import { usePinsStore } from '@/stores/pins'

const props = defineProps<{
  areaKey: string
  /** The selected town, or null when "All" is selected. */
  townKey: string | null
}>()

const emit = defineEmits<{ select: [sel: { kind: 'area' | 'town'; key: string }] }>()

const pins = usePinsStore()
const towns = computed(() => pins.townsInArea(props.areaKey))

function selectAll(): void {
  emit('select', { kind: 'area', key: props.areaKey })
}

function selectTown(key: string): void {
  emit('select', { kind: 'town', key })
}
</script>

<template>
  <nav v-if="towns.length" aria-label="Towns" class="chips flex gap-2 overflow-x-auto px-3 pb-2">
    <ion-chip
      :outline="townKey !== null"
      :color="townKey === null ? 'primary' : undefined"
      class="chip"
      role="button"
      tabindex="0"
      :aria-pressed="townKey === null"
      @click="selectAll"
      @keydown.enter.prevent="selectAll"
      @keydown.space.prevent="selectAll"
    >
      <ion-label>All</ion-label>
    </ion-chip>
    <ion-chip
      v-for="t in towns"
      :key="t.key"
      :outline="townKey !== t.key"
      :color="townKey === t.key ? 'primary' : undefined"
      class="chip"
      role="button"
      tabindex="0"
      :aria-pressed="townKey === t.key"
      @click="selectTown(t.key)"
      @keydown.enter.prevent="selectTown(t.key)"
      @keydown.space.prevent="selectTown(t.key)"
    >
      <ion-label>{{ t.town }}</ion-label>
    </ion-chip>
  </nav>
</template>

<style scoped>
.chips {
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.chips::-webkit-scrollbar {
  display: none;
}
.chip {
  flex: none;
  min-height: 44px;
  min-width: 44px;
  justify-content: center;
  margin: 0;
}
.chip:focus-visible {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
}
</style>
