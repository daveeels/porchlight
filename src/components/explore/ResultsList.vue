<script setup lang="ts">
// The area / town / near-me results (SPEC F1). Reads usePinsStore directly;
// the verified-only rule lives in the store (visibleListPins, canLoadMore).
import { computed } from 'vue'
import { IonButton, IonList, IonSpinner } from '@ionic/vue'
import { alertCircleOutline, locateOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import { useSeasonStore } from '@/stores/season'
import { usePinsStore } from '@/stores/pins'
import { SEASON_THEMES } from '@/config/seasons'
import PinCard from './PinCard.vue'

defineProps<{
  /** Name of the selected place, for the empty state. */
  placeName: string
}>()

const emit = defineEmits<{
  select: [id: string]
  /** Near me found nothing: offer the default area instead. */
  browseDefault: []
}>()

const pins = usePinsStore()
const season = useSeasonStore()

const isNearMe = computed(() => pins.selection?.kind === 'nearMe')
const icon = computed(() => (season.season ? SEASON_THEMES[season.season].icon : undefined))
const firstLoad = computed(() => pins.loading && pins.listPins.length === 0)
const hiddenByFilter = computed(
  () => pins.verifiedOnly && pins.visibleListPins.length === 0 && pins.listPins.length > 0,
)
const showCapNote = computed(() => isNearMe.value && (pins.nearMeTruncated || pins.listPins.length >= 100))

function distance(id: string): number | null {
  const p = pins.listPins.find((x) => x.id === id)
  return p ? pins.distanceFromSelection(p) : null
}
</script>

<template>
  <section aria-label="Displays" class="results">
    <StateMessage v-if="firstLoad" loading title="Finding displays…" />

    <StateMessage
      v-else-if="pins.error && pins.listPins.length === 0"
      :icon="alertCircleOutline"
      title="Couldn't load displays"
      error
      message="Check your connection and try again."
    >
      <ion-button class="tap" @click="pins.loadFirstPage()">Try again</ion-button>
    </StateMessage>

    <StateMessage
      v-else-if="hiddenByFilter && !pins.canLoadMore"
      :icon="shieldCheckmarkOutline"
      title="No verified displays yet"
      message="Displays become verified when 3 people say they're really there."
    >
      <ion-button class="tap" fill="outline" @click="pins.verifiedOnly = false">Show all displays</ion-button>
    </StateMessage>

    <StateMessage
      v-else-if="!pins.loading && pins.listPins.length === 0 && isNearMe"
      :icon="locateOutline"
      title="No displays near you yet"
      message="Try searching for a nearby town instead."
    >
      <ion-button class="tap" fill="outline" @click="emit('browseDefault')">Browse all displays</ion-button>
    </StateMessage>

    <StateMessage
      v-else-if="!pins.loading && pins.listPins.length === 0 && pins.selection"
      :emoji="icon"
      :title="`No displays in ${placeName} yet`"
      message="New displays are added every day. Check back soon."
    />

    <template v-else>
      <ion-list lines="full" class="py-0" data-testid="results">
        <PinCard
          v-for="p in pins.visibleListPins"
          :key="p.id"
          :pin="p"
          :distance-km="isNearMe ? distance(p.id) : null"
          @select="emit('select', $event)"
        />
      </ion-list>

      <p v-if="showCapNote" class="px-4 text-center text-sm opacity-80">
        Showing the closest {{ pins.listPins.length }}. Search a town to see more.
      </p>

      <div v-if="pins.error && pins.listPins.length > 0" class="px-4 py-3 text-center">
        <p class="m-0 text-sm">Couldn't load more.</p>
        <ion-button class="tap" fill="clear" @click="pins.loadMore()">Try again</ion-button>
      </div>
      <div v-else-if="pins.canLoadMore" class="px-4 py-3">
        <ion-button expand="block" fill="outline" class="tap" :disabled="pins.loading" @click="pins.loadMore()">
          <ion-spinner v-if="pins.loading" slot="start" name="crescent" />
          {{ pins.loading ? 'Loading…' : 'Load more' }}
        </ion-button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tap {
  min-height: 44px;
}
</style>
