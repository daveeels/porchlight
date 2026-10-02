<script setup lang="ts">
// SPEC F8: "Report" → reason picker (action sheet) → reportPin → "Thanks,
// we'll take a look." One report per user per pin; afterwards the button
// reads "Reported". Signed out, it leads to /sign-in like the vote buttons.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { IonButton, IonIcon, actionSheetController } from '@ionic/vue'
import { flagOutline } from 'ionicons/icons'
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  VoteWriteError,
  toVoteWriteError,
} from '@/services/voteWrites'
import { useAuthStore } from '@/stores/auth'
import { useTermsStore } from '@/stores/terms'
import { useVotesStore } from '@/stores/votes'
import type { Pin, ReportReason } from '@/types/models'
import { showToast } from './toast'

const props = defineProps<{ pin: Pin }>()
const emit = defineEmits<{ gone: [] }>()

const auth = useAuthStore()
const votes = useVotesStore()
const terms = useTermsStore()
const router = useRouter()

const state = computed(() => votes.state(props.pin.id))
const reported = computed(() => auth.isSignedIn && !!state.value?.reported)
const busy = computed(() => !!state.value?.busy)

function isReason(v: unknown): v is ReportReason {
  return typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v)
}

/** Shows the reason picker; resolves with the chosen reason or null. */
async function pickReason(): Promise<ReportReason | null> {
  const sheet = await actionSheetController.create({
    header: 'Report this display',
    subHeader: "Why shouldn't it be on Porchlight?",
    buttons: [
      ...REPORT_REASONS.map((r) => ({ text: REPORT_REASON_LABELS[r], data: r })),
      { text: 'Cancel', role: 'cancel' },
    ],
  })
  await sheet.present()
  const { data, role } = await sheet.onDidDismiss()
  return role !== 'cancel' && role !== 'backdrop' && isReason(data) ? data : null
}

async function report(): Promise<void> {
  if (!auth.isSignedIn) {
    void router.push('/sign-in')
    return
  }
  if (reported.value || busy.value) return
  // Community rules first (server-enforced).
  if (!(await terms.ensureAgreed())) return
  const reason = await pickReason()
  if (!reason) return
  await send(reason)
}

async function send(reason: ReportReason): Promise<void> {
  try {
    const { gone } = await votes.report(props.pin, reason)
    void showToast("Thanks, we'll take a look.")
    if (gone) emit('gone')
  } catch (e) {
    const err = e instanceof VoteWriteError ? e : toVoteWriteError(e)
    if (err.reason === 'TERMS_REQUIRED') {
      // The rules changed since this device last checked: agree, then send the same report.
      if (await terms.onTermsRequired()) await send(reason)
      return
    }
    void showToast(err.message, err.reason === 'ALREADY_REPORTED' ? undefined : 'danger')
    if (err.reason === 'NOT_FOUND' || err.reason === 'NOT_VOTABLE') emit('gone')
  }
}
</script>

<template>
  <ion-button
    fill="clear"
    color="medium"
    size="small"
    class="tap self-center"
    :disabled="reported || busy"
    data-testid="report"
    @click="report"
  >
    <ion-icon slot="start" :icon="flagOutline" aria-hidden="true" />
    {{ reported ? 'Reported' : 'Report' }}
  </ion-button>
</template>

<style scoped>
.tap {
  min-height: 44px;
  margin: 0;
}
</style>
