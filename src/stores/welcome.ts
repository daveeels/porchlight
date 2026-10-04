// First-run welcome (SPEC F14), shown by WelcomeFlow.vue (mounted once in
// App.vue). Three runs:
//  - 'first'  : cards 1–3, once per device, on Explore after it has loaded,
//               only when this page load started on Explore (not on a deep
//               link to /sign-in, /auth/complete, /submit, /about…).
//  - 'member' : card 4 alone, right after a first sign-in whose community
//               rules aren't agreed yet; its button (and Skip) open the rules.
//               The rules store hands its after-sign-in ask to us
//               (setFirstAskHandler), so the two never pop up together.
//  - 'reopen' : "How Porchlight works" (menu / About): cards 1–3, plus 4 when
//               signed in, ending in "Done". Never opens the rules by itself.
// Seen flags live in localStorage; if storage is blocked each run shows at
// most once per page load.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { MEMBER_STEP, VISITOR_STEPS, type WelcomeStep } from '@/config/welcome'
import { useAuthStore } from './auth'
import { useTermsStore } from './terms'

export const WELCOME_SEEN_KEY = 'porchlight.welcome.v1'
export const WELCOME_MEMBER_SEEN_KEY = 'porchlight.welcome.member.v1'

export type WelcomeRun = 'first' | 'member' | 'reopen'

/** Flags seen this page load, used when localStorage throws. */
const seenThisLoad = new Set<string>()

export function hasSeen(key: string): boolean {
  if (seenThisLoad.has(key)) return true
  try {
    return localStorage.getItem(key) === 'seen'
  } catch {
    return false
  }
}

export function markSeen(key: string): void {
  seenThisLoad.add(key)
  try {
    localStorage.setItem(key, 'seen')
  } catch {
    // Storage blocked: remembered for this page load only.
  }
}

/** Test hook: forget the in-memory flags (a new page load). */
export function resetSeenThisLoad(): void {
  seenThisLoad.clear()
}

/** The cards a run shows. */
export function stepsFor(run: WelcomeRun, opts: { signedIn: boolean; withMember?: boolean }): WelcomeStep[] {
  if (run === 'member') return [MEMBER_STEP]
  if (run === 'reopen') return opts.signedIn ? [...VISITOR_STEPS, MEMBER_STEP] : [...VISITOR_STEPS]
  return opts.withMember ? [...VISITOR_STEPS, MEMBER_STEP] : [...VISITOR_STEPS]
}

/** The big button's label on the last card. */
export function finishLabel(run: WelcomeRun, lastStep: WelcomeStep, rulesAfter: boolean): string {
  if (rulesAfter && lastStep === MEMBER_STEP) return 'Next: community rules'
  if (run === 'reopen' || lastStep === MEMBER_STEP) return 'Done'
  return "Let's go"
}

export const useWelcomeStore = defineStore('welcome', () => {
  const auth = useAuthStore()
  const terms = useTermsStore()

  const isOpen = ref(false)
  const run = ref<WelcomeRun>('first')
  const steps = ref<WelcomeStep[]>([])
  const index = ref(0)
  /** Open the community rules once the welcome has closed. */
  const rulesAfter = ref(false)

  /** This page load started on Explore (set once by WelcomeFlow). */
  const landedOnExplore = ref(false)
  /** The first-visit run was already offered this page load. */
  let firstOffered = false
  /** A sign-in's rules ask arrived before the first-visit run opened: hold it for that run. */
  let heldRules = false
  /** …and card 4 joins that run (this device hasn't seen it). */
  let memberPending = false

  const step = computed<WelcomeStep | null>(() => steps.value[index.value] ?? null)
  const isLast = computed(() => index.value >= steps.value.length - 1)
  const buttonLabel = computed(() =>
    isLast.value && step.value ? finishLabel(run.value, step.value, rulesAfter.value) : 'Next',
  )

  /** The first-visit cards are still to come in this page load. */
  function firstVisitPending(): boolean {
    return landedOnExplore.value && !firstOffered && !hasSeen(WELCOME_SEEN_KEY)
  }

  function start(nextRun: WelcomeRun, nextSteps: WelcomeStep[], withRules: boolean): void {
    run.value = nextRun
    steps.value = nextSteps
    index.value = 0
    rulesAfter.value = withRules
    isOpen.value = true
  }

  function setLanding(onExplore: boolean): void {
    landedOnExplore.value = onExplore
  }

  /** Explore has loaded: show cards 1–3 if this device hasn't seen them. True if it opened. */
  function offerFirstVisit(): boolean {
    if (isOpen.value || !firstVisitPending()) return false
    firstOffered = true
    const withMember = memberPending && auth.isSignedIn
    const withRules = heldRules && terms.needsAgreement
    memberPending = false
    heldRules = false
    start('first', stepsFor('first', { signedIn: auth.isSignedIn, withMember }), withRules)
    return true
  }

  /** "How Porchlight works" from the menu or About. */
  function reopen(): void {
    start('reopen', stepsFor('reopen', { signedIn: auth.isSignedIn }), false)
  }

  /**
   * The rules store is about to ask after a sign-in (rules not agreed). Take
   * it over when we have a card to show first, and open the rules after.
   */
  function onFirstAsk(): boolean {
    const memberSeen = hasSeen(WELCOME_MEMBER_SEEN_KEY)
    if (isOpen.value) {
      if (!memberSeen && !steps.value.includes(MEMBER_STEP)) steps.value = [...steps.value, MEMBER_STEP]
      rulesAfter.value = true
      return true
    }
    if (firstVisitPending()) {
      // The visitor cards open once Explore has loaded: card 4 joins them if
      // this device hasn't seen it, and the rules wait so they don't stack.
      memberPending = !memberSeen
      heldRules = true
      return true
    }
    if (memberSeen) return false
    start('member', stepsFor('member', { signedIn: true }), true)
    return true
  }

  function next(): void {
    if (!isOpen.value) return
    if (isLast.value) finish()
    else index.value++
  }

  function back(): void {
    if (isOpen.value && index.value > 0) index.value--
  }

  /** Skip, the last button, or the modal dismissed (Escape): close and remember. */
  function finish(): void {
    if (!isOpen.value) return
    if (run.value !== 'member') markSeen(WELCOME_SEEN_KEY)
    if (steps.value.includes(MEMBER_STEP)) markSeen(WELCOME_MEMBER_SEEN_KEY)
    rulesAfter.value = false
    isOpen.value = false
  }

  /** The modal finished closing: hand the rules back (they open now if still needed). */
  function closed(): void {
    if (isOpen.value) finish()
    if (!heldRules) terms.release()
  }

  /**
   * The first-visit cards won't show soon (left Explore, off-season, config
   * error): don't keep the rules waiting for them.
   */
  function releaseHeldRules(): void {
    if (!heldRules) return
    heldRules = false
    memberPending = false
    terms.release()
  }

  // Signed out (or another user): a held ask belonged to the old account.
  watch(
    () => auth.uid,
    () => {
      heldRules = false
      memberPending = false
    },
  )

  terms.setFirstAskHandler(onFirstAsk)

  return {
    isOpen,
    run,
    steps,
    index,
    step,
    isLast,
    buttonLabel,
    rulesAfter,
    landedOnExplore,
    setLanding,
    offerFirstVisit,
    reopen,
    onFirstAsk,
    releaseHeldRules,
    next,
    back,
    finish,
    closed,
  }
})
