import { env } from '@/config/env'
import type { Season } from '@/types/models'

export interface SeasonTheme {
  label: string
  tagline: string
  mapStyle: string
  /** Marker colors for the map layer; the UI palette lives in theme/variables.css. */
  marker: { verified: string; unverified: string; cluster: string; clusterText: string }
  /** Emoji used on markers and empty states until custom icons exist. */
  icon: string
}

export const SEASON_THEMES: Record<Season, SeasonTheme> = {
  HALLOWEEN: {
    label: 'Halloween',
    tagline: 'Spooky houses worth the drive',
    mapStyle: env.mapbox.styles.HALLOWEEN,
    marker: { verified: '#ff7a1a', unverified: '#9a6a4a', cluster: '#8b5cf6', clusterText: '#ffffff' },
    icon: '🎃',
  },
  CHRISTMAS: {
    label: 'Christmas',
    tagline: 'Festive lights worth the drive',
    mapStyle: env.mapbox.styles.CHRISTMAS,
    marker: { verified: '#c62828', unverified: '#b08a8a', cluster: '#1b7f3b', clusterText: '#ffffff' },
    icon: '🎄',
  },
}
