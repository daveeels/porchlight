// One-shot browser geolocation for "Near me" (SPEC F1).

export type GeolocateError = 'denied' | 'unavailable' | 'unsupported'

export class GeolocateFailure extends Error {
  constructor(readonly kind: GeolocateError) {
    super(kind)
  }
}

export function geolocate(timeoutMs = 10000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocateFailure('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new GeolocateFailure(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}
