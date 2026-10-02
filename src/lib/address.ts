// Address search results (SPEC F5 location step): Photon request URLs and
// GeoJSON responses → short NZ address rows. Pure, so it's unit-tested; the
// fetch lives in services/addressSearch.ts. Results only position the picker
// map; nothing geocoded is stored.

/** New Zealand (minLon, minLat, maxLon, maxLat), so results stay in NZ. */
export const NZ_BBOX = '166.0,-47.6,179.0,-34.0'
export const ADDRESS_MIN_CHARS = 3
export const ADDRESS_MAX_RESULTS = 6

export interface AddressResult {
  id: string
  /** First line: "12 Ocean Beach Road" (or a place's name). */
  title: string
  /** The rest: "Mount Maunganui, Tauranga". May be empty. */
  detail: string
  /** Everything: "12 Ocean Beach Road, Mount Maunganui, Tauranga". */
  label: string
  lat: number
  lng: number
}

/** The Photon properties we use (all optional). */
export interface PhotonProperties {
  osm_type?: string
  osm_id?: number | string
  name?: string
  housenumber?: string
  street?: string
  district?: string
  locality?: string
  suburb?: string
  city?: string
  county?: string
  state?: string
  country?: string
  countrycode?: string
}

/** Photon /api URL for a query, limited to NZ and biased towards `near`. */
export function photonSearchUrl(base: string, query: string, near?: { lat: number; lng: number } | null): string {
  const url = new URL(base)
  url.searchParams.set('q', query.trim())
  url.searchParams.set('limit', String(ADDRESS_MAX_RESULTS))
  url.searchParams.set('lang', 'en')
  url.searchParams.set('bbox', NZ_BBOX)
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    url.searchParams.set('lat', near.lat.toFixed(4))
    url.searchParams.set('lon', near.lng.toFixed(4))
  }
  return url.toString()
}

/** Lowercased, without macrons/diacritics or extra spaces, for comparing parts. */
function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function text(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t : null
}

/**
 * "house number + street, suburb, city" (a named place first, e.g. a school),
 * without repeats ("Tauranga, Tauranga") and without the country.
 */
export function formatAddress(p: PhotonProperties): { title: string; detail: string; label: string } | null {
  const name = text(p.name)
  const number = text(p.housenumber)
  const street = text(p.street)
  const suburb = text(p.district) ?? text(p.locality) ?? text(p.suburb)
  const city = text(p.city) ?? text(p.county) ?? text(p.state)

  const parts: string[] = []
  if (street) {
    // A named place on a street (a school, a park) keeps its name first.
    if (name && fold(name) !== fold(street)) parts.push(name)
    parts.push(number ? `${number} ${street}` : street)
  } else if (name) {
    parts.push(number ? `${number} ${name}` : name)
  }
  for (const part of [suburb, city]) if (part) parts.push(part)

  const seen = new Set<string>()
  const unique = parts.filter((part) => {
    const key = fold(part)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const [title, ...rest] = unique
  if (!title) return null
  return { title, detail: rest.join(', '), label: unique.join(', ') }
}

/** A Photon GeoJSON FeatureCollection → up to ADDRESS_MAX_RESULTS NZ rows (bad features skipped). */
export function parsePhotonResults(json: unknown): AddressResult[] {
  const features = (json as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return []
  const results: AddressResult[] = []
  const labels = new Set<string>()
  features.forEach((f: unknown, i) => {
    const feature = f as { geometry?: { type?: unknown; coordinates?: unknown }; properties?: unknown } | null
    const coords = feature?.geometry?.coordinates
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coords)) return
    const [lng, lat] = coords as unknown[]
    if (typeof lat !== 'number' || typeof lng !== 'number') return
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return
    const props = (feature.properties ?? {}) as PhotonProperties
    const cc = text(props.countrycode)
    if (cc && cc.toUpperCase() !== 'NZ') return
    const formatted = formatAddress(props)
    if (!formatted) return
    const key = fold(formatted.label)
    if (labels.has(key)) return
    labels.add(key)
    const osm = text(props.osm_type) && text(props.osm_id) ? `${text(props.osm_type)}${text(props.osm_id)}` : `r${i}`
    results.push({ id: osm, ...formatted, lat, lng })
  })
  return results.slice(0, ADDRESS_MAX_RESULTS)
}
