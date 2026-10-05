<script setup lang="ts">
// /admin — Moderation (admins only; the moderatePin callable enforces it).
// Hidden displays, displays with reports that are still showing, ones the
// owner deleted while reported, and ones an admin removed. Each shows the
// report reasons; actions go through moderatePin (same as `npm run moderate`).
import { computed, ref, shallowRef } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
  toastController,
  type RefresherCustomEvent,
} from '@ionic/vue'
import { alertCircleOutline, checkmarkCircleOutline, shieldOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import ComingSoonArt from '@/components/pin/ComingSoonArt.vue'
import { summariseReports } from '@/lib/moderation'
import {
  fetchModerationQueue,
  fetchReports,
  moderatePin,
  type ModerationAction,
  type PinReport,
  type QueueItem,
  type QueueKind,
} from '@/services/moderation'
import { useAuthStore } from '@/stores/auth'
import { useSeasonStore } from '@/stores/season'

const auth = useAuthStore()
const season = useSeasonStore()

const items = shallowRef<QueueItem[]>([])
const reports = ref<Record<string, PinReport[]>>({})
const loading = ref(false)
const error = ref(false)
const busyId = ref<string | null>(null)

const SECTIONS: { kind: QueueKind; title: string; hint: string }[] = [
  { kind: 'HIDDEN', title: 'Hidden', hint: 'Taken off the list automatically. Decide: looks fine, or remove.' },
  { kind: 'REPORTED', title: 'Reported, still showing', hint: "Fewer reports than it takes to hide. Have a peek." },
  { kind: 'OWNER_DELETED', title: 'Deleted by the owner while reported', hint: 'Photo kept for you. Remove to delete it.' },
  { kind: 'REMOVED', title: 'Removed by an admin', hint: 'Restore if it was a mistake (the photo is gone).' },
]

const sections = computed(() =>
  SECTIONS.map((s) => ({ ...s, items: items.value.filter((i) => i.kind === s.kind) })).filter((s) => s.items.length),
)
const needsLook = computed(() => items.value.filter((i) => i.kind === 'HIDDEN' || i.kind === 'REPORTED').length)

async function load(): Promise<void> {
  await auth.init()
  if (!auth.isAdmin || !season.eventId) return
  loading.value = true
  error.value = false
  try {
    const list = await fetchModerationQueue(season.eventId)
    items.value = list
    const entries = await Promise.all(
      list.map(async (i) => [i.pin.id, await fetchReports(i.pin.id).catch(() => [])] as const),
    )
    reports.value = Object.fromEntries(entries)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onIonViewWillEnter(() => void load())

async function refresh(ev: RefresherCustomEvent): Promise<void> {
  await load()
  await ev.target.complete()
}

function why(item: QueueItem): string {
  const p = item.pin
  const r = reports.value[p.id] ?? []
  const counted = r.filter((x) => x.counted).length
  const parts: string[] = []
  if (r.length) parts.push(`${r.length} ${r.length === 1 ? 'report' : 'reports'}${counted < r.length ? ` (${counted} counted)` : ''}: ${summariseReports(r.map((x) => x.reason))}`)
  if (p.status === 'HIDDEN' && p.hiddenReason === 'NOT_THERE') {
    parts.push(`"Not there" ${p.notThereVotes} vs "It's here" ${p.hereVotes}`)
  }
  if (!parts.length && p.reportsCount > 0) parts.push(`${p.reportsCount} counted reports`)
  return parts.join(' · ') || 'No reports on record'
}

const CONFIRM: Partial<Record<ModerationAction, { header: string; message: string; button: string }>> = {
  REMOVE: {
    header: 'Remove this display?',
    message: "It's taken down and its photo deleted. The owner can't add another this season.",
    button: 'Remove',
  },
  BAN_USER: {
    header: 'Ban the owner?',
    message: 'Their account is disabled and signed out, and all their displays are removed.',
    button: 'Ban',
  },
  RESTORE: {
    header: 'Restore this display?',
    message: 'It goes back on the list. Its photo was deleted when it was removed, so it shows without one.',
    button: 'Restore',
  },
}

const DONE: Record<ModerationAction, string> = {
  APPROVE: 'Marked as fine. Reports cleared.',
  REMOVE: 'Display removed.',
  RESTORE: 'Display restored.',
  BAN_USER: 'Owner banned.',
}

async function act(item: QueueItem, action: ModerationAction): Promise<void> {
  const c = CONFIRM[action]
  if (c) {
    const alert = await alertController.create({
      header: c.header,
      message: c.message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: c.button, role: action === 'RESTORE' ? 'confirm' : 'destructive' },
      ],
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    if (role === 'cancel' || role === 'backdrop') return
  }
  busyId.value = item.pin.id
  let message = DONE[action]
  try {
    await moderatePin(item.pin.id, action)
    await load()
  } catch (e) {
    message = (e as { message?: string }).message || "Couldn't do that. Try again."
  } finally {
    busyId.value = null
  }
  const t = await toastController.create({ message, duration: 2500, position: 'bottom' })
  await t.present()
}

function openPhoto(url: string | null): void {
  if (url) window.open(url, '_blank', 'noopener')
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" class="back" />
        </ion-buttons>
        <ion-title>Moderation</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher v-if="auth.isAdmin" slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="mx-auto flex max-w-lg flex-col gap-4 pb-8">
        <StateMessage
          v-if="auth.ready && !auth.isAdmin"
          :icon="shieldOutline"
          title="Admins only"
          message="This page is for Porchlight's moderators."
        />
        <StateMessage v-else-if="loading && !items.length" loading title="Loading…" />
        <StateMessage
          v-else-if="error"
          :icon="alertCircleOutline"
          title="Couldn't load the queue"
          message="Check your connection and try again."
          error
        >
          <ion-button class="tap" @click="load">Try again</ion-button>
        </StateMessage>
        <StateMessage
          v-else-if="!items.length"
          :icon="checkmarkCircleOutline"
          title="Nothing to review"
          message="No hidden or reported displays this season."
        />

        <template v-else>
          <p class="m-0 text-sm pl-muted" data-testid="admin-summary">
            {{ needsLook ? `${needsLook} to look at` : 'Nothing waiting' }} · pull down to refresh
          </p>

          <section v-for="s in sections" :key="s.kind" class="flex flex-col gap-3" :data-testid="`admin-${s.kind}`">
            <div>
              <h2 class="pl-display m-0 text-xl">{{ s.title }} ({{ s.items.length }})</h2>
              <p class="m-0 text-xs pl-muted">{{ s.hint }}</p>
            </div>

            <article v-for="item in s.items" :key="item.pin.id" class="card overflow-hidden rounded-xl" data-testid="admin-item">
              <button type="button" class="photo-btn" :aria-label="`Open the photo of ${item.pin.title}`" @click="openPhoto(item.pin.photoUrl)">
                <img v-if="item.pin.thumbUrl" :src="item.pin.thumbUrl" alt="" class="photo" />
                <span v-else class="photo block"><ComingSoonArt /></span>
              </button>
              <div class="flex flex-col gap-1 p-3">
                <h3 class="m-0 text-base font-extrabold break-words">{{ item.pin.title }}</h3>
                <p class="m-0 text-xs pl-muted">{{ item.pin.place.town }} · {{ item.pin.id.split('_')[0]?.slice(0, 6) }}…</p>
                <p v-if="item.pin.description" class="m-0 text-sm whitespace-pre-line break-words">{{ item.pin.description }}</p>
                <p class="why m-0 text-sm font-bold">{{ why(item) }}</p>

                <div class="mt-2 flex flex-wrap gap-2">
                  <template v-if="item.kind === 'HIDDEN' || item.kind === 'REPORTED'">
                    <ion-button size="small" class="m-0" :disabled="busyId === item.pin.id" @click="act(item, 'APPROVE')">
                      Looks fine
                    </ion-button>
                    <ion-button size="small" color="danger" class="m-0" :disabled="busyId === item.pin.id" @click="act(item, 'REMOVE')">
                      Remove
                    </ion-button>
                    <ion-button size="small" fill="clear" color="danger" class="m-0" :disabled="busyId === item.pin.id" @click="act(item, 'BAN_USER')">
                      Ban owner
                    </ion-button>
                  </template>
                  <ion-button
                    v-else-if="item.kind === 'OWNER_DELETED'"
                    size="small"
                    color="danger"
                    class="m-0"
                    :disabled="busyId === item.pin.id"
                    @click="act(item, 'REMOVE')"
                  >
                    Remove (delete photo)
                  </ion-button>
                  <ion-button v-else size="small" fill="outline" class="m-0" :disabled="busyId === item.pin.id" @click="act(item, 'RESTORE')">
                    Restore
                  </ion-button>
                </div>
              </div>
            </article>
          </section>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.tap {
  min-height: 44px;
}
.card {
  background: var(--pl-surface);
}
.photo-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}
.photo {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
.why {
  color: var(--ion-color-warning-shade, inherit);
}
ion-button[size='small'] {
  min-height: 44px;
}
</style>
