import { describe, expect, it } from 'vitest'
import {
  DISMISS_DAYS,
  INSTALL_KEYS,
  VISIT_SESSION_KEY,
  canAddToHomeScreenIos,
  hasRealUse,
  installMode,
  isDismissed,
  isIosSafari,
  iosVersion,
  isStandalone,
  recordDismissal,
  recordPinOpened,
  recordVisit,
  type InstallContext,
  type StorageLike,
} from '@/lib/installPrompt'

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

/** Storage that throws on every access, like Safari with storage blocked. */
const blocked: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

const DAY = 24 * 60 * 60 * 1000

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadOsSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/123;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5]',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
}

describe('recordVisit (SPEC F10 "2nd visit")', () => {
  it('counts once per browser session', () => {
    const local = memory()
    const session = memory()
    expect(recordVisit(local, session)).toBe(1)
    expect(recordVisit(local, session)).toBe(1) // reload in the same tab
    expect(local.data[INSTALL_KEYS.visits]).toBe('1')
    expect(session.data[VISIT_SESSION_KEY]).toBe('1')

    expect(recordVisit(local, memory())).toBe(2) // a new session
    expect(hasRealUse(local)).toBe(true)
  })

  it('first visit is never "real use"', () => {
    const local = memory()
    recordVisit(local, memory())
    expect(hasRealUse(local)).toBe(false)
  })

  it('counts every load when sessionStorage is blocked', () => {
    const local = memory()
    expect(recordVisit(local, blocked)).toBe(1)
    expect(recordVisit(local, blocked)).toBe(2)
  })

  it('never throws when storage is blocked or missing', () => {
    expect(recordVisit(blocked, blocked)).toBe(0)
    expect(recordVisit(null, null)).toBe(0)
    expect(hasRealUse(blocked)).toBe(false)
    expect(hasRealUse(null)).toBe(false)
  })

  it('ignores junk stored values', () => {
    const local = memory({ [INSTALL_KEYS.visits]: 'abc' })
    expect(recordVisit(local, memory())).toBe(1)
  })
})

describe('recordPinOpened (SPEC F10 "3 pins opened")', () => {
  it('reaches real use on the 3rd pin', () => {
    const local = memory()
    expect(recordPinOpened(local)).toBe(1)
    expect(recordPinOpened(local)).toBe(2)
    expect(hasRealUse(local)).toBe(false)
    expect(recordPinOpened(local)).toBe(3)
    expect(hasRealUse(local)).toBe(true)
  })

  it('never throws when storage is blocked', () => {
    expect(recordPinOpened(blocked)).toBe(0)
    expect(recordPinOpened(null)).toBe(0)
  })
})

describe('dismissal (14 days)', () => {
  it(`hides for ${DISMISS_DAYS} days, then shows again`, () => {
    const local = memory()
    const now = Date.UTC(2026, 9, 10)
    expect(isDismissed(local, now)).toBe(false)
    recordDismissal(local, now)
    expect(isDismissed(local, now)).toBe(true)
    expect(isDismissed(local, now + 13 * DAY)).toBe(true)
    expect(isDismissed(local, now + 14 * DAY)).toBe(false)
  })

  it('treats blocked storage as not dismissed (and never throws)', () => {
    recordDismissal(blocked, 1)
    expect(isDismissed(blocked, 2)).toBe(false)
  })
})

describe('isIosSafari', () => {
  it('accepts iPhone Safari and iPadOS Safari (Mac UA with touch)', () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true)
    expect(isIosSafari(UA.ipadOsSafari, 5)).toBe(true)
  })

  it('rejects desktop Safari, other iOS browsers, in-app browsers and Android', () => {
    expect(isIosSafari(UA.ipadOsSafari, 0)).toBe(false)
    expect(isIosSafari(UA.iphoneChrome)).toBe(false)
    expect(isIosSafari(UA.iphoneFirefox)).toBe(false)
    expect(isIosSafari(UA.iphoneFacebook)).toBe(false)
    expect(isIosSafari(UA.androidChrome)).toBe(false)
    expect(isIosSafari('')).toBe(false)
  })
})

