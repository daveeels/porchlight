import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { eventIdFor, isEventUsable } from '@/lib/seasonDates'
import { DEFAULT_APP_CONFIG, fetchAppConfig, fetchEvents, type EventWithId } from '@/services/config'
import { SEASONS, type AppConfig, type Season } from '@/types/models'

export const useAppConfigStore = defineStore('appConfig', () => {
  const config = ref<AppConfig>({ ...DEFAULT_APP_CONFIG })
  const events = ref<EventWithId[]>([])
  const loaded = ref(false)
  const error = ref<unknown>(null)
  let pending: Promise<void> | null = null

  /** Loads config/app and events once; later calls reuse the result. Never rejects (see error). */
  function load(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    if (pending) return pending
    error.value = null
    pending = Promise.all([fetchAppConfig(), fetchEvents()])
      .then(([c, e]) => {
        config.value = c
        events.value = e
        loaded.value = true
      })
      .catch((e: unknown) => {
        error.value = e
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  /** The event doc a season maps to at `now`, if it exists. */
  function eventFor(season: Season, now = new Date()): EventWithId | null {
    const id = eventIdFor(season, now)
    return events.value.find((e) => e.id === id) ?? null
  }

  function isSeasonUsable(season: Season, now = new Date()): boolean {
    return isEventUsable(eventFor(season, now), now)
  }

  /** Seasons whose current event exists and hasn't expired (SPEC §3 rule 0). */
  const usableSeasons = computed<Season[]>(() => SEASONS.filter((s) => isSeasonUsable(s)))

  /** The season switcher is shown only when more than one season is usable. */
  const showSeasonSwitcher = computed(() => usableSeasons.value.length > 1)

  /** Whether the in-app map may be shown (config/app.mapAccess, SPEC F2). */
  function mapAllowed(signedIn: boolean): boolean {
    switch (config.value.mapAccess) {
      case 'PUBLIC':
        return true
      case 'ACCOUNT':
        return signedIn
      case 'PAID':
        return false // Phase 5
      default:
        return false // 'OFF'
    }
  }

  return {
    config,
    events,
    loaded,
    error,
    load,
    eventFor,
    isSeasonUsable,
    usableSeasons,
    showSeasonSwitcher,
    mapAllowed,
  }
})
