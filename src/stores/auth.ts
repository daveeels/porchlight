import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { signInWithGoogle, signOutUser, watchAuth, type User } from '@/services/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<User | null>(null)
  /** True after the first auth state is known. */
  const ready = ref(false)
  const isSignedIn = computed(() => !!user.value)
  const uid = computed(() => user.value?.uid ?? null)
  let started: Promise<void> | null = null

  /** Starts watching auth (idempotent); resolves once the initial state is known. */
  function init(): Promise<void> {
    if (started) return started
    started = new Promise<void>((resolve) => {
      watchAuth((u) => {
        user.value = u
        ready.value = true
        resolve()
      })
    })
    return started
  }

  /** Call directly from a tap handler (no await before it) or the popup is blocked. */
  function signIn(): Promise<void> {
    return signInWithGoogle()
  }

  function signOut(): Promise<void> {
    return signOutUser()
  }

  return { user, ready, isSignedIn, uid, init, signIn, signOut }
})
