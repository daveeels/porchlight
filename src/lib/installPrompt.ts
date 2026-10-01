// SPEC F10: the "Add Porchlight to your home screen" prompt. Shown once there
// has been real use (a 2nd visit, or 3 pins opened) — never on first load,
// never once installed — and hidden for 14 days after a dismissal.
//   Android/Chrome: one-tap install through the captured `beforeinstallprompt`.
//   iPhone/iPad: a 2-step guide (Share → Add to Home Screen) in Safari, and in
//   Chrome/Edge/Firefox on iOS 16.4+ (they can add to the home screen too).
//   Inside an app's browser (Facebook…), where installing is impossible: "open
//   Porchlight in Safari/Chrome first", with the open-in-browser link.
// The pure rules below are unit-tested; the reactive state at the bottom is
// what InstallPrompt.vue uses. Storage can be blocked (private mode, in-app
// browsers), so every access is wrapped and missing storage counts as zero.
import { computed, ref, shallowRef, type ComputedRef } from 'vue'
import { detectInAppBrowser } from '@/lib/inAppBrowser'

export const INSTALL_KEYS = {
  visits: 'porchlight.install.visits',
  pinsOpened: 'porchlight.install.pinsOpened',
  dismissedAt: 'porchlight.install.dismissedAt',
} as const
/** sessionStorage flag: this tab's visit is already counted (reloads don't count). */
export const VISIT_SESSION_KEY = 'porchlight.install.visitCounted'

export const VISITS_THRESHOLD = 2
export const PINS_THRESHOLD = 3
export const DISMISS_DAYS = 14
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

/** Chrome's install event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** How the card offers installation, or null when it mustn't show. */
export type InstallMode = 'native' | 'ios' | 'in-app' | null

// ---------------------------------------------------------------- storage --

