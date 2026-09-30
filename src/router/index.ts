import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import ExplorePage from '@/views/ExplorePage.vue'

// ExplorePage (/) is the root of the Ionic stack and must never be replaced
// (SPEC F2). Share links are redirect routes onto it.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'explore', component: ExplorePage },
  { path: '/a/:areaKey', redirect: (to) => ({ path: '/', query: { area: to.params.areaKey } }) },
  { path: '/t/:townKey', redirect: (to) => ({ path: '/', query: { town: to.params.townKey } }) },
  { path: '/p/:pinId', redirect: (to) => ({ path: '/', query: { pin: to.params.pinId } }) },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundPage.vue') },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
