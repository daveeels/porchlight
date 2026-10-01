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
    <h3 id="vote-question" class="m-0 text-base font-semibold">Did you see it?</h3>
    <div class="grid grid-cols-2 gap-2">
      <ion-button
        class="vote"
        :class="{ unselected: myVote !== 'HERE' }"
        color="success"
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
        class="vote"
        :class="{ unselected: myVote !== 'NOT_THERE' }"
        color="danger"
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
      <p v-if="statusLine" class="m-0 text-center text-sm opacity-80" role="status" data-testid="my-vote">
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
.vote {
  min-height: 52px;
  margin: 0;
  font-weight: 600;
}
/* Outline (not chosen): coloured border, but body-colour text — red or green
   text on the dark season backgrounds is too low-contrast to read. */
.vote.unselected::part(native) {
  color: var(--ion-text-color, currentColor);
}
.tap {
  min-height: 44px;
  margin: 0;
}
</style>
