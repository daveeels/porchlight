import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { defaultSeasonByDate, eventIdFor } from '@/lib/seasonDates'
import { SEASONS, type EventId, type Season } from '@/types/models'
import { useAppConfigStore } from './appConfig'

export const SEASON_STORAGE_KEY = 'porchlight.season'

function readSaved(): Season | null {
  try {
    const v = localStorage.getItem(SEASON_STORAGE_KEY)
    return SEASONS.includes(v as Season) ? (v as Season) : null
  } catch {
    return null
  }
}

function writeSaved(season: Season): void {
  try {
    localStorage.setItem(SEASON_STORAGE_KEY, season)
  } catch {
    // Storage blocked (private mode etc.): the choice just isn't remembered.
  }
}

function applyTheme(season: Season | null): void {
  // Off-season keeps the Halloween palette ("See you in October").
  document.documentElement.dataset.season = season ?? 'HALLOWEEN'
}

export const useSeasonStore = defineStore('season', () => {
  const season = ref<Season | null>(null)
  const ready = ref(false)
  const now = ref(new Date())

  const eventId = computed<EventId | null>(() =>
    season.value ? eventIdFor(season.value, now.value) : null,
  )
  /** True once init() ran and no season is usable: show the off-season landing. */
  const offSeason = computed(() => ready.value && season.value === null)

  /**
   * SPEC §3: 0) only usable seasons count; 1) a saved usable choice;
   * 2) the season by date; 3) otherwise off-season. If the by-date season
   * isn't usable but the date is in-season and another season is usable,
   * that one is used (e.g. Nov 8 before the Christmas event exists).
   */
  async function init(at: Date = new Date()): Promise<Season | null> {
    const appConfig = useAppConfigStore()
    await appConfig.load()
    now.value = at
    const usable = (s: Season | null): s is Season => !!s && appConfig.isSeasonUsable(s, at)

    const saved = readSaved()
    const byDate = defaultSeasonByDate(at)
    let chosen: Season | null = null
    if (usable(saved)) chosen = saved
    else if (usable(byDate)) chosen = byDate
    else if (byDate) chosen = SEASONS.find((s) => usable(s)) ?? null

    season.value = chosen
    applyTheme(chosen)
    ready.value = true
    return chosen
  }

  /** The user picked a season in the switcher; remembered for next time. */
  function choose(next: Season): void {
    season.value = next
    now.value = new Date()
    writeSaved(next)
    applyTheme(next)
  }

  return { season, eventId, ready, offSeason, init, choose }
})
