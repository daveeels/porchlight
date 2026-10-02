// Address search for the add-display location step (SPEC F5) — the ONLY
// place that calls the geocoder (Photon by komoot, no key). It only helps
// position the picker map: what the user types goes to Photon and nowhere
// else, results aren't stored, and only the point the user ends up choosing
// continues into createPin (which offsets it, as always). CLAUDE.md's "no
// geocoding API for storing places" still holds: places come from GeoNames.
import { env } from '@/config/env'
import { parsePhotonResults, photonSearchUrl, type AddressResult } from '@/lib/address'

export type { AddressResult }

export type AddressSearchFailure = 'offline' | 'failed'

export class AddressSearchError extends Error {
  constructor(readonly kind: AddressSearchFailure) {
    super(kind === 'offline' ? "You're offline." : 'Address search failed.')
    this.name = 'AddressSearchError'
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** True for the error fetch throws when its AbortSignal fires. */
export function isAbort(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === 'AbortError'
}

/**
 * Up to 6 NZ addresses for `query`, nearest `near` first. Rejects with
 * AddressSearchError, or with the AbortError when `signal` aborts (a newer
 * query replaced this one).
 */
export async function searchAddresses(
  query: string,
  opts: { signal?: AbortSignal; near?: { lat: number; lng: number } | null } = {},
): Promise<AddressResult[]> {
  if (isOffline()) throw new AddressSearchError('offline')
  let res: Response
  try {
    res = await fetch(photonSearchUrl(env.addressSearchUrl, query, opts.near), {
      signal: opts.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    })
  } catch (e) {
    if (isAbort(e)) throw e
    throw new AddressSearchError(isOffline() ? 'offline' : 'failed')
  }
  if (!res.ok) throw new AddressSearchError('failed')
  try {
    return parsePhotonResults(await res.json())
  } catch (e) {
    if (isAbort(e)) throw e
    throw new AddressSearchError('failed')
  }
}
