<script setup lang="ts">
// Header account control: "Sign in" (→ /sign-in), or the user's avatar with a
// account action sheet (My display, Community rules, Send feedback, About &
// privacy, Sign out).
import { computed, ref, watch } from 'vue'
import { IonAvatar, IonButton, actionSheetController } from '@ionic/vue'
import { useAccountMenu } from '@/components/common/accountMenu'
import { openBackEntry } from '@/lib/backStack'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const menu = useAccountMenu()
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
  let chosen: (() => void) | null = null
  const sheet = await actionSheetController.create({
    header: auth.user?.displayName || auth.user?.email || 'Your account',
    buttons: menu.actionSheetButtons((action) => {
      chosen = action
    }),
  })
  // Back closes the menu. A chosen page or modal opens only once the menu's
  // history entry is gone, so it never lands on (or is popped with) it.
  // Taken before the sheet animates in, so an early Back is caught too.
  let backed = false
  const back = openBackEntry(() => {
    backed = true
    void sheet.dismiss(undefined, 'cancel')
  })
  await sheet.present()
  if (backed) void sheet.dismiss(undefined, 'cancel')
  await sheet.onDidDismiss()
  await back.close()
  const run = chosen as (() => void) | null
  run?.()
}
</script>

<template>
  <template v-if="auth.ready">
    <!-- A clear (light) button drawn as a cream pill: easy to spot, lighter
         than a solid primary block. The 44 px tap target is the host.
         Distinct keys: never let Vue patch the avatar button into the Sign in
         pill in place (a real iPhone showed a blank chip after signing out). -->
    <ion-button v-if="!auth.isSignedIn" key="sign-in" router-link="/sign-in" fill="clear" class="tap sign-in">
      Sign in
    </ion-button>
    <ion-button v-else key="account" fill="clear" class="tap" aria-label="Account" @click="openMenu">
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
.sign-in {
  --color: var(--pl-on-primary);
  --background-hover: var(--pl-on-primary);
  --background-hover-opacity: 0.08;
  --padding-start: 0;
  --padding-end: 0;
  font-weight: 800;
  font-size: 0.875rem;
}
/* Ionic colours buttons inside a toolbar with --ion-toolbar-color (cream),
   ignoring --color, which made "Sign in" cream-on-cream (blank pill) in
   production. Set the text colour on the native part directly. */
.sign-in::part(native) {
  color: var(--pl-on-primary);
  height: 34px;
  min-height: 0;
  margin-block: 5px;
  padding-inline: 14px;
  border-radius: 999px;
  background: var(--pl-cream);
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