function readCount(storage: StorageLike | null, key: string): number {
  try {
    const n = Number.parseInt(storage?.getItem(key) ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function write(storage: StorageLike | null, key: string, value: string): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Counts a visit once per browser session, so reloads and in-app navigation
 * don't add up to a "2nd visit". Returns the visit count.
 */
export function recordVisit(local: StorageLike | null, session: StorageLike | null): number {
  const visits = readCount(local, INSTALL_KEYS.visits)
  try {
    if (session?.getItem(VISIT_SESSION_KEY)) return visits
  } catch {
    // sessionStorage blocked: count this load.
  }
  if (!write(local, INSTALL_KEYS.visits, String(visits + 1))) return visits
  write(session, VISIT_SESSION_KEY, '1')
  return visits + 1
}

/** Counts an opened pin. Returns the new count. */
export function recordPinOpened(local: StorageLike | null): number {
  const pins = readCount(local, INSTALL_KEYS.pinsOpened) + 1
  return write(local, INSTALL_KEYS.pinsOpened, String(pins)) ? pins : pins - 1
}

/** Hides the prompt for DISMISS_DAYS from `now`. */
export function recordDismissal(local: StorageLike | null, now: number): void {
  write(local, INSTALL_KEYS.dismissedAt, String(now))
}

/** True while a dismissal is less than DISMISS_DAYS old. */
export function isDismissed(local: StorageLike | null, now: number): boolean {
  const at = readCount(local, INSTALL_KEYS.dismissedAt)
  return at > 0 && now - at < DISMISS_MS
}

/** 2nd visit, or 3 pins opened. Never true on a first load with no pins opened. */
export function hasRealUse(local: StorageLike | null): boolean {
  return (
    readCount(local, INSTALL_KEYS.visits) >= VISITS_THRESHOLD ||
    readCount(local, INSTALL_KEYS.pinsOpened) >= PINS_THRESHOLD
  )
}

// --------------------------------------------------------------- platform --

/**
 * Safari on iPhone/iPad/iPod, where "Add to Home Screen" installs the PWA.
 * iPadOS reports a Mac UA, so a touch-capable "Macintosh" counts too. Other
 * iOS browsers (Chrome, Firefox, Edge, …) and app browsers are excluded.
 */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const iDevice = /\b(iPhone|iPad|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && maxTouchPoints > 1)
  if (!iDevice) return false
  if (!/\bSafari\//.test(ua) || !/\bVersion\//.test(ua)) return false
  return !/\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|YaBrowser|DuckDuckGo|GSA|Brave)\b/.test(ua)
}

/** iOS [major, minor] from an iPhone/iPad UA ("OS 17_5" → [17, 5]), or null. */
export function iosVersion(ua: string): [number, number] | null {
  if (!/\b(iPhone|iPad|iPod)\b/.test(ua)) return null
  const m = /\bOS (\d+)[_.](\d+)/.exec(ua)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/**
 * Browsers on iPhone/iPad that can "Add to Home Screen" from Share: Safari,
 * and since iOS 16.4 Chrome, Edge and Firefox. In-app browsers never can.
 */
export function canAddToHomeScreenIos(ua: string, maxTouchPoints = 0): boolean {
  if (isIosSafari(ua, maxTouchPoints)) return true
  if (!/\b(CriOS|EdgiOS|FxiOS)\//.test(ua)) return false
  const v = iosVersion(ua)
  return v !== null && (v[0] > 16 || (v[0] === 16 && v[1] >= 4))
}

export interface DisplayEnv {
  matchMedia?: (query: string) => { matches: boolean }
  navigator?: { standalone?: boolean }
}

/** Already running as the installed app (Android/desktop standalone, or iOS home screen). */
export function isStandalone(win: DisplayEnv): boolean {
  try {
    if (win.matchMedia?.('(display-mode: standalone)').matches) return true
    if (win.matchMedia?.('(display-mode: fullscreen)').matches) return true
  } catch {
    // matchMedia unavailable: fall through.
  }
  return win.navigator?.standalone === true
}

export interface InstallContext {
  standalone: boolean
  inAppBrowser: boolean
  installed: boolean
  dismissed: boolean
  realUse: boolean
  /** A captured beforeinstallprompt is waiting. */
  canPrompt: boolean
  /** An iOS browser with "Add to Home Screen" (canAddToHomeScreenIos). */
  iosSafari: boolean
  /** iPhone/iPad or Android: an in-app browser there can hand over to Safari/Chrome. */
  mobile: boolean
}

/** The whole show/hide rule (SPEC F10). */
export function installMode(ctx: InstallContext): InstallMode {
  if (ctx.standalone || ctx.installed || ctx.dismissed || !ctx.realUse) return null
  if (ctx.inAppBrowser) return ctx.mobile ? 'in-app' : null
  if (ctx.canPrompt) return 'native'
  if (ctx.iosSafari) return 'ios'
  return null
}

// ---------------------------------------------------------- reactive state --

function localStore(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const deferred = shallowRef<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
/** Bumped whenever storage-backed inputs change, so `mode` recomputes. */
const tick = ref(0)
let captured = false

/**
 * Starts listening for `beforeinstallprompt` / `appinstalled` and counts this
 * visit. Call once at startup (main.ts) so an early event isn't missed;
 * InstallPrompt.vue also calls it. Safe to call repeatedly.
 */
export function captureInstallPrompt(win: Window = window): void {
  if (captured) return
  captured = true
  win.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's mini-infobar away; we show our own card after real use.
    e.preventDefault()
    deferred.value = e as BeforeInstallPromptEvent
  })
  win.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = null
  })
  recordVisit(localStore(), sessionStore())
  tick.value++
}

/** Call when a pin's details open (InstallPrompt.vue does this from `?pin=`). */
export function notePinOpened(): void {
  recordPinOpened(localStore())
  tick.value++
}

/** "Not now" / close: hide for DISMISS_DAYS. */
export function dismissInstallPrompt(now = Date.now()): void {
  recordDismissal(localStore(), now)
  tick.value++
}

/**
 * Shows Chrome's install dialog (must run in a tap handler). The event can be
 * used once. Declining the dialog counts as a dismissal.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred.value
  if (!e) return 'unavailable'
  deferred.value = null
  try {
    await e.prompt()
    const { outcome } = await e.userChoice
    if (outcome === 'accepted') installed.value = true
    else dismissInstallPrompt()
    return outcome
  } catch {
    return 'unavailable'
  }
}

export function useInstallPrompt(): { mode: ComputedRef<InstallMode> } {
  const mode = computed<InstallMode>(() => {
    void tick.value
    const local = localStore()
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
    const browser = detectInAppBrowser(ua)
    return installMode({
      standalone: isStandalone(window as unknown as DisplayEnv),
      inAppBrowser: browser.inApp,
      mobile: browser.os !== 'other',
      installed: installed.value,
      dismissed: isDismissed(local, Date.now()),
      realUse: hasRealUse(local),
      canPrompt: deferred.value !== null,
      iosSafari: canAddToHomeScreenIos(ua, typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints),
    })
  })
  return { mode }
}

/** Test hook: forget captured events and listeners' state. */
export function resetInstallPromptState(): void {
  deferred.value = null
  installed.value = false
  captured = false
  tick.value++
}
