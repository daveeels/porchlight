// SPEC F4: Google refuses to sign in inside apps' built-in browsers
// (Facebook, Instagram, Messenger, …), which is where most of our visitors
// arrive from. Detect them from the user agent so /sign-in can suggest the
// email link and offer a way out to the real browser.

export type MobileOS = 'ios' | 'android' | 'other'

export interface InAppBrowser {
  /** True inside an app's embedded browser (not Safari, Chrome, Samsung Internet…). */
  inApp: boolean
  /** The app's name for messages ("Facebook"), or null if unknown / not in-app. */
  app: string | null
  os: MobileOS
}

/** Checked in order: Messenger and Instagram UAs can also carry Facebook tokens. */
const APPS: ReadonlyArray<{ name: string; test: RegExp }> = [
  { name: 'Messenger', test: /FBAN\/Messenger|FB_IAB\/MESSENGER|MessengerLite|\bOrca-Android\b/i },
  { name: 'Instagram', test: /\bInstagram\b/i },
  { name: 'Facebook', test: /\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b|\bFB4A\b/ },
  { name: 'LinkedIn', test: /LinkedInApp/i },
  { name: 'TikTok', test: /musical_ly|BytedanceWebview|\bTikTok\b|\btrill_\d/i },
  { name: 'Snapchat', test: /\bSnapchat\b/i },
  { name: 'Pinterest', test: /\bPinterest\b/i },
  { name: 'X', test: /\bTwitter(?:Android)?\b/i },
  { name: 'LINE', test: /\bLine\/\d/ },
  { name: 'WeChat', test: /MicroMessenger/i },
]

export function detectOS(ua: string): MobileOS {
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return 'ios'
  if (/\bAndroid\b/.test(ua)) return 'android'
  return 'other'
}

export function detectInAppBrowser(ua: string): InAppBrowser {
  const os = detectOS(ua)
  const app = APPS.find((a) => a.test.test(ua))
  if (app) return { inApp: true, app: app.name, os }
  // Any other app's Android WebView ("; wv)"). Chrome Custom Tabs and TWAs
  // use the real Chrome UA, so they aren't caught here. iOS WKWebViews look
  // like the home-screen app, so unnamed iOS apps can't be told apart.
  if (os === 'android' && /;\s*wv\)/.test(ua)) return { inApp: true, app: null, os }
  return { inApp: false, app: null, os }
}

export interface PageLocation {
  host: string
  pathname: string
  search: string
}

/**
 * Android: opens the same page in Chrome. The hash is dropped because
 * `#Intent` marks the start of the intent's parameters.
 */
export function openInChromeUrl(loc: PageLocation): string {
  return `intent://${loc.host}${loc.pathname}${loc.search}#Intent;scheme=https;package=com.android.chrome;end`
}

/** iPhone (iOS 17+): opens the same page in Safari. Older iOS ignores it. */
export function openInSafariUrl(loc: PageLocation): string {
  return `x-safari-https://${loc.host}${loc.pathname}${loc.search}`
}
