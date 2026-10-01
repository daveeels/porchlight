// SPEC F4: serve the app from the same domain as Firebase's authDomain, or
// third-party storage blocking (Safari, Chrome) can break signInWithPopup.
// Hosting also answers on <project>.web.app; send those visitors across.

export interface LocationLike {
  host: string
  hostname: string
  pathname: string
  search: string
  hash: string
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1']

/**
 * The URL to `location.replace` to, or null to stay. Never redirects local
 * previews or the offline demo project (its authDomain doesn't exist).
 */
export function authDomainRedirect(loc: LocationLike, authDomain: string): string | null {
  const target = authDomain.trim().toLowerCase()
  if (!target || target.startsWith('demo-')) return null
  if (LOCAL_HOSTS.includes(loc.hostname.toLowerCase())) return null
  if (loc.host.toLowerCase() === target) return null
  return `https://${target}${loc.pathname}${loc.search}${loc.hash}`
}
