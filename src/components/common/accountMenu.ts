// Account menu actions (My display, How Porchlight works, Community rules,
// Send feedback, About & privacy, donate, Sign out) shared by AccountMenuItems.vue (a list, e.g.
// inside a popover) and the header's action sheet (actionSheetButtons()).
import { useRouter } from 'vue-router'
import { toastController, type ActionSheetButton } from '@ionic/vue'
import { env } from '@/config/env'
import { feedbackMailto } from '@/lib/feedback'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { useTermsStore } from '@/stores/terms'
import { useWelcomeStore } from '@/stores/welcome'

export function useAccountMenu() {
  const router = useRouter()
  const auth = useAuthStore()
  const appConfig = useAppConfigStore()
  const terms = useTermsStore()
  const welcome = useWelcomeStore()

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

  /** The welcome cards again (SPEC F14); never opens the rules by itself. */
  function showWelcome(): void {
    welcome.reopen()
  }

  /**
   * Buttons for actionSheetController.create({ buttons }). Actions that move
   * inside the app (a page, a modal, signing out) go through `later`, so the
   * caller can run them once the sheet and its Back history entry are gone;
   * mail and Ko-fi run in the tap itself (a new window needs the tap).
   */
  function actionSheetButtons(later: (action: () => void) => void = (action) => action()): ActionSheetButton[] {
    const inApp = (action: () => void) => () => later(action)
    const buttons: ActionSheetButton[] = [
      { text: 'My display', handler: inApp(() => void router.push('/me')) },
      { text: 'How Porchlight works', handler: inApp(showWelcome) },
      { text: 'Community rules', handler: inApp(showRules) },
      { text: 'Send feedback', handler: sendFeedback },
      { text: 'About & privacy', handler: inApp(() => void router.push('/about')) },
    ]
    if (auth.isAdmin) buttons.push({ text: 'Moderation', handler: inApp(() => void router.push('/admin')) })
    if (donateUrl()) buttons.push({ text: 'Buy a bad decision 🍻', handler: donate })
    if (auth.isSignedIn) buttons.push({ text: 'Sign out', role: 'destructive', handler: inApp(() => void signOut()) })
    buttons.push({ text: 'Cancel', role: 'cancel' })
    return buttons
  }

  return { feedbackHref, sendFeedback, donateUrl, donate, signOut, showRules, showWelcome, actionSheetButtons }
}
