<script setup lang="ts">
// Place search over the single placeIndex doc (SPEC F1): filtered on the
// client as the user types, areas first, macron-insensitive. A short
// "Popular places" row sits under the box (hidden while the page shows town
// chips instead); focusing the empty box lists more.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IonButton, IonItem, IonLabel, IonList, IonNote, IonSearchbar } from '@ionic/vue'
import { openBackEntry, type BackEntry } from '@/lib/backStack'
import { searchPlaces, type PlaceResult } from '@/lib/search'
import { usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'

/** Popular places shown under the search box while it isn't focused. */
const POPULAR_COUNT = 5

const props = withDefaults(
  defineProps<{
    /** Show the "Popular places" row under the box. The dropdown always lists them. */
    showPopular?: boolean
  }>(),
  { showPopular: true },
)

const emit = defineEmits<{ select: [place: PlaceResult] }>()

const pins = usePinsStore()
const season = useSeasonStore()
const query = ref('')
const focused = ref(false)
let blurTimer: ReturnType<typeof setTimeout> | undefined

const results = computed<PlaceResult[]>(() =>
  pins.placeIndex ? searchPlaces(pins.placeIndex, query.value) : [],
)
const popular = computed<PlaceResult[]>(() =>
  props.showPopular && pins.placeIndex ? searchPlaces(pins.placeIndex, '', POPULAR_COUNT) : [],
)
const open = computed(() => focused.value || query.value.trim().length > 0)
const heading = computed(() => (query.value.trim() ? 'Places' : 'Popular places'))
/** placeIndex failed to load and isn't retrying right now. */
const loadFailed = computed(() => !!pins.placeIndexError && !pins.placeIndexLoading)

function retryPlaces(): void {
  if (pins.placeIndexLoading || !season.eventId) return
  void pins.loadPlaceIndex(true).catch(() => {
    // loadPlaceIndex records its own errors; this only guards a missing event.
  })
}

function onFocus(): void {
  clearTimeout(blurTimer)
  focused.value = true
  holdBack()
  if (loadFailed.value) retryPlaces()
}

// Delay so a tap on a result registers before the list closes. The Back
// entry goes at once: whatever took the focus (a chip, a card, Near me) may
// change the URL next, and that must not land on the dropdown's entry.
function onBlur(): void {
  dropBack()
  blurTimer = setTimeout(() => {
    focused.value = false
  }, 200)
}

function choose(place: PlaceResult): void {
  clearTimeout(blurTimer)
  query.value = ''
  focused.value = false
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  // Drop the dropdown's Back entry now: the parent awaits settled() before
  // changing the URL, so the replace never lands on that entry.
  dropBack()
  emit('select', place)
}

function onCancel(): void {
  query.value = ''
  focused.value = false
}

// Back closes the open dropdown (and the keyboard) instead of leaving the page.
let back: BackEntry | null = null

function dropBack(): void {
  void back?.close()
  back = null
}

/** While the box has focus (dropdown and keyboard up). Dropped as soon as focus leaves. */
function holdBack(): void {
  back ??= openBackEntry(() => {
    back = null
    clearTimeout(blurTimer)
    onCancel()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  })
}

watch(open, (isOpen) => {
  if (!isOpen) dropBack()
})
onBeforeUnmount(() => {
  clearTimeout(blurTimer)
  dropBack()
})
</script>

<template>
  <div class="place-search">
    <ion-searchbar
      v-model="query"
      class="pl-search"
      placeholder="Search a town or suburb"
      :debounce="0"
      show-cancel-button="focus"
      inputmode="search"
      enterkeyhint="search"
      aria-label="Search a town or suburb"
      @ion-focus="onFocus"
      @ion-blur="onBlur"
      @ion-cancel="onCancel"
      @keyup.enter="results[0] && choose(results[0])"
    />
    <div v-if="open" class="px-2 pb-2">
      <p class="label pl-muted m-0 px-2 pb-1">{{ heading }}</p>
      <ion-list v-if="results.length" lines="none" class="dropdown rounded-xl py-0">
        <ion-item
          v-for="r in results"
          :key="`${r.kind}:${r.key}`"
          button
          :detail="false"
          class="result"
          @mousedown.prevent
          @click="choose(r)"
        >
          <ion-label>
            <span class="font-medium">{{ r.label }}</span>
            <span class="pl-muted"> · {{ r.sublabel }}</span>
          </ion-label>
          <ion-note slot="end">{{ r.count }}</ion-note>
        </ion-item>
      </ion-list>
      <p v-else-if="pins.placeIndexLoading" class="m-0 px-2 py-3 text-sm pl-muted" role="status">Loading places…</p>
      <div v-else-if="loadFailed" class="flex items-center gap-2 px-2 py-1">
        <p class="m-0 flex-1 text-sm" role="alert">Couldn't load places.</p>
        <ion-button fill="clear" size="small" class="tap" @mousedown.prevent @click="retryPlaces">Try again</ion-button>
      </div>
      <p v-else-if="query.trim()" class="m-0 px-2 py-3 text-sm pl-muted">
        No displays in a place matching “{{ query.trim() }}” yet.
      </p>
      <p v-else class="m-0 px-2 py-3 text-sm pl-muted">No places with displays yet.</p>
    </div>

    <div v-else-if="loadFailed" class="flex items-center gap-2 px-4 pb-2">
      <p class="m-0 flex-1 text-sm" role="alert">Couldn't load places.</p>
      <ion-button fill="clear" size="small" class="tap" @click="retryPlaces">Try again</ion-button>
    </div>

    <nav v-else-if="popular.length" aria-label="Popular places" class="pb-2">
      <p class="label pl-muted m-0 px-4 pb-0.5">Popular places</p>
      <!-- Padding on the scroller (as in TownChips) so chips scroll to the screen edge. -->
      <div class="pl-scroll-row flex gap-2 overflow-x-auto px-4">
        <button v-for="r in popular" :key="`${r.kind}:${r.key}`" type="button" class="pl-chip" @click="choose(r)">
          <span class="pl-chip-face">{{ r.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.result {
  --min-height: 44px;
}
/* Ionic's clear and cancel buttons are smaller than 44 x 44: grow the hit
   areas, keeping the icons where they were. */
.place-search :deep(.searchbar-clear-button),
.place-search :deep(.searchbar-cancel-button) {
  min-width: 44px;
  min-height: 44px;
}
.place-search :deep(.searchbar-clear-button) {
  top: 50%;
  transform: translateY(-50%);
}
.place-search :deep(.searchbar-clear-button.sc-ion-searchbar-md) {
  inset-inline-end: 2px;
}
.place-search :deep(.searchbar-cancel-button.sc-ion-searchbar-md) {
  inset-inline-start: 0;
  top: 50%;
  transform: translateY(-50%);
}
.place-search :deep(.searchbar-has-value .searchbar-input.sc-ion-searchbar-ios) {
  padding-inline-end: 44px;
}
/* Ionic hides WebKit's own clear button in a rule that also lists ::-ms-clear,
   which WebKit drops as invalid, so Safari showed two clear buttons. */
.place-search :deep(.searchbar-input)::-webkit-search-cancel-button {
  display: none;
  -webkit-appearance: none;
}
.tap {
  min-height: 44px;
  margin: 0;
}
.pl-search {
  padding-inline: 16px;
  padding-top: 10px;
  padding-bottom: 8px;
}
.label {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.dropdown {
  background: var(--pl-surface);
  border: 1px solid var(--pl-line);
  overflow: hidden;
}
</style>
