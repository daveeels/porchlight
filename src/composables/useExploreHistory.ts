// Explore's card and "Show on map" history (SPEC F1/F3, §7 "Back"; rules in
// src/lib/exploreHistory.ts). Every entry here is the same route (`/`) with a
// different query, pushed through Ionic with direction 'none': IonRouterOutlet
// only builds a view when the matched route or the path changes, so a
// query-only push reuses the one ExplorePage (and its one MapLibre map), and
// 'none' gives no page transition and no swipe-back target.
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { useIonRouter } from '@ionic/vue'
import { settled } from '@/lib/backStack'
import { MAP_KEY, SHEET_KEY, isMapEntry, isSheetEntry, queryString, withoutParams } from '@/lib/exploreHistory'
import { useMapStore } from '@/stores/map'
import { usePinsStore } from '@/stores/pins'
import type { Pin } from '@/types/models'

/** Wait at most this long for a navigation we started to finish. */
const NAV_TIMEOUT_MS = 2000

function historyState(): unknown {
  try {
    return window.history.state
  } catch {
    return null
  }
}

export function useExploreHistory() {
  const route = useRoute()
  const router = useRouter()
  const ionRouter = useIonRouter()
  const pins = usePinsStore()
  const mapStore = useMapStore()

  /** Push `/` with this query: one new history entry, same ExplorePage, no transition. */
  function pushQuery(query: LocationQuery, state: Record<string, string | boolean | null>): Promise<void> {
    return new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer)
        stop()
        resolve()
      }
      const timer = setTimeout(finish, NAV_TIMEOUT_MS)
      const stop = router.afterEach(finish)
      ionRouter.navigate({ path: '/', query, state }, 'none', 'push')
    })
  }

  async function replaceQuery(query: LocationQuery, state: Record<string, string | boolean | null>): Promise<void> {
    await router.replace({ path: '/', query, state })
  }

  /** Opens a card from inside the app: one entry, so Back closes it. */
  async function openPin(id: string): Promise<void> {
    await settled()
    const current = queryString(route.query.pin)
    if (current === id) return
    const query = { ...route.query, pin: id }
    // Another card is already showing on its own entry: swap it, don't stack.
    if (current && isSheetEntry(historyState(), current)) await replaceQuery(query, { [SHEET_KEY]: id })
    else await pushQuery(query, { [SHEET_KEY]: id })
  }

  /** The card closed (swipe, Escape, close, hidden by a vote): pop its entry, or drop ?pin. */
  async function closePin(): Promise<void> {
    void pins.selectPin(null)
    await settled()
    if (route.name !== 'explore') return
    const pin = queryString(route.query.pin)
    if (!pin) return
    if (isSheetEntry(historyState(), pin)) router.back()
    else await replaceQuery(withoutParams(route.query, 'pin'), { [SHEET_KEY]: null })
  }

  /**
   * "Show on map" from the card (SPEC F3). From the list, the card's entry
   * becomes the map's (`?view=map`), so Back from the map returns to the list
   * where the user was. Already on the map: just close the card.
   */
  async function showOnMap(pin: Pin, onMap: boolean): Promise<void> {
    mapStore.focusPin(pin)
    if (onMap) {
      await closePin()
      return
    }
    void pins.selectPin(null)
    await settled()
    const base = withoutParams(route.query, 'pin', 'view')
    const mapQuery = { ...base, view: 'map' }
    if (isSheetEntry(historyState(), queryString(route.query.pin))) {
      await replaceQuery(mapQuery, { [SHEET_KEY]: null, [MAP_KEY]: true })
    } else {
      await replaceQuery(base, { [SHEET_KEY]: null, [MAP_KEY]: null })
      await pushQuery(mapQuery, { [MAP_KEY]: true })
    }
  }

  /** List tapped while on a "Show on map" entry: Back to the list's entry (or drop ?view). */
  async function leaveMap(): Promise<void> {
    await settled()
    if (queryString(route.query.view) !== 'map') return
    if (isMapEntry(historyState())) router.back()
    else await replaceQuery(withoutParams(route.query, 'view'), { [MAP_KEY]: null })
  }

  /**
   * An unmarked `?pin=` (shared link, sign-in redirect, email link): replace
   * it with the plain list URL and push the card (or, with toMap, the map at
   * that pin) on top, so the first Back lands on the list, not out of the app.
   */
  async function arrive(pinId: string, toMap: boolean): Promise<void> {
    const base = withoutParams(route.query, 'pin', 'view')
    await replaceQuery(base, { [SHEET_KEY]: null, [MAP_KEY]: null })
    if (toMap) {
      const pin = await pins.getPin(pinId).catch(() => null)
      if (pin) {
        mapStore.focusPin(pin)
        await pushQuery({ ...base, view: 'map' }, { [MAP_KEY]: true })
        return
      }
      // Missing or hidden: the card explains ("This display isn't available").
    }
    await pushQuery({ ...base, pin: pinId }, { [SHEET_KEY]: pinId })
  }

  return { openPin, closePin, showOnMap, leaveMap, arrive }
}
