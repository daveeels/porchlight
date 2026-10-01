import { describe, expect, it } from 'vitest'
import { detectInAppBrowser, detectOS, openInChromeUrl, openInSafariUrl } from '@/lib/inAppBrowser'
import { UA } from './userAgents'

describe('detectInAppBrowser (SPEC F4)', () => {
  it.each([
    ['facebookIos', 'Facebook', 'ios'],
    ['facebookAndroid', 'Facebook', 'android'],
    ['messengerIos', 'Messenger', 'ios'],
    ['messengerAndroid', 'Messenger', 'android'],
    ['instagramIos', 'Instagram', 'ios'],
    ['instagramAndroid', 'Instagram', 'android'],
    ['linkedinIos', 'LinkedIn', 'ios'],
    ['tiktokAndroid', 'TikTok', 'android'],
    ['tiktokIos', 'TikTok', 'ios'],
    ['snapchatIos', 'Snapchat', 'ios'],
  ] as const)('%s → in-app %s on %s', (key, app, os) => {
    expect(detectInAppBrowser(UA[key])).toEqual({ inApp: true, app, os })
  })

  it('treats an unnamed Android WebView as in-app', () => {
    expect(detectInAppBrowser(UA.androidWebView)).toEqual({ inApp: true, app: null, os: 'android' })
  })

  it.each([
    ['safariIos', 'ios'],
    ['homeScreenIos', 'ios'],
    ['chromeIos', 'ios'],
    ['chromeAndroid', 'android'],
    ['samsungAndroid', 'android'],
    ['chromeDesktop', 'other'],
    ['safariMac', 'other'],
  ] as const)('%s is a real browser on %s', (key, os) => {
    expect(detectInAppBrowser(UA[key])).toEqual({ inApp: false, app: null, os })
  })

  it('handles an empty user agent', () => {
    expect(detectInAppBrowser('')).toEqual({ inApp: false, app: null, os: 'other' })
    expect(detectOS('')).toBe('other')
  })
})

describe('open-in-browser URLs', () => {
  const loc = {
    host: 'porchlight-nz.firebaseapp.com',
    pathname: '/sign-in',
    search: '?redirect=%2Fsubmit',
  }

  it('Android: Chrome intent for the same page', () => {
    expect(openInChromeUrl(loc)).toBe(
      'intent://porchlight-nz.firebaseapp.com/sign-in?redirect=%2Fsubmit#Intent;scheme=https;package=com.android.chrome;end',
    )
  })

  it('iPhone: x-safari-https for the same page', () => {
    expect(openInSafariUrl(loc)).toBe('x-safari-https://porchlight-nz.firebaseapp.com/sign-in?redirect=%2Fsubmit')
  })

  it('keeps the port on local hosts', () => {
    expect(openInSafariUrl({ host: 'localhost:5173', pathname: '/', search: '' })).toBe(
      'x-safari-https://localhost:5173/',
    )
  })
})
