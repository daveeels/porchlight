// Account menu actions (My display, Community rules, Send feedback, About &
// privacy, donate, Sign out) shared by AccountMenuItems.vue (a list, e.g.
// inside a popover) and the header's action sheet (actionSheetButtons()).
import { useRouter } from 'vue-router'
import { toastController, type ActionSheetButton } from '@ionic/vue'
import { env } from '@/config/env'
import { feedbackMailto } from '@/lib/feedback'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { useTermsStore } from '@/stores/terms'

export function useAccountMenu() {
  const router = useRouter()
  const auth = useAuthStore()
  const appConfig = useAppConfigStore()
  const terms = useTermsStore()

  /** mailto: for "Send feedback", built when tapped so the URL is current. */
  function feedbackHref(): string {
    return feedbackMailto(appConfig.config.feedbackEmail, {
      url: window.location.href,
      version: env.appVersion,
      userAgent: navigator.userAgent,
      screen: `${window.screen.width}×${window.screen.height} (window ${window.innerWidth}×${window.innerHeight}, dpr ${window.devicePixelRatio})`,
      signedIn: auth.isSignedIn,
    })
  }

  function sendFeedback(): void {
    window.location.href = feedbackHref()
  }

  /** The Ko-fi page (config/app.donateUrl), or null when donations are off. */
  function donateUrl(): string | null {
    return appConfig.config.donateUrl
  }

  function donate(): void {
    const url = donateUrl()
    if (url) window.open(url, '_blank', 'noopener')
  }

  async function signOut(): Promise<void> {
    try {
      await auth.signOut()
    } catch {
      const t = await toastController.create({ message: "Couldn't sign out. Try again.", duration: 2500 })
      await t.present()
    }
  }

  /** The community rules modal: read-only once agreed (with the date), else the agree form. */
  function showRules(): void {
    terms.showRules()
  }

  /** Buttons for actionSheetController.create({ buttons }). */
  function actionSheetButtons(): ActionSheetButton[] {
    const buttons: ActionSheetButton[] = [
      { text: 'My display', handler: () => void router.push('/me') },
      { text: 'Community rules', handler: showRules },
      { text: 'Send feedback', handler: sendFeedback },
      { text: 'About & privacy', handler: () => void router.push('/about') },
    ]
    if (donateUrl()) buttons.push({ text: 'Buy a bad decision 🍻', handler: donate })
    if (auth.isSignedIn) buttons.push({ text: 'Sign out', role: 'destructive', handler: () => void signOut() })
    buttons.push({ text: 'Cancel', role: 'cancel' })
    return buttons
  }

  return { feedbackHref, sendFeedback, donateUrl, donate, signOut, showRules, actionSheetButtons }
}
