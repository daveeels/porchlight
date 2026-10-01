import { beforeEach, describe, expect, it, vi } from 'vitest'

const callable = vi.fn()
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_fns: unknown, name: string) => (input: unknown) => callable(name, input)),
}))
vi.mock('@/services/firebase', () => ({ functions: {} }))

import {
  PIN_WRITE_MESSAGES,
  PinWriteError,
  SERVER_REASONS,
  createPin,
  deletePin,
  toPinWriteError,
  toUploadError,
  updatePin,
} from '@/services/pinWrites'

/** Shape of a FunctionsError from the Firebase JS SDK. */
function httpsError(code: string, message: string, reason?: string) {
  return Object.assign(new Error(message), { code: `functions/${code}`, details: reason ? { reason } : undefined })
}

describe('toPinWriteError', () => {
  it('maps every server reason to its own friendly message', () => {
    for (const reason of SERVER_REASONS) {
      if (reason === 'INVALID_INPUT') continue
      const e = toPinWriteError(httpsError('failed-precondition', 'server text', reason))
      expect(e).toBeInstanceOf(PinWriteError)
      expect(e.reason).toBe(reason)
      expect(e.message).toBe(PIN_WRITE_MESSAGES[reason])
    }
  })

  it('uses the exact beta copy', () => {
    const e = toPinWriteError(httpsError('permission-denied', 'x', 'BETA_ONLY'))
    expect(e.message).toBe('Porchlight is in private beta — posting opens soon.')
  })

  it('keeps the server message for INVALID_INPUT (it names the field)', () => {
    const e = toPinWriteError(httpsError('invalid-argument', "Title can't contain links.", 'INVALID_INPUT'))
    expect(e.reason).toBe('INVALID_INPUT')
    expect(e.message).toBe("Title can't contain links.")
  })

  it('falls back to the generic INVALID_INPUT copy for SDK placeholder messages', () => {
    const e = toPinWriteError(httpsError('invalid-argument', 'invalid-argument'))
    expect(e.reason).toBe('INVALID_INPUT')
    expect(e.message).toBe(PIN_WRITE_MESSAGES.INVALID_INPUT)
  })

  it('falls back on the error code when there is no reason', () => {
    expect(toPinWriteError(httpsError('unauthenticated', 'x')).reason).toBe('UNAUTHENTICATED')
    expect(toPinWriteError(httpsError('resource-exhausted', 'x')).reason).toBe('RATE_LIMITED')
    expect(toPinWriteError(httpsError('already-exists', 'x')).reason).toBe('ALREADY_EXISTS')
    expect(toPinWriteError(httpsError('unavailable', 'x')).reason).toBe('NETWORK')
    expect(toPinWriteError(httpsError('deadline-exceeded', 'x')).reason).toBe('NETWORK')
    expect(toPinWriteError(httpsError('internal', 'internal')).reason).toBe('UNKNOWN')
  })

  it('ignores unknown reasons and odd values', () => {
    expect(toPinWriteError(httpsError('internal', 'x', 'SOMETHING_NEW')).reason).toBe('UNKNOWN')
    expect(toPinWriteError(null).reason).toBe('UNKNOWN')
    expect(toPinWriteError('boom').reason).toBe('UNKNOWN')
    expect(toPinWriteError(new Error('boom')).message).toBe(PIN_WRITE_MESSAGES.UNKNOWN)
  })

  it('passes PinWriteErrors through', () => {
    const e = new PinWriteError('UPLOAD_FAILED')
    expect(toPinWriteError(e)).toBe(e)
  })

  it('has copy for every reason', () => {
    for (const msg of Object.values(PIN_WRITE_MESSAGES)) expect(msg.length).toBeGreaterThan(10)
  })
})

describe('toUploadError', () => {
  it('maps storage failures', () => {
    expect(toUploadError({ code: 'storage/unauthenticated' }).reason).toBe('UNAUTHENTICATED')
    expect(toUploadError({ code: 'storage/retry-limit-exceeded' }).reason).toBe('NETWORK')
    expect(toUploadError({ code: 'storage/unauthorized' }).reason).toBe('UPLOAD_FAILED')
    expect(toUploadError(new Error('x')).message).toBe(PIN_WRITE_MESSAGES.UPLOAD_FAILED)
  })
})

describe('callable wrappers', () => {
  beforeEach(() => {
    callable.mockReset()
  })

  it('call the named callable and return its data', async () => {
    callable.mockResolvedValue({ data: { pinId: 'u_HALLOWEEN_2026' } })
    const input = {
      eventId: 'HALLOWEEN_2026',
      uploadId: 'abcdefghij0123456789',
      lat: -37.7,
      lng: 176.2,
      title: 'Spooky',
      description: null,
      consentOwnerOrPermission: true as const,
    }
    await expect(createPin(input)).resolves.toEqual({ pinId: 'u_HALLOWEEN_2026' })
    expect(callable).toHaveBeenCalledWith('createPin', input)
    await updatePin({ eventId: 'HALLOWEEN_2026', title: 'New' })
    expect(callable).toHaveBeenLastCalledWith('updatePin', { eventId: 'HALLOWEEN_2026', title: 'New' })
    await deletePin({ eventId: 'HALLOWEEN_2026' })
    expect(callable).toHaveBeenLastCalledWith('deletePin', { eventId: 'HALLOWEEN_2026' })
  })

  it('reject with mapped PinWriteErrors', async () => {
    callable.mockRejectedValue(httpsError('already-exists', 'Already exists', 'ALREADY_EXISTS'))
    const err = await deletePin({ eventId: 'HALLOWEEN_2026' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PinWriteError)
    expect((err as PinWriteError).reason).toBe('ALREADY_EXISTS')
  })
})
