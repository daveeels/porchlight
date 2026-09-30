import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { IonicVue } from '@ionic/vue'
import App from './App.vue'
import { router } from './router'
import './theme/tailwind.css'

// Halloween is the only season at launch (SPEC §3). useSeasonStore takes this
// over in Phase 1.
document.documentElement.dataset.season = 'HALLOWEEN'

const app = createApp(App).use(IonicVue).use(createPinia()).use(router)

router.isReady().then(() => {
  app.mount('#app')
})
