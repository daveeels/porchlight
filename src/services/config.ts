// Public config reads: config/app and the events collection (SPEC §5).
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { LAUNCH_CENTER } from '@/config/areas'
import type { AppConfig, EventId, HolidayEvent } from '@/types/models'
import { db } from './firebase'

export type EventWithId = HolidayEvent & { id: EventId }

export const DEFAULT_APP_CONFIG: AppConfig = {
  mapAccess: 'ACCOUNT',
  launchCenter: { lat: LAUNCH_CENTER.lat, lng: LAUNCH_CENTER.lng, zoom: LAUNCH_CENTER.zoom },
  defaultAreaKey: 'tauranga',
  launchMode: 'BETA',
  feedbackEmail: 'dewetellis@gmail.com',
  donateUrl: 'https://ko-fi.com/dewetellis',
}

/** Only https links are shown; anything else falls back to the default. */
function safeDonateUrl(v: unknown): string | null {
  if (v === null) return null
  return typeof v === 'string' && /^https:\/\//.test(v) ? v : DEFAULT_APP_CONFIG.donateUrl
}

/** config/app merged over the defaults (used as-is if the doc is missing). */
export async function fetchAppConfig(): Promise<AppConfig> {
  const snap = await getDoc(doc(db, 'config', 'app'))
  if (!snap.exists()) return { ...DEFAULT_APP_CONFIG }
  const data = snap.data() as Partial<AppConfig>
  return {
    mapAccess: data.mapAccess ?? DEFAULT_APP_CONFIG.mapAccess,
    launchCenter: data.launchCenter ?? DEFAULT_APP_CONFIG.launchCenter,
    defaultAreaKey:
      data.defaultAreaKey === undefined ? DEFAULT_APP_CONFIG.defaultAreaKey : data.defaultAreaKey,
    launchMode: data.launchMode === 'LIVE' ? 'LIVE' : 'BETA',
    feedbackEmail: data.feedbackEmail || DEFAULT_APP_CONFIG.feedbackEmail,
    donateUrl: data.donateUrl === undefined ? DEFAULT_APP_CONFIG.donateUrl : safeDonateUrl(data.donateUrl),
  }
}

/** Every event doc (a handful at most). */
export async function fetchEvents(): Promise<EventWithId[]> {
  const snap = await getDocs(collection(db, 'events'))
  return snap.docs.map((d) => ({ ...(d.data() as HolidayEvent), id: d.id as EventId }))
}
