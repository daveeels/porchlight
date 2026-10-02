<script setup lang="ts">
// /me — My display (SPEC F6): this season's pin and its status in plain
// words, Edit, Delete, Sign out. Auth-guarded.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
  toastController,
  useIonRouter,
  type RefresherCustomEvent,
} from '@ionic/vue'
import { addOutline, alertCircleOutline, createOutline, logOutOutline, trashOutline } from 'ionicons/icons'
import StateMessage from '@/components/common/StateMessage.vue'
import MyPinCard from '@/components/mypin/MyPinCard.vue'
import { canChangePin, canEditPin, canReAdd, isUnderReview } from '@/components/mypin/status'
import { SEASON_THEMES } from '@/config/seasons'
import { toPinWriteError } from '@/services/pinWrites'
import { useAuthStore } from '@/stores/auth'
import { useMyPinStore } from '@/stores/myPin'
import { useSeasonStore } from '@/stores/season'

const auth = useAuthStore()
const myPin = useMyPinStore()
const season = useSeasonStore()
const router = useRouter()
const ionRouter = useIonRouter()
const deleting = ref(false)
const signingOut = ref(false)

onIonViewWillEnter(() => {
  void myPin.load(true)
})

const loading = computed(() => !season.ready || (!!myPin.pinId && !myPin.loaded && !myPin.error))
const seasonIcon = computed(() => (season.season ? SEASON_THEMES[season.season].icon : undefined))
const email = computed(() => auth.user?.email ?? null)

async function toast(message: string): Promise<void> {
  const t = await toastController.create({ message, duration: 3000, position: 'bottom' })
  await t.present()
}

async function confirmDelete(): Promise<void> {
  const alert = await alertController.create({
    header: 'Delete your display?',
    // deletePin hides it at once; the photo is deleted then too, except for a
    // reported pin (kept for the moderator). The rest goes with the season's data.
    message:
      myPin.pin && isUnderReview(myPin.pin)
        ? "It will disappear from Porchlight straight away. Because it was reported, its photo is kept until a moderator has looked at it, and you can't add a new display until then."
        : 'It will disappear from Porchlight straight away and its photo will be deleted. You can add it again later, but it starts as Unverified.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive', handler: () => void doDelete() },
    ],
  })
  await alert.present()
}

async function doDelete(): Promise<void> {
  deleting.value = true
  try {
    await myPin.remove()
    await toast('Your display has been deleted.')
  } catch (e) {
    await toast(toPinWriteError(e).message)
  } finally {
    deleting.value = false
  }
}

async function signOut(): Promise<void> {
  signingOut.value = true
  try {
    await auth.signOut()
    if (ionRouter.canGoBack()) router.back()
    else await router.replace('/')
  } catch {
    await toast("Couldn't sign out. Try again.")
  } finally {
    signingOut.value = false
  }
}

async function refresh(ev: RefresherCustomEvent): Promise<void> {
  await myPin.load(true)
  await ev.target.complete()
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" class="back" />
        </ion-buttons>
        <ion-title>My display</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="mx-auto flex max-w-lg flex-col gap-4 pb-8">
        <StateMessage v-if="loading" loading title="Loading your display…" />

        <StateMessage
          v-else-if="myPin.error"
          :icon="alertCircleOutline"
          title="Couldn't load your display"
          message="Check your connection and try again."
          error
        >
          <ion-button class="tap" @click="myPin.load(true)">Try again</ion-button>
        </StateMessage>

        <StateMessage
          v-else-if="!season.eventId"
          :icon="alertCircleOutline"
          title="No season running"
          message="There's no display season on right now. See you in October!"
        />

        <StateMessage
          v-else-if="!myPin.pin"
          :emoji="seasonIcon"
          title="You haven't added a display this season"
          message="Got a decorated house? Add it so others can find it."
        >
          <ion-button class="tap" router-link="/submit">
            <ion-icon slot="start" :icon="addOutline" aria-hidden="true" />
            Add my display
          </ion-button>
        </StateMessage>

        <template v-else>
          <MyPinCard :pin="myPin.pin" />

          <div v-if="canChangePin(myPin.pin)" class="flex flex-col gap-2">
            <ion-button
              v-if="canEditPin(myPin.pin)"
              expand="block"
              class="tap m-0"
              router-link="/submit?edit=1"
              :disabled="deleting"
            >
              <ion-icon slot="start" :icon="createOutline" aria-hidden="true" />
              Edit
            </ion-button>
            <ion-button expand="block" fill="outline" color="danger" class="tap m-0" :disabled="deleting" @click="confirmDelete">
              <ion-spinner v-if="deleting" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="trashOutline" aria-hidden="true" />
              Delete
            </ion-button>
            <p class="m-0 text-xs pl-muted">The location can't be changed. To move it, delete your display and add it again.</p>
          </div>
          <ion-button v-else-if="canReAdd(myPin.pin)" expand="block" class="tap m-0" router-link="/submit">
            <ion-icon slot="start" :icon="addOutline" aria-hidden="true" />
            Add a new display
          </ion-button>
        </template>

        <hr class="divider my-2 w-full" />

        <p v-if="email" class="m-0 text-sm pl-muted">Signed in as {{ email }}</p>
        <ion-button expand="block" fill="clear" class="tap m-0" :disabled="signingOut" @click="signOut">
          <ion-icon slot="start" :icon="logOutOutline" aria-hidden="true" />
          Sign out
        </ion-button>
        <router-link to="/about" class="link text-sm">About &amp; privacy</router-link>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.back {
  --min-height: 44px;
  --min-width: 44px;
}
.tap {
  min-height: 48px;
}
.divider {
  border: 0;
  border-top: 1px solid var(--pl-line);
}
.link {
  color: var(--ion-color-primary);
  font-weight: 800;
  display: inline-block;
  padding: 12px 0;
}
</style>
