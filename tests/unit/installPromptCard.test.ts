import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { IonicVue } from '@ionic/vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import InstallPrompt from '@/components/install/InstallPrompt.vue'
import { INSTALL_KEYS, resetInstallPromptState } from '@/lib/installPrompt'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBSN/iOS]'

function setUserAgent(ua: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function setStandalone(on: boolean): void {
  window.matchMedia = ((q: string) => ({
    matches: on && q === '(display-mode: standalone)',
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function fakeInstallEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: string }>
  }
  e.prompt = vi.fn(() => Promise.resolve())
  e.userChoice = Promise.resolve({ outcome })
  return e
}

let router: Router

async function mountCard(path = '/') {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(InstallPrompt, { global: { plugins: [IonicVue, router] } })
  await flushPromises()
  return wrapper
}

const card = (w: Awaited<ReturnType<typeof mountCard>>) => w.find('[data-testid="install-prompt"]')

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetInstallPromptState()
  setUserAgent(ANDROID_CHROME)
  setStandalone(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('InstallPrompt.vue (SPEC F10)', () => {
  it('never shows on a first visit, even when Chrome offers install', async () => {
    const w = await mountCard()
    window.dispatchEvent(fakeInstallEvent())
    await flushPromises()
    expect(card(w).exists()).toBe(false)
  })

  it('captures beforeinstallprompt (preventDefault) and shows Install on the 2nd visit', async () => {
    localStorage.setItem(INSTALL_KEYS.visits, '1') // this mount is visit 2
    const w = await mountCard()
    const e = fakeInstallEvent('accepted')
    window.dispatchEvent(e)
    await flushPromises()
    expect(e.defaultPrevented).toBe(true)
    expect(card(w).attributes('data-mode')).toBe('native')

    await w.find('[data-testid="install-button"]').trigger('click')
    await flushPromises()
    expect(e.prompt).toHaveBeenCalledTimes(1)
    expect(card(w).exists()).toBe(false) // accepted → installed
  })

  it('declining Chrome\'s dialog counts as a dismissal', async () => {
    localStorage.setItem(INSTALL_KEYS.visits, '1')
    const w = await mountCard()
    window.dispatchEvent(fakeInstallEvent('dismissed'))
    await flushPromises()
    await w.find('[data-testid="install-button"]').trigger('click')
    await flushPromises()
    expect(card(w).exists()).toBe(false)
    expect(localStorage.getItem(INSTALL_KEYS.dismissedAt)).not.toBeNull()
  })

  it('shows after the 3rd pin is opened in the first visit', async () => {
    const w = await mountCard('/?pin=a_HALLOWEEN_2026')
    window.dispatchEvent(fakeInstallEvent())
    await router.replace('/?pin=b_HALLOWEEN_2026')
    await router.replace('/') // closing the sheet doesn't count
    await router.replace('/?pin=b_HALLOWEEN_2026') // reopening the same pin doesn't either
    await flushPromises()
    expect(card(w).exists()).toBe(false)
    await router.replace('/?pin=c_HALLOWEEN_2026')
    await flushPromises()
    expect(localStorage.getItem(INSTALL_KEYS.pinsOpened)).toBe('3')
    expect(card(w).exists()).toBe(true)
  })

  it('shows the Share → Add to Home Screen guide on iPhone Safari', async () => {
    setUserAgent(IPHONE_SAFARI)
    localStorage.setItem(INSTALL_KEYS.visits, '1')
    const w = await mountCard()
    expect(card(w).attributes('data-mode')).toBe('ios')
    // One compact row until "How?" is tapped.
    expect(card(w).text()).not.toContain('Add to Home Screen')
    await w.find('[data-testid="install-how"]').trigger('click')
    expect(card(w).text()).toContain('Share')
    expect(card(w).text()).toContain('Add to Home Screen')
  })

  it('in an in-app browser: points to Safari first, with the open-in-Safari link for this page', async () => {
    setUserAgent(IPHONE_FACEBOOK)
    localStorage.setItem(INSTALL_KEYS.visits, '5')
    const w = await mountCard('/?town=tauranga')
    expect(card(w).attributes('data-mode')).toBe('in-app')
    await w.find('[data-testid="install-how"]').trigger('click')
    expect(card(w).text()).toContain('Open Porchlight in Safari first')
    const open = w.find('[data-testid="install-open-browser"]').element as HTMLElement & { href?: string }
    expect(open.href).toMatch(/^x-safari-https:\/\//)
  })

  it('never shows when already installed (display-mode: standalone)', async () => {
    setStandalone(true)
    localStorage.setItem(INSTALL_KEYS.visits, '5')
    const w = await mountCard()
    window.dispatchEvent(fakeInstallEvent())
    await flushPromises()
    expect(card(w).exists()).toBe(false)
  })

  it('dismiss hides it for 14 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
    setUserAgent(IPHONE_SAFARI)
    localStorage.setItem(INSTALL_KEYS.visits, '1')
    let w = await mountCard()
    await w.find('ion-button[aria-label="Dismiss"]').trigger('click')
    await flushPromises()
    expect(card(w).exists()).toBe(false)
    w.unmount()

    vi.setSystemTime(new Date('2026-10-23T08:00:00Z')) // 13 days later
    resetInstallPromptState()
    sessionStorage.clear()
    w = await mountCard()
    expect(card(w).exists()).toBe(false)
    w.unmount()

    vi.setSystemTime(new Date('2026-10-24T08:00:01Z')) // 14 days later
    resetInstallPromptState()
    sessionStorage.clear()
    w = await mountCard()
    expect(card(w).exists()).toBe(true)
  })
})
