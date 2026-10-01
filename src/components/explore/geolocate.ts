// One-shot browser geolocation for "Near me" (SPEC F1) and the add-display
// location picker (SPEC F5).

export type GeolocateError = 'denied' | 'unavailable' | 'unsupported'

export class GeolocateFailure extends Error {
  constructor(readonly kind: GeolocateError) {
    super(kind)
  }
}

export interface GeolocateResult {
  lat: number
  lng: number
  /** Reported accuracy radius in metres (Infinity if the browser gives none). */
  accuracyM: number
}

/** "Near me": a quick, coarse fix is plenty, and a recent one is fine. */
export const NEAR_ME_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }

/** Placing a display: the house itself, so a fresh, precise fix (GPS on phones). */
export const PRECISE_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }

export function geolocate(options: PositionOptions = NEAR_ME_OPTIONS): Promise<GeolocateResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocateFailure('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : Infinity,
        }),
      (err) => reject(new GeolocateFailure(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      options,
    )
  })
}
