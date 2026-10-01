<script setup lang="ts">
// Place search over the single placeIndex doc (SPEC F1): filtered on the
// client as the user types, areas first, macron-insensitive. A short
// "Popular places" row sits under the box (hidden while the page shows town
// chips instead); focusing the empty box lists more.
import { computed, ref } from 'vue'
import { IonButton, IonChip, IonItem, IonLabel, IonList, IonNote, IonSearchbar } from '@ionic/vue'
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
  if (loadFailed.value) retryPlaces()
}

// Delay so a tap on a result registers before the list closes.
function onBlur(): void {
  blurTimer = setTimeout(() => {
    focused.value = false
  }, 200)
}

function choose(place: PlaceResult): void {
  clearTimeout(blurTimer)
  query.value = ''
  focused.value = false
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  emit('select', place)
}

function onCancel(): void {
  query.value = ''
  focused.value = false
}
</script>

<template>
  <div class="place-search">
    <ion-searchbar
      v-model="query"
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
      <p class="m-0 px-2 pb-1 text-xs font-semibold tracking-wide uppercase opacity-70">{{ heading }}</p>
      <ion-list v-if="results.length" lines="none" class="rounded-lg py-0">
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
            <span class="opacity-70"> · {{ r.sublabel }}</span>
          </ion-label>
          <ion-note slot="end">{{ r.count }}</ion-note>
        </ion-item>
      </ion-list>
      <p v-else-if="pins.placeIndexLoading" class="m-0 px-2 py-3 text-sm opacity-80" role="status">Loading places…</p>
      <div v-else-if="loadFailed" class="flex items-center gap-2 px-2 py-1">
        <p class="m-0 flex-1 text-sm" role="alert">Couldn't load places.</p>
        <ion-button fill="clear" size="small" class="tap" @mousedown.prevent @click="retryPlaces">Try again</ion-button>
      </div>
      <p v-else-if="query.trim()" class="m-0 px-2 py-3 text-sm opacity-80">
        No displays in a place matching “{{ query.trim() }}” yet.
      </p>
      <p v-else class="m-0 px-2 py-3 text-sm opacity-80">No places with displays yet.</p>
    </div>

    <div v-else-if="loadFailed" class="flex items-center gap-2 px-4 pb-2">
      <p class="m-0 flex-1 text-sm" role="alert">Couldn't load places.</p>
      <ion-button fill="clear" size="small" class="tap" @click="retryPlaces">Try again</ion-button>
    </div>

    <nav v-else-if="popular.length" aria-label="Popular places" class="pb-2">
      <p class="m-0 px-4 pb-1 text-xs font-semibold tracking-wide uppercase opacity-70">Popular places</p>
      <!-- Padding on the scroller (as in TownChips) so chips scroll to the screen edge. -->
      <div class="popular flex gap-2 overflow-x-auto px-3">
        <ion-chip
          v-for="r in popular"
          :key="`${r.kind}:${r.key}`"
          outline
          class="chip"
          role="button"
          tabindex="0"
          @click="choose(r)"
          @keydown.enter.prevent="choose(r)"
          @keydown.space.prevent="choose(r)"
        >
          <ion-label>{{ r.label }}</ion-label>
        </ion-chip>
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
.popular {
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.popular::-webkit-scrollbar {
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
