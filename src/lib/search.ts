// Place search over the single placeIndex doc (SPEC F1). Runs on the client;
// nothing is queried per keystroke.
import type { PlaceIndex } from '@/types/models'

export interface PlaceResult {
  kind: 'area' | 'town'
  key: string
  label: string
  /** Context line: 'Area' for areas; the area name (else region) for towns. */
  sublabel: string
  count: number
}

/** Lowercase, strip diacritics/macrons (ā → a), collapse whitespace. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** 0 = label starts with q, 1 = a word starts with q, 2 = substring, -1 = no match. */
function matchRank(label: string, q: string): number {
  const n = normalize(label)
  if (n.startsWith(q)) return 0
  if (n.split(/[\s\-/&,()]+/).some((w) => w.startsWith(q))) return 1
  if (n.includes(q)) return 2
  return -1
}

function byRank(a: { rank: number; r: PlaceResult }, b: { rank: number; r: PlaceResult }): number {
  return a.rank - b.rank || b.r.count - a.r.count || a.r.label.localeCompare(b.r.label)
}

function allResults(index: PlaceIndex): { areas: PlaceResult[]; towns: PlaceResult[] } {
  const areas: PlaceResult[] = Object.entries(index.areas ?? {}).map(([key, a]) => ({
    kind: 'area',
    key,
    label: a.area,
    sublabel: 'Area',
    count: a.count,
  }))
  const towns: PlaceResult[] = Object.entries(index.towns ?? {}).map(([key, t]) => ({
    kind: 'town',
    key,
    label: t.town,
    sublabel: (t.areaKey && index.areas?.[t.areaKey]?.area) || t.region,
    count: t.count,
  }))
  return { areas, towns }
}

/**
 * Areas first, then towns; within each, prefix matches before substring
 * matches, then by count. An empty query returns popular places by count.
 */
export function searchPlaces(index: PlaceIndex, query: string, limit = 8): PlaceResult[] {
  const { areas, towns } = allResults(index)
  const q = normalize(query)
  if (!q) {
    const popular = (list: PlaceResult[]) =>
      list.filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    return [...popular(areas), ...popular(towns)].slice(0, limit)
  }
  const ranked = (list: PlaceResult[]) =>
    list
      .map((r) => ({ r, rank: matchRank(r.label, q) }))
      .filter((x) => x.rank >= 0)
      .sort(byRank)
      .map((x) => x.r)
  return [...ranked(areas), ...ranked(towns)].slice(0, limit)
}
