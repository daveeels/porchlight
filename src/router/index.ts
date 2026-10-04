import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import ExplorePage from '@/views/ExplorePage.vue'
import { isChunkLoadError, recoverFromStaleChunk } from '@/lib/staleChunk'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Signed-in only: others go to /sign-in?redirect=<this route>. */
    requiresAuth?: boolean
  }
}

// ExplorePage (/) is the root of the Ionic stack and must never be replaced
// (SPEC F2). Share links are redirect routes onto it. A card or "Show on map"
// opened in the app pushes a same-route, query-only entry (useExploreHistory):
// IonRouterOutlet reuses the one ExplorePage for those.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'explore', component: ExplorePage },
  { path: '/a/:areaKey', redirect: (to) => ({ path: '/', query: { area: to.params.areaKey } }) },
  { path: '/t/:townKey', redirect: (to) => ({ path: '/', query: { town: to.params.townKey } }) },
  // /p/<id>?view=map opens straight on the map at that display (SPEC F3).
  {
    path: '/p/:pinId',
    redirect: (to) => ({
      path: '/',
      query: to.query.view === 'map' ? { pin: to.params.pinId, view: 'map' } : { pin: to.params.pinId },
    }),
  },
  { path: '/sign-in', name: 'sign-in', component: () => import('@/views/SignInPage.vue') },
  // Email sign-in links land here (SPEC F11).
  { path: '/auth/complete', name: 'auth-complete', component: () => import('@/views/AuthCompletePage.vue') },
  {
    path: '/submit',
    name: 'submit',
    component: () => import('@/views/SubmitPinPage.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/me', name: 'me', component: () => import('@/views/MyPinPage.vue'), meta: { requiresAuth: true } },
  { path: '/about', name: 'about', component: () => import('@/views/AboutPage.vue') },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundPage.vue') },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// SPEC §7: /submit and /me are auth-guarded. Waits for the first auth state
// so a signed-in user opening /me directly isn't bounced to /sign-in.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const auth = useAuthStore()
  await auth.init()
  if (auth.isSignedIn) return true
  return { path: '/sign-in', query: { redirect: to.fullPath } }
})

// After a deploy, an open tab's lazy pages point at files that no longer
// exist. Load the page the user was going to in full (once; see staleChunk).
router.onError((err, to) => {
  if (isChunkLoadError(err)) recoverFromStaleChunk(to.fullPath)
})
