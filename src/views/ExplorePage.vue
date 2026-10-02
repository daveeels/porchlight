<script setup lang="ts">
// SPEC F1/F2, §7 "/". The root of the Ionic stack: never replaced. Area, town
// and pin selection live in the query (?area= / ?town= / ?pin=) and change
// only through router.replace; the query drives the stores.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonToggle,
  IonToolbar,
  onIonViewDidEnter,
  onIonViewWillLeave,
} from '@ionic/vue'
import { alertCircleOutline, closeOutline, locateOutline } from 'ionicons/icons'
import AccountButton from '@/components/explore/AccountButton.vue'
import AddDisplayFab from '@/components/explore/AddDisplayFab.vue'
import MapSegment from '@/components/explore/MapSegment.vue'
import OffSeasonLanding from '@/components/explore/OffSeasonLanding.vue'
import PlaceSearch from '@/components/explore/PlaceSearch.vue'
import ResultsList from '@/components/explore/ResultsList.vue'
import TownChips from '@/components/explore/TownChips.vue'
import { geolocate, GeolocateFailure, type GeolocateError } from '@/components/explore/geolocate'
import BetaBadge from '@/components/common/BetaBadge.vue'
import OfflineBanner from '@/components/common/OfflineBanner.vue'
import StateMessage from '@/components/common/StateMessage.vue'
import InstallPrompt from '@/components/install/InstallPrompt.vue'
import PinDetailSheet from '@/components/pin/PinDetailSheet.vue'
import { AREAS } from '@/config/areas'
import { SEASON_THEMES } from '@/config/seasons'
import type { PlaceResult } from '@/lib/search'
import { useAppConfigStore } from '@/stores/appConfig'
import { usePinsStore } from '@/stores/pins'
import { useSeasonStore } from '@/stores/season'
import type { PlaceSelection } from '@/types/models'

type Segment = 'list' | 'map'
type PlaceSel = { kind: 'area' | 'town'; key: string }

const route = useRoute()
const router = useRouter()
const appConfig = useAppConfigStore()
const season = useSeasonStore()
const pins = usePinsStore()

const segment = ref<Segment>('list')
/** False while another route covers this page (e.g. /sign-in). */
const pageVisible = ref(true)
const retrying = ref(false)
const locating = ref(false)
const nearMeError = ref<GeolocateError | null>(null)

onIonViewDidEnter(() => {
  pageVisible.value = true
})
onIonViewWillLeave(() => {
  pageVisible.value = false
})

function onSegment(e: CustomEvent): void {
  const v = (e.detail as { value?: unknown }).value
  if (v === 'list' || v === 'map') segment.value = v
}

// ---- Query -> stores -------------------------------------------------------

