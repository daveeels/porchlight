// "Back closes it" for overlays that have no URL of their own (SPEC §7
// "Back"): the report reason picker, the account menu, the welcome cards, the
// community rules, the place-search dropdown and the add-display steps.
//
// Each open overlay owns ONE same-URL history entry, pushed with
// history.pushState and marked in history.state[BACK_KEY]. The phone/browser
// Back button (Android's hardware Back in the installed app is the same
// history) then pops that entry instead of leaving the page, and we close the
// overlay. vue-router sees the pop as a navigation to the same URL (its own
// state fields are copied into ours, so positions stay right) and Ionic
// ignores it (same fullPath), so no page or map is ever created by it.
//
//  - openBackEntry(onBack): push the entry. Back past it calls onBack; return
//    false to stay open (the entry is pushed again: the community rules gate).
//  - entry.close(): the overlay closed another way (button, swipe, Escape).
//    If its entry is on top it is popped (history.back()), so Back never needs
//    pressing twice; otherwise it is left "dead" and the next Back that lands
//    on it skips it.
//  - settled(): await before an in-app navigation that may follow an overlay,
//    so a push/replace never lands on an overlay's entry (pending pops finish
//    first, and a dead entry on top is popped).
//
// All history writes run one at a time through a queue; a pop we make
// ourselves waits for its popstate before the next write.

export const BACK_KEY = 'plBack'
/** Give up waiting for our own popstate (it never fires on some old engines). */
const POP_TIMEOUT_MS = 1000

/** Unique per page load, so entries left from before a reload count as dead. */
const LOAD = Math.random().toString(36).slice(2, 8)

/** Return false to keep the overlay open (its entry is pushed again). */
export type BackHandler = () => boolean | void

export interface BackEntry {
  /** The overlay closed some other way: drop its entry. */
  close(): Promise<void>
}

interface Entry {
  key: string
  seq: number
  onBack: BackHandler
}

let seq = 0
/** Open overlays, in the order their entries were pushed (top last). */
const open: Entry[] = []
let chain: Promise<void> = Promise.resolve()
/** Set while we wait for the popstate of our own history.back(). */
let ownPop: (() => void) | null = null
let listening = false
const watchers = new Set<(count: number) => void>()

function changed(): void {
  for (const fn of watchers) fn(open.length)
}

/**
 * Calls fn with the number of open overlays now and on every change. App.vue
 * turns Ionic's iOS swipe-back off meanwhile: that gesture animates to the
 * previous page and then calls history.back(), which would only pop an
 * overlay's entry and leave the page out of step with the URL.
 */
export function watchOpenCount(fn: (count: number) => void): () => void {
  watchers.add(fn)
  fn(open.length)
  return () => watchers.delete(fn)
}

function keyOf(state: unknown): string | null {
  const v = (state as Record<string, unknown> | null)?.[BACK_KEY]
  return typeof v === 'string' ? v : null
}

/** Order of an entry key: this load's entries by push order, anything else below them all. */
function seqOf(key: string | null): number {
  if (!key) return -1
  const [load, n] = key.split('.')
  return load === LOAD ? Number(n) : -1
}

function currentKey(): string | null {
  try {
    return keyOf(window.history.state)
  } catch {
    return null
  }
}

function enqueue(op: () => Promise<void> | void): Promise<void> {
  const run = chain.then(op)
  chain = run.catch(() => undefined)
  return run
}

/** Lets the router finish the same-URL navigation a pop started. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function pushEntry(e: Entry): void {
  try {
    const state = (window.history.state ?? {}) as Record<string, unknown>
    window.history.pushState({ ...state, [BACK_KEY]: e.key }, '')
  } catch {
    // History API unavailable: Back just behaves as before.
  }
}

/** history.back() that we made ourselves: resolves once its popstate has passed. */
function popOwn(): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      if (ownPop === done) ownPop = null
      resolve()
    }
    const timer = setTimeout(done, POP_TIMEOUT_MS)
    ownPop = done
    try {
      window.history.back()
    } catch {
      done()
    }
  }).then(nextTask)
}

function onPopState(e: PopStateEvent): void {
  if (ownPop) {
    ownPop()
    return
  }
  // The user went back (or forward). Close every overlay whose entry is above
  // where we landed, top first.
  const landed = keyOf(e.state)
  const landedSeq = seqOf(landed)
  const above = open.filter((o) => o.seq > landedSeq).reverse()
  const kept: Entry[] = []
  for (const o of above) {
    let keep = false
    try {
      keep = o.onBack() === false
    } catch (err) {
      console.warn('[back] overlay close failed', err)
    }
    if (keep) kept.unshift(o)
    else open.splice(open.indexOf(o), 1)
  }
  if (kept.length !== above.length) changed()
  if (kept.length) {
    // A gate that can't be closed with Back: put its entry back on top.
    for (const o of kept) pushEntry(o)
    return
  }
  // Landed on an entry whose overlay already closed (or from before a
  // reload): skip it too, after the router has handled this pop.
  if (landed && !open.some((o) => o.key === landed)) {
    setTimeout(() => {
      if (currentKey() === landed && !ownPop) window.history.back()
    }, 0)
  }
}

function listen(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', onPopState)
}

/** Gives an open overlay its history entry, so Back closes it (or, returning false, is ignored). */
export function openBackEntry(onBack: BackHandler): BackEntry {
  listen()
  seq += 1
  const entry: Entry = { key: `${LOAD}.${seq}`, seq, onBack }
  open.push(entry)
  changed()
  void enqueue(() => {
    if (open.includes(entry)) pushEntry(entry)
  })
  let closing: Promise<void> | null = null
  return {
    close() {
      closing ??= closeEntry(entry)
      return closing
    },
  }
}

function closeEntry(entry: Entry): Promise<void> {
  const i = open.indexOf(entry)
  if (i === -1) return enqueue(() => undefined) // Back already took it
  open.splice(i, 1)
  changed()
  return enqueue(async () => {
    if (currentKey() === entry.key) await popOwn()
    // Not on top (something was pushed over it): left dead, skipped by Back.
  })
}

/**
 * Await before an in-app navigation (push/replace) that can follow an
 * overlay: pending pops finish first, and dead entries on top are popped.
 */
export function settled(): Promise<void> {
  return enqueue(async () => {
    for (let i = 0; i < 5; i++) {
      const key = currentKey()
      if (!key || open.some((o) => o.key === key)) return
      await popOwn()
    }
  })
}

/** Number of overlays holding an entry (tests). */
export function openCount(): number {
  return open.length
}

/** Test hook: forget all state (a new page load). */
export function resetBackStackForTests(): void {
  open.length = 0
  chain = Promise.resolve()
  ownPop = null
  changed()
}
