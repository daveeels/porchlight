<script setup lang="ts">
// SPEC F3/F7: "It's here ✓" / "Not there ✗" in the pin sheet. Signed out, the
// buttons lead to /sign-in. Signed in, the caller's current vote is
// highlighted; a tap moves the highlight at once (rolled back on error) and
// the counts come from castVote's result. Not rendered on your own pin.
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { IonButton, IonIcon } from '@ionic/vue'
import { checkmarkOutline, closeOutline, logInOutline } from 'ionicons/icons'
import { VoteWriteError, toVoteWriteError } from '@/services/voteWrites'
import { useAuthStore } from '@/stores/auth'
import { useVotesStore } from '@/stores/votes'
import type { Pin, VoteValue } from '@/types/models'
import ReportButton from './ReportButton.vue'
import { showToast } from './toast'

const props = withDefaults(
  defineProps<{
    pin: Pin
    /** Show the Report button here (the sheet places it further down instead). */
    report?: boolean
  }>(),
  { report: true },
)
/** The pin is no longer public (hidden or under review): close the sheet. */
const emit = defineEmits<{ gone: [] }>()

const auth = useAuthStore()
const votes = useVotesStore()
const router = useRouter()

const state = computed(() => votes.state(props.pin.id))
const myVote = computed<VoteValue | null>(() => state.value?.myVote ?? null)
const busy = computed(() => !!state.value?.busy)

watch(
  () => [auth.uid, props.pin.id, props.pin.voteRound] as const,
  ([uid]) => {
    if (uid) void votes.load(props.pin)
  },
  { immediate: true },
)

function signIn(): void {
  void router.push('/sign-in')
}

async function cast(value: VoteValue): Promise<void> {
  if (!auth.isSignedIn) return signIn()
  try {
    const { gone } = await votes.vote(props.pin, value)
    if (gone) {
      void showToast("Thanks! This display is now hidden while we take a look.")
      emit('gone')
    }
  } catch (e) {
    const err = e instanceof VoteWriteError ? e : toVoteWriteError(e)
    void showToast(err.message, 'danger')
    if (err.reason === 'NOT_FOUND' || err.reason === 'NOT_VOTABLE') emit('gone')
    else if (err.reason === 'UNAUTHENTICATED') signIn()
  }
}

const statusLine = computed(() => {
  if (myVote.value === 'HERE') return "You said it's here."
  if (myVote.value === 'NOT_THERE') return "You said it's not there."
  return null
})
</script>

<template>
  <section class="flex flex-col gap-2" aria-labelledby="vote-question" data-testid="vote-bar">
    <h3 id="vote-question" class="question pl-display m-0">Did you see it?</h3>
    <div class="grid grid-cols-2 gap-2">
      <ion-button
        class="vote vote-here"
        :class="{ quiet: myVote === 'NOT_THERE' }"
        :fill="myVote === 'HERE' ? 'solid' : 'outline'"
        :disabled="busy"
        :aria-pressed="auth.isSignedIn ? myVote === 'HERE' : undefined"
        :data-selected="myVote === 'HERE' ? 'true' : 'false'"
        data-testid="vote-here"
        @click="cast('HERE')"
      >
        <ion-icon slot="start" :icon="checkmarkOutline" aria-hidden="true" />
        It's here
      </ion-button>
      <ion-button
        class="vote vote-not-there"
        :fill="myVote === 'NOT_THERE' ? 'solid' : 'outline'"
        :disabled="busy"
        :aria-pressed="auth.isSignedIn ? myVote === 'NOT_THERE' : undefined"
        :data-selected="myVote === 'NOT_THERE' ? 'true' : 'false'"
        data-testid="vote-not-there"
        @click="cast('NOT_THERE')"
      >
        <ion-icon slot="start" :icon="closeOutline" aria-hidden="true" />
        Not there
      </ion-button>
    </div>

    <template v-if="!auth.isSignedIn">
      <ion-button fill="clear" class="tap self-center" data-testid="sign-in-to-vote" @click="signIn">
        <ion-icon slot="start" :icon="logInOutline" aria-hidden="true" />
        Sign in to vote
      </ion-button>
    </template>
    <template v-else>
      <p v-if="statusLine" class="pl-muted m-0 text-center text-sm font-bold" role="status" data-testid="my-vote">
        {{ statusLine }}
      </p>
      <p
        v-if="state?.uncounted"
        class="m-0 text-center text-sm"
        role="note"
        data-testid="vote-uncounted"
      >
        Thanks — your vote is saved. Votes from accounts less than a day old aren't added to the count.
      </p>
    </template>

    <ReportButton v-if="report" :pin="pin" @gone="emit('gone')" />
  </section>
</template>

<style scoped>
.question {
  font-size: 1.125rem;
  line-height: 1.2;
}
/* Big rounded sticker buttons. "It's here" is amber (the inviting choice)
   unless you said "Not there"; "Not there" is a surface button that turns
   ember once chosen. Your vote is also pressed in, with a ring. */
.vote {
  --border-radius: 16px;
  --border-width: 0;
  --box-shadow: 0 3px 0 var(--pl-shadow);
  --background: var(--pl-surface);
  --background-hover: var(--ion-text-color);
  --background-hover-opacity: 0.06;
  --color: var(--ion-text-color);
  min-height: 52px;
  margin: 0;
  font-family: var(--pl-font-display);
  font-weight: 400;
  font-size: 1.05rem;
  font-synthesis: none;
  letter-spacing: 0.01em;
}
.vote-here:not(.quiet) {
  --background: var(--ion-color-primary);
  --background-hover: var(--pl-on-primary);
  --color: var(--pl-on-primary);
}
.vote-not-there[data-selected='true'] {
  --background: var(--ion-color-secondary);
  --background-hover: var(--ion-color-secondary-contrast);
  --color: var(--ion-color-secondary-contrast);
}
.vote[data-selected='true'] {
  --box-shadow: 0 1px 0 var(--pl-shadow);
  transform: translateY(2px);
  outline: 2px solid var(--ion-text-color);
  outline-offset: 2px;
  border-radius: 16px;
}
.tap {
  min-height: 44px;
  margin: 0;
}
</style>
