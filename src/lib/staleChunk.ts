// SPEC F10: recover open tabs (and the installed app) after a deploy.
// Pages and the map load on demand, and each deploy replaces those files, so
// a tab opened before the deploy asks for files that are gone. Hosting's `**`
// rewrite answers with index.html and the import fails ("Sign in to vote",
// About, the map…). The fix is a full load of the page the user was going to:
// it picks up the new index.html and the new files.
//
// Guarded so a real outage can't reload in a loop: at most one reload per
// RELOAD_GUARD_MS, remembered in sessionStorage. With storage blocked or the
// phone offline it doesn't reload at all (that wouldn't help).

export const STALE_RELOAD_KEY = 'porchlight.staleChunkReloadAt'
export const RELOAD_GUARD_MS = 10_000

/** A failed dynamic import / preload, as each browser words it. */
export function isChunkLoadError(err: unknown): boolean {
  const message =
    typeof err === 'string' ? err : String((err as { message?: unknown } | null | undefined)?.message ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (?:CSS )?chunk \S+ failed|is not a valid JavaScript MIME type/i.test(
    message,
  )
}

export type SessionLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * True if a recovery reload may happen now, and records it. False when one
 * happened less than RELOAD_GUARD_MS ago, or storage is unavailable.
 */
export function claimReload(session: SessionLike | null, now: number): boolean {
  if (!session) return false
  try {
    const last = Number.parseInt(session.getItem(STALE_RELOAD_KEY) ?? '', 10)
    if (Number.isFinite(last) && now - last >= 0 && now - last < RELOAD_GUARD_MS) return false
    session.setItem(STALE_RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export interface ReloadWindow {
  sessionStorage: SessionLike
  navigator: { onLine?: boolean }
  location: { reload(): void; assign(url: string): void }
  setTimeout(fn: () => void, ms: number): unknown
}

function sessionOf(win: ReloadWindow): SessionLike | null {
  try {
    return win.sessionStorage
  } catch {
    return null
  }
}

let scheduled = false
let target: string | null = null

/**
 * Reloads once (see the guard above), to `path` if given — the route the user
 * was navigating to — else the current page. `vite:preloadError` fires before
 * the router's error, so the reload waits a tick for the router to name the
 * target. Returns true if a reload is on its way.
 */
export function recoverFromStaleChunk(path: string | null = null, win: ReloadWindow = window, now = Date.now()): boolean {
  if (path) target = path
  if (scheduled) return true
  if (win.navigator.onLine === false) return false
  if (!claimReload(sessionOf(win), now)) return false
  scheduled = true
  win.setTimeout(() => {
    if (target) win.location.assign(target)
    else win.location.reload()
  }, 0)
  return true
}

/** Test hook. */
export function resetStaleChunkState(): void {
  scheduled = false
  target = null
}
