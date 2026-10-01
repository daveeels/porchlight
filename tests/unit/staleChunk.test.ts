import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RELOAD_GUARD_MS,
  STALE_RELOAD_KEY,
  claimReload,
  isChunkLoadError,
  recoverFromStaleChunk,
  resetStaleChunkState,
  type ReloadWindow,
} from '@/lib/staleChunk'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage
}

function fakeWindow(opts: { onLine?: boolean; storage?: Storage | null } = {}) {
  const timers: Array<() => void> = []
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage
  const win = {
    navigator: { onLine: opts.onLine ?? true },
    location: { reload: vi.fn(), assign: vi.fn() },
    setTimeout: vi.fn((fn: () => void) => {
      timers.push(fn)
      return 1
    }),
    get sessionStorage(): Storage {
      if (!storage) throw new Error('SecurityError')
      return storage
    },
  }
  return { win: win as unknown as ReloadWindow & typeof win, timers, storage }
}

beforeEach(() => resetStaleChunkState())

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/SignInPage-abc.js',
    'error loading dynamically imported module: https://x/assets/AboutPage-abc.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/MapSegment-abc.css',
    "'text/html' is not a valid JavaScript MIME type.",
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isChunkLoadError(new Error('Navigation cancelled'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('claimReload', () => {
  it('allows one reload per guard window', () => {
    const s = memoryStorage()
    expect(claimReload(s, 1_000_000)).toBe(true)
    expect(s.getItem(STALE_RELOAD_KEY)).toBe('1000000')
    expect(claimReload(s, 1_000_000 + RELOAD_GUARD_MS - 1)).toBe(false)
    expect(claimReload(s, 1_000_000 + RELOAD_GUARD_MS)).toBe(true)
  })

  it('never reloads without storage (no loop guard)', () => {
    expect(claimReload(null, 1)).toBe(false)
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
    }
    expect(claimReload(throwing, 1)).toBe(false)
  })
})

describe('recoverFromStaleChunk', () => {
  it('loads the route the user was going to (router error after the preload event)', () => {
    const { win, timers } = fakeWindow()
    expect(recoverFromStaleChunk(null, win, 5)).toBe(true) // vite:preloadError
    expect(recoverFromStaleChunk('/sign-in', win, 5)).toBe(true) // router.onError
    expect(win.setTimeout).toHaveBeenCalledTimes(1)
    timers[0]!()
    expect(win.location.assign).toHaveBeenCalledWith('/sign-in')
    expect(win.location.reload).not.toHaveBeenCalled()
  })

  it('reloads the current page when no route is named', () => {
    const { win, timers } = fakeWindow()
    recoverFromStaleChunk(null, win, 5)
    timers[0]!()
    expect(win.location.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload again within the guard window (after the reload)', () => {
    const { win, storage } = fakeWindow()
    recoverFromStaleChunk('/about', win, 5)
    resetStaleChunkState() // the page reloaded
    const again = fakeWindow({ storage })
    expect(recoverFromStaleChunk('/about', again.win, 6)).toBe(false)
    expect(again.win.setTimeout).not.toHaveBeenCalled()
  })

  it('does nothing offline or with storage blocked', () => {
    const offline = fakeWindow({ onLine: false })
    expect(recoverFromStaleChunk('/about', offline.win, 5)).toBe(false)
    const blocked = fakeWindow({ storage: null })
    expect(recoverFromStaleChunk('/about', blocked.win, 5)).toBe(false)
    expect(blocked.win.setTimeout).not.toHaveBeenCalled()
  })
})
