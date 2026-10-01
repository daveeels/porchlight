// The `?redirect=` query the auth guard adds when it sends someone to
// /sign-in. Only same-site paths are honoured (no open redirects).

/** The in-app path to return to after sign-in, or null if missing/unsafe. */
export function safeRedirect(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v !== 'string' || !v.startsWith('/')) return null
  // "//host" and "/\host" are protocol-relative URLs in browsers.
  if (v.startsWith('//') || v.startsWith('/\\')) return null
  if (/^\/sign-in(?:[/?#]|$)/.test(v)) return null
  return v
}
