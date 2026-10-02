// Community rules agreement (SPEC §5 users, §6 TERMS_REQUIRED). After sign-in
// the user's own users/{uid} doc says whether the current rules are agreed.
// If not, the rules modal (TermsModal.vue, mounted once in App.vue) opens
// once per session; "Not now" keeps browsing working. Writes that need the
// rules call ensureAgreed() first, and a TERMS_REQUIRED from the server opens
// the modal again (onTermsRequired) so the action can be retried.
// The server is the real check; this store only makes the UI friendlier.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { TERMS_VERSION } from '@/config/terms'
import { acceptTerms, acceptTermsErrorMessage, fetchTermsRecord } from '@/services/terms'
import { useAuthStore } from './auth'

export type TermsState = 'unknown' | 'loading' | 'accepted' | 'required' | 'error'
export type TermsModalMode = 'agree' | 'view'

/** sessionStorage: "Not now" was tapped for this uid, so don't open by itself again this session. */
export const RULES_NOT_NOW_KEY = 'porchlight.rulesNotNow'

function notNowFor(uid: string): boolean {
  try {
    return sessionStorage.getItem(RULES_NOT_NOW_KEY) === uid
  } catch {
    return false
  }
}

function rememberNotNow(uid: string): void {
  try {
    sessionStorage.setItem(RULES_NOT_NOW_KEY, uid)
  } catch {
    // Storage blocked: the modal may open again on the next load.
  }
}

export const useTermsStore = defineStore('terms', () => {
  const auth = useAuthStore()

  const state = ref<TermsState>('unknown')
  const acceptedAt = shallowRef<Date | null>(null)
  const isOpen = ref(false)
  const mode = ref<TermsModalMode>('agree')
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  /** Callers waiting for the modal's outcome (true = agreed). */
  let waiting: ((agreed: boolean) => void)[] = []
  let loading: Promise<void> | null = null
  /** Bumped when the user changes, so late loads are ignored. */
  let generation = 0

  const accepted = computed(() => state.value === 'accepted')
  const needsAgreement = computed(() => auth.isSignedIn && state.value === 'required')

  function settle(agreed: boolean): void {
    const list = waiting
    waiting = []
    for (const resolve of list) resolve(agreed)
  }

  /** Reads users/{uid}; never rejects (state 'error' leaves the decision to the server). */
  function load(): Promise<void> {
    const uid = auth.uid
    if (!uid) return Promise.resolve()
    if (loading) return loading
    const gen = generation
    state.value = 'loading'
    const p = fetchTermsRecord(uid)
      .then((rec) => {
        if (gen !== generation) return
        if (rec.version === TERMS_VERSION) {
          state.value = 'accepted'
          acceptedAt.value = rec.acceptedAt
        } else {
          state.value = 'required'
          acceptedAt.value = null
        }
      })
      .catch(() => {
        if (gen === generation) state.value = 'error'
      })
      .finally(() => {
        if (loading === p) loading = null
      })
    loading = p
    return p
  }

  function open(nextMode: TermsModalMode): void {
    mode.value = nextMode
    saveError.value = null
    isOpen.value = true
  }

  /** Opens the modal to agree; resolves true once agreed, false on "Not now". */
  function requireAgreement(): Promise<boolean> {
    if (!auth.isSignedIn) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      waiting.push(resolve)
      if (!isOpen.value || mode.value !== 'agree') open('agree')
    })
  }

  /** Before a write that needs the rules: true if agreed (or unknown — the server decides). */
  async function ensureAgreed(): Promise<boolean> {
    if (!auth.isSignedIn) return false
    if (state.value === 'unknown' || state.value === 'loading') await load()
    if (state.value !== 'required') return true
    return requireAgreement()
  }

  /** A write came back TERMS_REQUIRED (e.g. the rules changed): ask, then the caller retries. */
  function onTermsRequired(): Promise<boolean> {
    state.value = 'required'
    acceptedAt.value = null
    return requireAgreement()
  }

  /** "Community rules" from the menu or About: read-only once agreed, else the agree form. */
  function showRules(): void {
    open(auth.isSignedIn && !accepted.value ? 'agree' : 'view')
  }

  async function agree(): Promise<boolean> {
    if (saving.value || !auth.uid) return false
    const gen = generation
    saving.value = true
    saveError.value = null
    try {
      const res = await acceptTerms(TERMS_VERSION)
      if (gen !== generation) return false
      state.value = 'accepted'
      acceptedAt.value = res.acceptedAt
      isOpen.value = false
      settle(true)
      return true
    } catch (e) {
      saveError.value = acceptTermsErrorMessage(e)
      return false
    } finally {
      saving.value = false
    }
  }

  /** The modal closed ("Not now", Close, backdrop or Escape). Waiting callers get false. */
  function dismissed(): void {
    const wasAgree = isOpen.value && mode.value === 'agree'
    isOpen.value = false
    saveError.value = null
    if (wasAgree && auth.uid && state.value === 'required') rememberNotNow(auth.uid)
    settle(false)
  }

  // Signed in (or a different user): load, and ask once per session if needed.
  watch(
    () => auth.uid,
    (uid) => {
      generation++
      loading = null
      state.value = 'unknown'
      acceptedAt.value = null
      saveError.value = null
      if (isOpen.value) isOpen.value = false
      settle(false)
      if (!uid) return
      const gen = generation
      void load().then(() => {
        if (gen === generation && state.value === 'required' && !notNowFor(uid) && !isOpen.value) open('agree')
      })
    },
    { immediate: true },
  )

  return {
    state,
    acceptedAt,
    accepted,
    needsAgreement,
    isOpen,
    mode,
    saving,
    saveError,
    load,
    ensureAgreed,
    requireAgreement,
    onTermsRequired,
    showRules,
    agree,
    dismissed,
  }
})
