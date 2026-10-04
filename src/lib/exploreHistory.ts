// How Explore's URL-backed overlays use browser history (SPEC F1/F3, §7
// "Back"). Pure helpers; the navigation itself lives in useExploreHistory.
//
// Opening a display's card from inside the app PUSHES one entry
// (`/?…&pin=<id>`), marked with history.state[SHEET_KEY] = <id>; "Show on map"
// leaves one entry `/?…&view=map` marked with history.state[MAP_KEY]. Back
// pops it (card closed / back to the list). Closing the card any other way
// pops our entry too (router.back()), so Back is never needed twice. An
// unmarked ?pin= (a shared link, a sign-in redirect, an email link) is an
// "arrival": its entry is replaced with the plain list URL and the card's
// entry pushed on top, so Back from a deep link closes the card onto the list.
import type { LocationQuery } from 'vue-router'

/** history.state key: this entry was pushed to open the card for this pin id. */
export const SHEET_KEY = 'plSheet'
/** history.state key: this entry was pushed to show the map ("Show on map"). */
export const MAP_KEY = 'plMap'

/** First non-empty string value of a query param. */
export function queryString(v: LocationQuery[string] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

/** The query without the given params. */
export function withoutParams(query: LocationQuery, ...keys: string[]): LocationQuery {
  const out: LocationQuery = {}
  for (const [k, v] of Object.entries(query)) if (!keys.includes(k)) out[k] = v
  return out
}

function stateValue(state: unknown, key: string): unknown {
  return state && typeof state === 'object' ? (state as Record<string, unknown>)[key] : undefined
}

/** This history entry was pushed by the app to open the card for `pinId`. */
export function isSheetEntry(state: unknown, pinId: string | null): boolean {
  return !!pinId && stateValue(state, SHEET_KEY) === pinId
}

/** This history entry was pushed by the app to show the map. */
export function isMapEntry(state: unknown): boolean {
  return stateValue(state, MAP_KEY) === true
}

/** What the Explore URL asks for. `pin` + `view=map` is "show this pin on the map", not the card. */
export function exploreIntent(query: LocationQuery): { pin: string | null; map: boolean } {
  return { pin: queryString(query.pin), map: queryString(query.view) === 'map' }
}

/** The return path for "Sign in to see it on the map": Explore on the map at that pin. */
export function showOnMapPath(pinId: string): string {
  return `/?pin=${encodeURIComponent(pinId)}&view=map`
}
