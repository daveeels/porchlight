// The signed-in user's pin for the current event (SPEC F5/F6): pins/{uid}_{eventId}.
// Writes go through the callables; the pin is re-read afterwards.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { newUploadId } from '@/lib/uploadId'
import { fetchPin } from '@/services/pins'
import {
  createPin,
  deletePin,
  PinWriteError,
  toUploadError,
  updatePin,
} from '@/services/pinWrites'
import { uploadPhoto } from '@/services/uploads'
import type { EventId, Pin } from '@/types/models'
import { useAuthStore } from './auth'
import { useSeasonStore } from './season'

export type SubmitPhase = 'upload' | 'save'

export interface SubmitProgress {
  phase: SubmitPhase
  /** Upload progress 0..1 (1 while saving). */
  fraction: number
}

export interface NewPinDraft {
  lat: number
  lng: number
  title: string
  description: string
  photo: Blob
  /** The "my house, or I have permission" checkbox; create() refuses without it. */
  consent: boolean
}

export interface PinEditDraft {
  title: string
  description: string
  /** A new photo, or null to keep the current one. */
  photo: Blob | null
}

function cleanDescription(d: string): string | null {
  const t = d.trim()
  return t ? t : null
}

export const useMyPinStore = defineStore('myPin', () => {
  const auth = useAuthStore()
  const season = useSeasonStore()

  const pin = shallowRef<Pin | null>(null)
  /** The pinId `pin` was loaded for; null until the first load finishes. */
  const loadedId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let pending: Promise<void> | null = null

  const eventId = computed<EventId | null>(() => season.eventId)
  const pinId = computed(() => (auth.uid && eventId.value ? `${auth.uid}_${eventId.value}` : null))
  const loaded = computed(() => !!pinId.value && loadedId.value === pinId.value)

  /** Waits for the auth state and the season choice (both start in main.ts). */
  async function ready(): Promise<void> {
    await auth.init()
    if (season.ready) return
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => season.ready,
        (r) => {
          if (r) {
            stop()
            resolve()
          }
        },
      )
    })
  }

  /** Loads the pin once per uid/event; `force` re-reads it. Never rejects (see error). */
  async function load(force = false): Promise<void> {
    await ready()
    const id = pinId.value
    if (!id) {
      pin.value = null
      loadedId.value = null
      return
    }
    if (!force && loadedId.value === id) return
    if (pending && !force) return pending
    loading.value = true
    error.value = null
    const p = fetchPin(id)
      .then((found) => {
        if (pinId.value !== id) return
        pin.value = found
        loadedId.value = id
      })
      .catch((e: unknown) => {
        error.value = e
      })
      .finally(() => {
        if (pending === p) pending = null
        loading.value = false
      })
    pending = p
    return p
  }

  function requireContext(): { uid: string; eventId: EventId } {
    if (!auth.uid) throw new PinWriteError('UNAUTHENTICATED')
    if (!eventId.value) throw new PinWriteError('SUBMISSIONS_CLOSED')
    return { uid: auth.uid, eventId: eventId.value }
  }

  async function upload(uid: string, photo: Blob, onProgress?: (p: SubmitProgress) => void): Promise<string> {
    const uploadId = newUploadId()
    onProgress?.({ phase: 'upload', fraction: 0 })
    try {
      await uploadPhoto(uid, uploadId, photo, (fraction) => onProgress?.({ phase: 'upload', fraction }))
    } catch (e) {
      throw toUploadError(e)
    }
    return uploadId
  }

  /** Uploads the photo, then createPin. Rejects with PinWriteError. */
  async function create(draft: NewPinDraft, onProgress?: (p: SubmitProgress) => void): Promise<string> {
    const { uid, eventId: ev } = requireContext()
    if (draft.consent !== true) {
      throw new PinWriteError('INVALID_INPUT', 'Confirm this is your house, or that you have permission.')
    }
    const uploadId = await upload(uid, draft.photo, onProgress)
    onProgress?.({ phase: 'save', fraction: 1 })
    const { pinId: id } = await createPin({
      eventId: ev,
      uploadId,
      lat: draft.lat,
      lng: draft.lng,
      title: draft.title.trim(),
      description: cleanDescription(draft.description),
      consentOwnerOrPermission: draft.consent,
    })
    await load(true)
    return id
  }

  /** Optional photo upload, then updatePin. Rejects with PinWriteError. */
  async function update(draft: PinEditDraft, onProgress?: (p: SubmitProgress) => void): Promise<string> {
    const { uid, eventId: ev } = requireContext()
    const uploadId = draft.photo ? await upload(uid, draft.photo, onProgress) : undefined
    onProgress?.({ phase: 'save', fraction: 1 })
    const { pinId: id } = await updatePin({
      eventId: ev,
      title: draft.title.trim(),
      description: cleanDescription(draft.description),
      ...(uploadId ? { uploadId } : {}),
    })
    await load(true)
    return id
  }

  /** deletePin (owner sets it to REMOVED). Rejects with PinWriteError. */
  async function remove(): Promise<void> {
    const { eventId: ev } = requireContext()
    await deletePin({ eventId: ev })
    await load(true)
  }

  // A different (or no) user: forget the old pin.
  watch(
    () => auth.uid,
    () => {
      pin.value = null
      loadedId.value = null
      error.value = null
    },
  )

  return { pin, pinId, eventId, loaded, loading, error, load, create, update, remove }
})
