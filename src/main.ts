import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { IonicVue } from '@ionic/vue'
import App from './App.vue'
import { router } from './router'
import { env } from '@/config/env'
import { authDomainRedirect } from '@/lib/hostRedirect'
import { captureInstallPrompt } from '@/lib/installPrompt'
import { defaultSeasonByDate } from '@/lib/seasonDates'
import { recoverFromStaleChunk } from '@/lib/staleChunk'
import { useAuthStore } from '@/stores/auth'
import { SEASON_STORAGE_KEY, useSeasonStore } from '@/stores/season'
import { SEASONS, type Season } from '@/types/models'
// Self-hosted fonts (no Google Fonts: privacy, and the installed app works
// offline). Each file has unicode-range subsets; browsers fetch only the
// ones a page uses (Latin, plus Latin Extended for macrons like ā, ō).
import '@fontsource/lilita-one/400.css'
import '@fontsource/nunito/500.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './theme/tailwind.css'

/** First paint: theme from the saved or by-date season before mount, so the
 *  palette doesn't flash. The season store overrides this once events load. */
function applyInitialTheme(): void {
  let saved: Season | null = null
  try {
    const v = localStorage.getItem(SEASON_STORAGE_KEY)
    if (SEASONS.includes(v as Season)) saved = v as Season
  } catch {
    // Storage blocked: fall back to the date.
  }
  document.documentElement.dataset.season = saved ?? defaultSeasonByDate(new Date()) ?? 'HALLOWEEN'
}

function start(): void {
  applyInitialTheme()
  // A lazy file from before the latest deploy failed to load (Vite's event):
  // reload once. The router's onError names the page if it was a navigation.
  window.addEventListener('vite:preloadError', () => {
    recoverFromStaleChunk()
  })
  // SPEC F10: catch beforeinstallprompt even if it fires before Explore mounts.
  captureInstallPrompt()
  const pinia = createPinia()
  const app = createApp(App).use(IonicVue).use(pinia).use(router)

  // Load config/events → pick the season (sets data-season), and learn the
  // auth state, while the app mounts. Views show loading states until ready.
  void useSeasonStore(pinia).init()
  void useAuthStore(pinia).init()

  router.isReady().then(() => {
    app.mount('#app')
  })
}

const redirect = import.meta.env.DEV ? null : authDomainRedirect(window.location, env.firebase.authDomain)
if (redirect) window.location.replace(redirect)
else start()
