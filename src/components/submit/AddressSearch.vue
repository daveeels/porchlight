<script setup lang="ts">
// Address search on the add-display location step (SPEC F5). Typing (3+
// characters, 400 ms debounce) asks Photon for up to 6 NZ addresses near the
// launch area; a newer query cancels the older request. Picking one emits
// its point, which only positions the picker map. Nothing typed is stored.
import { onBeforeUnmount, ref } from 'vue'
import { IonItem, IonLabel, IonList, IonSearchbar, IonSpinner } from '@ionic/vue'
import { ADDRESS_MIN_CHARS, type AddressResult } from '@/lib/address'
import { AddressSearchError, isAbort, searchAddresses } from '@/services/addressSearch'
import { useAppConfigStore } from '@/stores/appConfig'

const DEBOUNCE_MS = 400

const emit = defineEmits<{ select: [result: AddressResult] }>()

type Status = 'idle' | 'loading' | 'done' | 'offline' | 'error'

const appConfig = useAppConfigStore()
const query = ref('')
const results = ref<AddressResult[]>([])
const status = ref<Status>('idle')
/** The query the shown results (or message) are for. */
const searched = ref('')

let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | null = null

function cancel(): void {
  clearTimeout(timer)
  controller?.abort()
  controller = null
}

async function run(q: string): Promise<void> {
  const ctrl = new AbortController()
  controller = ctrl
  status.value = 'loading'
  try {
    const found = await searchAddresses(q, { signal: ctrl.signal, near: appConfig.config.launchCenter })
    if (controller !== ctrl) return
    results.value = found
    searched.value = q
    status.value = 'done'
  } catch (e) {
    if (isAbort(e) || controller !== ctrl) return
    results.value = []
    searched.value = q
    status.value = e instanceof AddressSearchError && e.kind === 'offline' ? 'offline' : 'error'
  } finally {
    if (controller === ctrl) controller = null
  }
}

function onInput(value: string | null | undefined): void {
  query.value = value ?? ''
  cancel()
  const q = query.value.trim()
  if (q.length < ADDRESS_MIN_CHARS) {
    results.value = []
    status.value = 'idle'
    return
  }
  timer = setTimeout(() => void run(q), DEBOUNCE_MS)
}

function choose(r: AddressResult): void {
  cancel()
  query.value = r.label
  results.value = []
  status.value = 'idle'
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  emit('select', r)
}

function onEnter(): void {
  const first = results.value[0]
  if (first) choose(first)
}

function onClear(): void {
  cancel()
  query.value = ''
  results.value = []
  status.value = 'idle'
}

onBeforeUnmount(cancel)
</script>

<template>
  <div class="address-search flex flex-col gap-1">
    <ion-searchbar
      :value="query"
      class="pl-search"
      placeholder="Search your address"
      :debounce="0"
      inputmode="search"
      enterkeyhint="search"
      autocomplete="off"
      aria-label="Search your address"
      data-testid="address-search"
      @ion-input="onInput($event.detail.value)"
      @ion-clear="onClear"
      @keyup.enter="onEnter"
    />

    <p v-if="status === 'loading'" class="m-0 flex items-center gap-2 px-1 text-sm pl-muted" role="status">
      <ion-spinner name="dots" class="spinner" /> Searching…
    </p>
    <ion-list
      v-else-if="status === 'done' && results.length"
      lines="none"
      class="dropdown rounded-xl py-0"
      aria-label="Addresses"
      data-testid="address-results"
    >
      <ion-item
        v-for="r in results"
        :key="r.id"
        button
        :detail="false"
        class="result"
        @mousedown.prevent
        @click="choose(r)"
      >
        <ion-label class="ion-text-wrap">
          <span class="block font-bold">{{ r.title }}</span>
          <span v-if="r.detail" class="block text-sm pl-muted">{{ r.detail }}</span>
        </ion-label>
      </ion-item>
    </ion-list>
    <p v-else-if="status === 'done'" class="m-0 px-1 text-sm pl-muted" role="status">
      No addresses found for “{{ searched }}”. Try the street and suburb, or drag the pin on the map.
    </p>
    <p v-else-if="status === 'offline'" class="m-0 px-1 text-sm" role="alert">
      You're offline, so address search isn't available. Use your current location or drag the pin on the map.
    </p>
    <p v-else-if="status === 'error'" class="m-0 px-1 text-sm" role="alert">
      Address search isn't working right now. Use your current location or drag the pin on the map.
    </p>

    <!-- Plain text (links to both are on the About page's Credits). -->
    <p class="attribution m-0 px-1 pl-muted">Address search: Photon / © OpenStreetMap contributors</p>
  </div>
</template>

<style scoped>
/* The searchbar sits in the step's own padding (Explore's has page gutters). */
.pl-search {
  padding: 0;
}
.address-search :deep(.searchbar-clear-button) {
  min-width: 44px;
  min-height: 44px;
  top: 50%;
  transform: translateY(-50%);
}
.address-search :deep(.searchbar-input)::-webkit-search-cancel-button {
  display: none;
  -webkit-appearance: none;
}
.dropdown {
  background: var(--pl-surface);
  border: 1px solid var(--pl-line);
  overflow: hidden;
}
.result {
  --min-height: 48px;
  --background: var(--pl-surface);
}
.spinner {
  width: 20px;
  height: 20px;
}
.attribution {
  font-size: 0.7rem;
  line-height: 1.4;
}
</style>