function str(v: LocationQuery[string] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

function sameSelection(a: PlaceSelection, b: PlaceSelection | null): boolean {
  if (!b || a.kind === 'nearMe' || b.kind === 'nearMe') return false
  return a.kind === b.kind && a.key === b.key
}

function applyQuery(): void {
  if (!season.eventId) return
  const q = route.query
  const town = str(q.town)
  const area = str(q.area)
  let sel: PlaceSelection | null = null
  if (town) sel = { kind: 'town', key: town }
  else if (area) sel = { kind: 'area', key: area }
  else if (pins.selection?.kind !== 'nearMe' && appConfig.config.defaultAreaKey) {
    sel = { kind: 'area', key: appConfig.config.defaultAreaKey }
  }
  if (sel && !sameSelection(sel, pins.selection)) void pins.setSelection(sel)

  const pin = str(q.pin)
  if (pin !== pins.selectedPinId) void pins.selectPin(pin)
}

watch(
  () => season.eventId,
  (id, prev) => {
    if (!id) return
    void pins.loadPlaceIndex()
    if (prev && pins.selection) void pins.loadFirstPage()
    applyQuery()
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  () => {
    if (route.name === 'explore') applyQuery()
  },
)

// ---- In-app selection -> query ---------------------------------------------

function goPlace(sel: PlaceSel): void {
  nearMeError.value = null
  void router.replace({ query: sel.kind === 'area' ? { area: sel.key } : { town: sel.key } })
}

function onSearchSelect(place: PlaceResult): void {
  goPlace({ kind: place.kind, key: place.key })
}

function openPin(id: string): void {
  void router.replace({ query: { ...route.query, pin: id } })
}

function browseDefault(): void {
  const key = appConfig.config.defaultAreaKey ?? AREAS[0]?.key
  if (key) goPlace({ kind: 'area', key })
}

async function nearMe(): Promise<void> {
  nearMeError.value = null
  locating.value = true
  try {
    const { lat, lng } = await geolocate()
    // loadNearMe sets the selection to nearMe synchronously, so the query
    // watcher keeps it instead of falling back to the default area.
    const loading = pins.loadNearMe(lat, lng)
    const { area: _area, town: _town, ...rest } = route.query
    void router.replace({ query: rest })
    await loading
  } catch (e) {
    nearMeError.value = e instanceof GeolocateFailure ? e.kind : 'unavailable'
  } finally {
    locating.value = false
  }
}

async function retryLoad(): Promise<void> {
  retrying.value = true
  try {
    await season.init()
  } finally {
    retrying.value = false
  }
}

// ---- Headings --------------------------------------------------------------

function prettyKey(key: string): string {
  return key.replace(/[-_]+/g, ' ').replace(/(^|\s)(\p{L})/gu, (_m, s: string, c: string) => s + c.toUpperCase())
}

function areaName(key: string): string {
  return pins.placeIndex?.areas[key]?.area ?? AREAS.find((a) => a.key === key)?.name ?? prettyKey(key)
}

const placeName = computed(() => {
  const sel = pins.selection
  if (!sel) return ''
  if (sel.kind === 'nearMe') return 'Near you'
  if (sel.kind === 'area') return areaName(sel.key)
  return pins.placeIndex?.towns[sel.key]?.town ?? prettyKey(sel.key)
})

const placeContext = computed(() => {
  const sel = pins.selection
  if (sel?.kind !== 'town') return null
  const t = pins.placeIndex?.towns[sel.key]
  if (!t) return null
  return t.areaKey ? areaName(t.areaKey) : t.region
})

/** "46 spooky houses", from the placeIndex count (as in the search dropdown). */
const countLine = computed(() => {
  const sel = pins.selection
  const index = pins.placeIndex
  if (!sel || sel.kind === 'nearMe' || !index || !season.season) return null
  const n = sel.kind === 'area' ? index.areas[sel.key]?.count : index.towns[sel.key]?.count
  if (!n || n < 1) return null
  const [one, other] = SEASON_THEMES[season.season].houses
  return `${n} ${n === 1 ? one : other}`
})

/** Under the place heading: "Tauranga & surrounds · 5 spooky houses". */
const subLine = computed(() => [placeContext.value, countLine.value].filter(Boolean).join(' · '))

/** The area whose town chips to show (the area itself, or the town's area). */
const chipsAreaKey = computed<string | null>(() => {
  const sel = pins.selection
  if (sel?.kind === 'area') return sel.key
  if (sel?.kind === 'town') return pins.placeIndex?.towns[sel.key]?.areaKey ?? null
  return null
})
const chipsTownKey = computed(() => (pins.selection?.kind === 'town' ? pins.selection.key : null))
/** TownChips renders: the "Popular places" row is hidden then (the search dropdown still lists them). */
const showsTownChips = computed(() => !!chipsAreaKey.value && pins.townsInArea(chipsAreaKey.value).length > 0)

const nearMeMessage = computed(() => {
  switch (nearMeError.value) {
    case 'denied':
      return 'Location is turned off for Porchlight. Allow location in your browser settings, or search for a town instead.'
    case 'unsupported':
      return "This browser can't share your location. Search for a town instead."
    case 'unavailable':
      return "Couldn't find your location. Try again, or search for a town instead."
    default:
      return null
  }
})
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar class="brand-bar">
        <div slot="start" class="brand">
          <span class="wordmark pl-display">Porchlight</span>
          <BetaBadge />
        </div>
        <ion-buttons slot="end">
          <AccountButton />
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar v-if="season.eventId" class="segment-bar">
        <ion-segment :value="segment" aria-label="View" class="view-segment" @ion-change="onSegment">
          <ion-segment-button value="list" class="seg">
            <ion-label>List</ion-label>
          </ion-segment-button>
          <ion-segment-button value="map" class="seg">
            <ion-label>Map</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content :scroll-y="segment === 'list' || !season.eventId">
      <OfflineBanner />

      <StateMessage v-if="!season.ready || retrying" loading title="Loading Porchlight…" />

      <StateMessage
        v-else-if="appConfig.error"
        :icon="alertCircleOutline"
        title="Couldn't reach Porchlight"
        error
        message="Check your connection and try again."
      >
        <ion-button class="tap" @click="retryLoad">Try again</ion-button>
      </StateMessage>

      <OffSeasonLanding v-else-if="season.offSeason" />

      <template v-else>
        <!-- pb-24 keeps the last result clear of the Add my display button. -->
        <div v-show="segment === 'list'" class="mx-auto max-w-2xl pb-24">
          <PlaceSearch :show-popular="!showsTownChips" @select="onSearchSelect" />

          <div class="flex items-center justify-between gap-2 px-4 pb-2">
            <ion-button fill="outline" class="tap near-me m-0" :disabled="locating" @click="nearMe">
              <ion-spinner v-if="locating" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="locateOutline" aria-hidden="true" />
              Near me
            </ion-button>
            <ion-toggle v-model="pins.verifiedOnly" label-placement="start" class="toggle font-bold">
              Verified only
            </ion-toggle>
          </div>

          <div v-if="nearMeMessage" class="notice mx-4 mb-2 flex items-start gap-2 rounded-xl p-3 text-sm" role="alert">
            <span class="flex-1">{{ nearMeMessage }}</span>
            <ion-button fill="clear" size="small" class="close" aria-label="Dismiss" @click="nearMeError = null">
              <ion-icon slot="icon-only" :icon="closeOutline" />
            </ion-button>
          </div>

          <header v-if="pins.selection" class="px-4 pt-2 pb-1">
            <h1 class="place-heading pl-display m-0">{{ placeName }}</h1>
            <p v-if="subLine" class="pl-muted m-0 mt-0.5 text-sm font-bold">{{ subLine }}</p>
          </header>

          <TownChips v-if="chipsAreaKey" :area-key="chipsAreaKey" :town-key="chipsTownKey" @select="goPlace" />

          <!-- SPEC F10: inline, never over results; shows itself only after real use. -->
          <InstallPrompt />

          <ResultsList v-if="pins.selection" :place-name="placeName" @select="openPin" @browse-default="browseDefault" />
          <StateMessage
            v-else
            :icon="locateOutline"
            title="Find displays"
            message="Search for a town or suburb, or tap Near me."
          />
        </div>

        <!-- List only: on the map it would sit on top of the locate button. -->
        <AddDisplayFab v-if="segment === 'list'" />

        <div v-show="segment === 'map'" slot="fixed" class="map-slot">
          <MapSegment :shown="segment === 'map' && pageVisible" @select-pin="openPin" />
        </div>
      </template>
    </ion-content>

    <PinDetailSheet :suspended="!pageVisible" />
  </ion-page>
</template>

<style scoped>
.brand-bar {
  --padding-start: 16px;
  --padding-end: 8px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wordmark {
  font-size: 1.75rem;
  line-height: 1;
  color: var(--ion-color-primary);
  text-shadow:
    0 0 14px var(--pl-glow),
    0 2px 0 var(--pl-shadow);
}
.segment-bar {
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-top: 2px;
  --padding-bottom: 10px;
}
.view-segment {
  --background: transparent;
  gap: 8px;
  border-radius: 0;
  overflow: visible;
}
.seg {
  min-height: 44px;
  --background: var(--pl-surface);
  --background-checked: var(--pl-surface);
  --background-hover: transparent;
  --color: var(--pl-muted);
  --color-checked: var(--pl-on-primary);
  --color-hover: var(--ion-text-color);
  --indicator-color: var(--ion-color-primary);
  --indicator-height: 100%;
  --indicator-box-shadow: none;
  --border-radius: 12px;
  --border-width: 0;
  --border-color: transparent;
  --padding-top: 0;
  --padding-bottom: 0;
  margin: 0;
  border-radius: 12px;
  font-family: var(--pl-font-display);
  font-weight: 400;
  font-size: 1.05rem;
  font-synthesis: none;
}
.seg::before {
  display: none;
}
.seg::part(indicator) {
  top: 0;
  bottom: 0;
  padding: 0;
}
.seg::part(indicator-background) {
  height: 100%;
  border-radius: 12px;
  background: var(--ion-color-primary);
}
@media (prefers-reduced-motion: reduce) {
  .seg {
    --indicator-transition: none;
  }
}
.place-heading {
  font-size: 1.625rem;
  line-height: 1.1;
}
.tap {
  min-height: 44px;
}
.toggle {
  min-height: 44px;
  flex: none;
}
.close {
  min-height: 44px;
  min-width: 44px;
  margin: -12px -8px -12px 0;
}
.notice {
  background: rgba(var(--ion-color-primary-rgb), 0.12);
}
.map-slot {
  position: absolute;
  inset: 0;
}
</style>
