import { env } from '@/config/env'
import type { Season } from '@/types/models'

export interface SeasonTheme {
  label: string
  tagline: string
  /** MapLibre style URL (OpenFreeMap by default; see env.map.styles). */
  mapStyle: string
  /** Marker colors for the map layer; the UI palette lives in theme/variables.css. */
  marker: {
    verified: string
    unverified: string
    cluster: string
    clusterText: string
    /** The pulsing ring around a pin shown with "Show on map" (SPEC F3). */
    highlight: string
  }
  /** Place heading count line: "1 spooky house" / "46 spooky houses". */
  houses: [one: string, other: string]
  /** Emoji used on markers and empty states until custom icons exist. */
  icon: string
}

export const SEASON_THEMES: Record<Season, SeasonTheme> = {
  HALLOWEEN: {
    label: 'Halloween',
    tagline: 'Spooky houses worth the drive',
    mapStyle: env.map.styles.HALLOWEEN,
    marker: { verified: '#ffb547', unverified: '#8a7560', cluster: '#e8743b', clusterText: '#2a1a08', highlight: '#ffb547' },
    houses: ['spooky house', 'spooky houses'],
    icon: '🎃',
  },
  CHRISTMAS: {
    label: 'Christmas',
    tagline: 'Festive lights worth the drive',
    mapStyle: env.map.styles.CHRISTMAS,
    marker: { verified: '#ffd27a', unverified: '#7d8a80', cluster: '#c8463c', clusterText: '#fff7ee', highlight: '#ffd27a' },
    houses: ['festive house', 'festive houses'],
    icon: '🎄',
  },
}
