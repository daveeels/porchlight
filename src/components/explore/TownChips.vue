<script setup lang="ts">
// "All · Mount Maunganui · Pāpāmoa · …" across the top of an area (SPEC F1).
// The row scrolls sideways on its own; the page never does. Chips are native
// buttons (focusable, Enter/Space work) with aria-pressed for the selection.
import { computed } from 'vue'
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
  <nav v-if="towns.length" aria-label="Towns" class="pl-scroll-row flex gap-2 overflow-x-auto px-4 pb-2">
    <button type="button" class="pl-chip" :aria-pressed="townKey === null" @click="selectAll">
      <span class="pl-chip-face">All</span>
    </button>
    <button
      v-for="t in towns"
      :key="t.key"
      type="button"
      class="pl-chip"
      :aria-pressed="townKey === t.key"
      @click="selectTown(t.key)"
    >
      <span class="pl-chip-face">{{ t.town }}</span>
    </button>
  </nav>
</template>
