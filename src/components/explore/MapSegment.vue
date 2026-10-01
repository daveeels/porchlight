<script setup lang="ts">
// The Map segment (SPEC F2). MapView is loaded and created the first time the
// segment is opened while the map is allowed, then kept alive with v-show and
// never destroyed (CLAUDE.md rule 5). Signed out or mapAccess OFF → prompts.
import { computed, defineAsyncComponent, defineComponent, h, ref, shallowRef, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import { alertCircleOutline, lockClosedOutline, mapOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { useMapStore } from '@/stores/map'

/** Automatic retries of the MapView chunk before showing the error state. */
const MAP_CHUNK_RETRIES = 3

/** Shown when the MapView chunk can't be fetched (offline, or a deploy removed it). */
const MapLoadError = defineComponent({
  name: 'MapLoadError',
  setup() {
    return () =>
      h('div', { class: 'flex h-full items-center justify-center' }, [
        h(
          StateMessage,
          {
            icon: alertCircleOutline,
            title: "Couldn't load the map",
            message: 'Check your connection and try again.',
            error: true,
          },
          { default: () => h(IonButton, { style: { minHeight: '44px' }, onClick: reloadMap }, () => 'Try again') },
        ),
      ])
  },
})

const MapLoading = defineComponent({
  name: 'MapLoading',
  setup() {
    return () =>
      h('div', { class: 'flex h-full items-center justify-center' }, [
        h(StateMessage, { title: 'Loading map…', loading: true }),
      ])
  },
})

// A failed async component keeps its rejected request, so "Try again" builds a
// fresh definition and re-keys it. No MapLibre Map exists until MapView loads,
// so this never creates a second map (golden rule 5).
function makeMapView() {
  return defineAsyncComponent({
    loader: () => import('@/components/map/MapView.vue'),
    loadingComponent: MapLoading,
    errorComponent: MapLoadError,
    onError(error, retry, fail, attempts) {
      if (attempts <= MAP_CHUNK_RETRIES) setTimeout(retry, 500 * attempts)
      else {
        console.warn('[map] could not load the map code', error)
        fail()
      }
    },
  })
}

const MapView = shallowRef(makeMapView())
const mapViewKey = ref(0)

function reloadMap(): void {
  MapView.value = makeMapView()
  mapViewKey.value++
}

const props = defineProps<{
  /** The Map segment is selected and the page is on screen. */
  shown: boolean
}>()

const emit = defineEmits<{ selectPin: [id: string] }>()

const appConfig = useAppConfigStore()
const auth = useAuthStore()
const map = useMapStore()

const allowed = computed(() => auth.ready && appConfig.mapAllowed(auth.isSignedIn))
const off = computed(() => appConfig.config.mapAccess === 'OFF')
const active = computed(() => props.shown && allowed.value)
/** Flips to true once and never back: the single map instance for the session. */
const mounted = ref(false)

watch(
  active,
  (a) => {
    if (a) mounted.value = true
    map.setMapVisible(a)
  },
  { immediate: true },
)
</script>

<template>
  <div class="map-segment">
    <div v-if="mounted" v-show="allowed" class="absolute inset-0">
      <component :is="MapView" :key="mapViewKey" :active="active" @select-pin="emit('selectPin', $event)" />
    </div>
    <div v-if="!allowed" class="flex h-full items-center justify-center">
      <StateMessage
        v-if="off"
        :icon="mapOutline"
        title="Map temporarily unavailable"
        message="Use the list to find displays for now."
      />
      <StateMessage
        v-else-if="auth.ready && !auth.isSignedIn"
        :icon="lockClosedOutline"
        title="Sign in to see the map"
        message="The map is free for members. Searching and the list work without an account."
      >
        <ion-button router-link="/sign-in" class="tap">Sign in</ion-button>
      </StateMessage>
      <StateMessage v-else-if="!auth.ready" loading title="Loading…" />
      <StateMessage
        v-else
        :icon="mapOutline"
        title="Map temporarily unavailable"
        message="Use the list to find displays for now."
      />
    </div>
  </div>
</template>

<style scoped>
.map-segment {
  position: absolute;
  inset: 0;
}
.tap {
  min-height: 44px;
}
</style>
