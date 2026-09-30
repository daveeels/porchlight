// Client copy of functions/data/areas.json (SPEC §5 "Place data").
// Keep the two in sync.

export interface Area {
  key: string
  name: string
  center: { lat: number; lng: number }
  radiusKm: number
}

export const AREAS: readonly Area[] = [
  {
    key: 'tauranga',
    name: 'Tauranga & surrounds',
    center: { lat: -37.7, lng: 176.2 },
    radiusKm: 30,
  },
]

export const LAUNCH_CENTER = { lat: -37.6878, lng: 176.1651, zoom: 11 } as const
