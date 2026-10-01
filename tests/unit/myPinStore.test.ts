import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

const authState = { uid: ref<string | null>('user123'), ready: ref(true) }

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get uid() {
      return authState.uid.value
    },
    init: () => Promise.resolve(),
  }),
}))
vi.mock('@/stores/season', () => ({
  useSeasonStore: () => ({ ready: true, eventId: 'HALLOWEEN_2026' }),
}))
vi.mock('@/services/pins', () => ({ fetchPin: vi.fn() }))
vi.mock('@/services/uploads', () => ({ uploadPhoto: vi.fn() }))
vi.mock('@/services/pinWrites', async () => {
  const actual = await vi.importActual<typeof import('@/services/pinWrites')>('@/services/pinWrites')
  return { ...actual, createPin: vi.fn(), updatePin: vi.fn(), deletePin: vi.fn() }
})
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))
vi.mock('@/services/firebase', () => ({ functions: {} }))

import { fetchPin } from '@/services/pins'
import { createPin, deletePin, PinWriteError, updatePin } from '@/services/pinWrites'
import { uploadPhoto } from '@/services/uploads'
import { useMyPinStore } from '@/stores/myPin'
import type { Pin } from '@/types/models'

const mockFetch = vi.mocked(fetchPin)
const mockUpload = vi.mocked(uploadPhoto)
const mockCreate = vi.mocked(createPin)
const mockUpdate = vi.mocked(updatePin)
const mockDelete = vi.mocked(deletePin)

const PIN_ID = 'user123_HALLOWEEN_2026'
const photo = new Blob(['jpeg'], { type: 'image/jpeg' })

describe('useMyPinStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    authState.uid.value = 'user123'
    mockFetch.mockResolvedValue(null)
    mockUpload.mockResolvedValue()
    mockCreate.mockResolvedValue({ pinId: PIN_ID })
    mockUpdate.mockResolvedValue({ pinId: PIN_ID })
    mockDelete.mockResolvedValue({ pinId: PIN_ID })
  })

  it('reads pins/{uid}_{eventId}; a missing pin is null', async () => {
    const store = useMyPinStore()
    await store.load()
    expect(mockFetch).toHaveBeenCalledWith(PIN_ID)
    expect(store.pin).toBeNull()
    expect(store.loaded).toBe(true)
    await store.load()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await store.load(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('create uploads to the user folder, then calls createPin with trimmed input', async () => {
    const store = useMyPinStore()
    const phases: string[] = []
    mockFetch.mockResolvedValue({ id: PIN_ID, status: 'ACTIVE' } as Pin)
    const id = await store.create(
      { lat: -37.7, lng: 176.2, title: '  Spooky House ', description: '   ', photo, consent: true },
      (p) => phases.push(p.phase),
    )
    expect(id).toBe(PIN_ID)
    const [uid, uploadId, blob] = mockUpload.mock.calls[0]!
    expect(uid).toBe('user123')
    expect(uploadId).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(blob).toBe(photo)
    expect(mockCreate).toHaveBeenCalledWith({
      eventId: 'HALLOWEEN_2026',
      uploadId,
      lat: -37.7,
      lng: 176.2,
      title: 'Spooky House',
      description: null,
      consentOwnerOrPermission: true,
    })
    expect(phases[0]).toBe('upload')
    expect(phases.at(-1)).toBe('save')
    expect(store.pin?.id).toBe(PIN_ID)
  })

  it('a failed upload becomes UPLOAD_FAILED and createPin is not called', async () => {
    mockUpload.mockRejectedValue(Object.assign(new Error('x'), { code: 'storage/unknown' }))
    const store = useMyPinStore()
    const err = await store
      .create({ lat: 0, lng: 0, title: 'abc', description: '', photo, consent: true })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PinWriteError)
    expect((err as PinWriteError).reason).toBe('UPLOAD_FAILED')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('create refuses without consent: nothing is uploaded or sent', async () => {
    const store = useMyPinStore()
    const err = await store
      .create({ lat: -37.7, lng: 176.2, title: 'Spooky House', description: '', photo, consent: false })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PinWriteError)
    expect((err as PinWriteError).reason).toBe('INVALID_INPUT')
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('update without a new photo skips the upload and sends no uploadId', async () => {
    const store = useMyPinStore()
    await store.update({ title: 'New title', description: ' Lights from 7pm ', photo: null })
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({
      eventId: 'HALLOWEEN_2026',
      title: 'New title',
      description: 'Lights from 7pm',
    })
  })

  it('update with a new photo uploads it first', async () => {
    const store = useMyPinStore()
    await store.update({ title: 'New title', description: '', photo })
    const uploadId = mockUpload.mock.calls[0]![1]
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ uploadId }))
  })

  it('remove calls deletePin and re-reads the pin', async () => {
    const store = useMyPinStore()
    await store.remove()
    expect(mockDelete).toHaveBeenCalledWith({ eventId: 'HALLOWEEN_2026' })
    expect(mockFetch).toHaveBeenCalledWith(PIN_ID)
  })

  it('signed out: writes fail with UNAUTHENTICATED', async () => {
    authState.uid.value = null
    const store = useMyPinStore()
    const err = await store.remove().catch((e: unknown) => e)
    expect((err as PinWriteError).reason).toBe('UNAUTHENTICATED')
  })
})
