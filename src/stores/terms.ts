// Community rules agreement (SPEC §5 users, §6 TERMS_REQUIRED). After sign-in
// the user's own users/{uid} doc says whether the current rules are agreed.
// If not, the rules modal (TermsModal.vue, mounted once in App.vue) is a gate:
// it stays open until the member agrees or signs out (after the welcome's
// card 4 when that shows first, see setFirstAskHandler / release). Writes that
// need the rules call ensureAgreed() first, and a TERMS_REQUIRED from the
// server opens the modal again (onTermsRequired) so the action can be retried.
// The server is the real check; this store only makes the UI follow it.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { TERMS_VERSION } from '@/config/terms'
import { acceptTerms, acceptTermsErrorMessage, fetchTermsRecord } from '@/services/terms'
import { useAuthStore } from './auth'

export type TermsState = 'unknown' | 'loading' | 'accepted' | 'required' | 'error'
export type TermsModalMode = 'agree' | 'view'

export const useTermsStore = defineStore('terms', () => {
  const auth = useAuthStore()

  const state = ref<TermsState>('unknown')
  const acceptedAt = shallowRef<Date | null>(null)
  const isOpen = ref(false)
  const mode = ref<TermsModalMode>('agree')
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  /** The welcome has taken over the after-sign-in ask and will release() it. */
  const deferred = ref(false)

  /** Callers waiting for the modal's outcome (true = agreed). */
  let waiting: ((agreed: boolean) => void)[] = []
  let loading: Promise<void> | null = null
  /** Bumped when the user changes, so late loads are ignored. */
  let generation = 0
  /**
   * The first-run welcome (SPEC F14) can take over the after-sign-in ask: it
   * shows its own card first, then calls release(). Returns true if it did.
   */
  let firstAskHandler: (() => boolean) | null = null

  function setFirstAskHandler(handler: (() => boolean) | null): void {
    firstAskHandler = handler
  }

  const accepted = computed(() => state.value === 'accepted')
  const needsAgreement = computed(() => auth.isSignedIn && state.value === 'required')

  function settle(agreed: boolean): void {
    const list = waiting
    waiting = []
    for (const resolve of list) resolve(agreed)
  }

  /**
   * Reads users/{uid}; never rejects (state 'error' leaves the decision to the
   * server). firstAsk: the read right after sign-in, where the welcome may
   * take over the ask before the gate opens.
   */
  function load(firstAsk = false): Promise<void> {
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
          if (firstAsk && !isOpen.value && firstAskHandler?.()) deferred.value = true
          acceptedAt.value = null
          state.value = 'required'
          gate()
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

  /** Signed in with the rules not agreed: the agree form is open unless the welcome holds it. */
  function gate(): void {
    if (needsAgreement.value && !deferred.value && !(isOpen.value && mode.value === 'agree')) open('agree')
  }

  /** The welcome is done with the ask (closed, or its cards can't show): open the gate now. */
  function release(): void {
    deferred.value = false
    gate()
  }

  /** Opens the modal to agree; resolves true once agreed, false on "Not now". */
  function requireAgreement(): Promise<boolean> {
    if (!auth.isSignedIn) return Promise.resolve(false)
    deferred.value = false
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

  /**
   * The modal closed (Close in view mode, or signing out). Waiting callers get
   * false. A signed-in member who still has to agree gets the form straight back.
   */
  function dismissed(): void {
    isOpen.value = false
    saveError.value = null
    settle(false)
    gate()
  }

  // Backstop: whatever closed the form, it comes back while agreement is needed.
  watch([needsAgreement, isOpen, deferred], gate)

  // Signed in (or a different user): load; the gate opens if the rules aren't agreed.
  watch(
    () => auth.uid,
    (uid) => {
      generation++
      loading = null
      state.value = 'unknown'
      acceptedAt.value = null
      saveError.value = null
      deferred.value = false
      if (isOpen.value) isOpen.value = false
      settle(false)
      if (uid) void load(true)
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
    deferred,
    saving,
    saveError,
    load,
    ensureAgreed,
    requireAgreement,
    onTermsRequired,
    showRules,
    agree,
    dismissed,
    release,
    setFirstAskHandler,
  }
})