describe('canAddToHomeScreenIos (SPEC F10: iOS 16.4+ browsers can add to the home screen)', () => {
  const chromeOn = (v: string) =>
    `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0.6533.107 Mobile/15E148 Safari/604.1`

  it('reads the iOS version', () => {
    expect(iosVersion(UA.iphoneChrome)).toEqual([18, 5])
    expect(iosVersion(UA.androidChrome)).toBeNull()
  })

  it('accepts Safari, and Chrome / Firefox / Edge on iOS 16.4+', () => {
    expect(canAddToHomeScreenIos(UA.iphoneSafari)).toBe(true)
    expect(canAddToHomeScreenIos(UA.ipadOsSafari, 5)).toBe(true)
    expect(canAddToHomeScreenIos(UA.iphoneChrome)).toBe(true)
    expect(canAddToHomeScreenIos(UA.iphoneFirefox)).toBe(true)
    expect(canAddToHomeScreenIos(chromeOn('16_4'))).toBe(true)
    expect(canAddToHomeScreenIos(chromeOn('17_0'))).toBe(true)
  })

  it('rejects older iOS for other browsers, in-app browsers and Android', () => {
    expect(canAddToHomeScreenIos(chromeOn('16_3'))).toBe(false)
    expect(canAddToHomeScreenIos(chromeOn('15_7'))).toBe(false)
    expect(canAddToHomeScreenIos(UA.iphoneFacebook)).toBe(false)
    expect(canAddToHomeScreenIos(UA.androidChrome)).toBe(false)
  })
})

describe('isStandalone', () => {
  const media = (match: string | null) => (q: string) => ({ matches: q === match })

  it('detects display-mode standalone / fullscreen and iOS navigator.standalone', () => {
    expect(isStandalone({ matchMedia: media('(display-mode: standalone)') })).toBe(true)
    expect(isStandalone({ matchMedia: media('(display-mode: fullscreen)') })).toBe(true)
    expect(isStandalone({ matchMedia: media(null), navigator: { standalone: true } })).toBe(true)
  })

  it('is false in a normal browser tab, or without matchMedia', () => {
    expect(isStandalone({ matchMedia: media('(display-mode: browser)'), navigator: {} })).toBe(false)
    expect(isStandalone({})).toBe(false)
    expect(
      isStandalone({
        matchMedia: () => {
          throw new Error('nope')
        },
      }),
    ).toBe(false)
  })
})

describe('installMode (the SPEC F10 show/hide rule)', () => {
  const base: InstallContext = {
    standalone: false,
    inAppBrowser: false,
    installed: false,
    dismissed: false,
    realUse: true,
    canPrompt: false,
    iosSafari: false,
    mobile: true,
  }

  it('offers one-tap install when Chrome gave us beforeinstallprompt', () => {
    expect(installMode({ ...base, canPrompt: true })).toBe('native')
  })

  it('offers the Share → Add to Home Screen guide on iOS Safari', () => {
    expect(installMode({ ...base, iosSafari: true })).toBe('ios')
  })

  it('shows nothing where install is not possible', () => {
    expect(installMode(base)).toBeNull()
  })

  it('never shows before real use (first load)', () => {
    expect(installMode({ ...base, realUse: false, canPrompt: true })).toBeNull()
    expect(installMode({ ...base, realUse: false, iosSafari: true })).toBeNull()
  })

  it('never shows when installed / standalone, or while dismissed', () => {
    for (const flag of ['standalone', 'installed', 'dismissed'] as const) {
      expect(installMode({ ...base, canPrompt: true, iosSafari: true, [flag]: true })).toBeNull()
      expect(installMode({ ...base, inAppBrowser: true, [flag]: true })).toBeNull()
    }
  })

  it('in an in-app browser on a phone: "open in Safari/Chrome first" (after real use)', () => {
    expect(installMode({ ...base, inAppBrowser: true })).toBe('in-app')
    expect(installMode({ ...base, inAppBrowser: true, canPrompt: true, iosSafari: true })).toBe('in-app')
    expect(installMode({ ...base, inAppBrowser: true, realUse: false })).toBeNull()
    expect(installMode({ ...base, inAppBrowser: true, mobile: false })).toBeNull()
  })
})
