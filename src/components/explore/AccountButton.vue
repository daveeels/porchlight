<script setup lang="ts">
// Header account control: "Sign in" (→ /sign-in), or the user's avatar with a
// sign-out action sheet.
import { computed, ref, watch } from 'vue'
import { IonAvatar, IonButton, actionSheetController, toastController } from '@ionic/vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const photoFailed = ref(false)

const initial = computed(() => {
  const u = auth.user
  const name = u?.displayName || u?.email || '?'
  return name.trim().charAt(0).toUpperCase() || '?'
})
const photo = computed(() => (photoFailed.value ? null : auth.user?.photoURL ?? null))
watch(
  () => auth.user?.photoURL,
  () => {
    photoFailed.value = false
  },
)

async function openMenu(): Promise<void> {
  const sheet = await actionSheetController.create({
    header: auth.user?.displayName || auth.user?.email || 'Your account',
    buttons: [
      {
        text: 'Sign out',
        role: 'destructive',
        handler: () => {
          auth.signOut().catch(async () => {
            const t = await toastController.create({ message: "Couldn't sign out. Try again.", duration: 2500 })
            await t.present()
          })
        },
      },
      { text: 'Cancel', role: 'cancel' },
    ],
  })
  await sheet.present()
}
</script>

<template>
  <template v-if="auth.ready">
    <ion-button v-if="!auth.isSignedIn" router-link="/sign-in" fill="solid" color="primary" class="tap">
      Sign in
    </ion-button>
    <ion-button v-else fill="clear" class="tap" aria-label="Account" @click="openMenu">
      <ion-avatar class="avatar">
        <img v-if="photo" :src="photo" alt="" referrerpolicy="no-referrer" @error="photoFailed = true" />
        <span v-else class="initial">{{ initial }}</span>
      </ion-avatar>
    </ion-button>
  </template>
</template>

<style scoped>
.tap {
  min-height: 44px;
  min-width: 44px;
}
.avatar {
  width: 32px;
  height: 32px;
}
.initial {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
  font-weight: 700;
}
</style>
