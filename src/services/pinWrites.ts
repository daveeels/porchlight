// Pin write callables (SPEC §6): createPin, updatePin, deletePin. Clients
// never write Firestore directly. Server errors are HttpsErrors carrying
// details.reason; they are mapped to friendly copy here so every screen
// words them the same way.
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

export interface CreatePinInput {
  eventId: string
  /** Optional only for a Coming soon display. */
  uploadId?: string
  comingSoon?: boolean
  lat: number
  lng: number
  title: string
  description?: string | null
  consentOwnerOrPermission: true
}

export interface UpdatePinInput {
  eventId: string
  title?: string
  description?: string | null
  uploadId?: string
  /** "My lights are up!": Coming soon → ready. Needs uploadId. */
  lightsUp?: true
}

export interface DeletePinInput {
  eventId: string
}

export interface PinWriteResult {
  pinId: string
}

/** Reasons the server sends in HttpsError details. */
export const SERVER_REASONS = [
  'BETA_ONLY',
  'BANNED',
  'RATE_LIMITED',
  'SUBMISSIONS_CLOSED',
  'ALREADY_EXISTS',
  'REMOVED_BY_ADMIN',
  'UNDER_REVIEW',
  'CREATE_CAP',
  'INVALID_INPUT',
  'PHOTO_INVALID',
  'NOT_FOUND',
  'NOT_EDITABLE',
  'TERMS_REQUIRED',
] as const
export type ServerReason = (typeof SERVER_REASONS)[number]

/** Server reasons plus failures detected on the client. */
export type PinWriteReason = ServerReason | 'UPLOAD_FAILED' | 'UNAUTHENTICATED' | 'NETWORK' | 'UNKNOWN'

export const PIN_WRITE_MESSAGES: Record<PinWriteReason, string> = {
  BETA_ONLY: 'Porchlight is in private beta — posting opens soon.',
  BANNED: "This account can't add or change displays.",
  RATE_LIMITED: "You've done that a few times today. Please try again tomorrow.",
  SUBMISSIONS_CLOSED: 'Submissions are closed for this season.',
  ALREADY_EXISTS: "You've already added a display this season. You can edit it from My display.",
  REMOVED_BY_ADMIN: "Your display was removed by a moderator, so you can't add another this season.",
  UNDER_REVIEW: "Your display is under review, so you can't add a new one right now.",
  CREATE_CAP:
    "You've added the most displays allowed this season (3). The limit stops displays being deleted and re-added to clear their votes.",
  INVALID_INPUT: "Something in the form isn't right. Check it and try again.",
  PHOTO_INVALID: "We couldn't use that photo. Try a different one — a JPEG or a screenshot works best.",
  NOT_FOUND: "We couldn't find your display. It may have been removed.",
  NOT_EDITABLE: "This display can't be changed any more.",
  TERMS_REQUIRED: 'Please read and agree to the community rules first.',
  UPLOAD_FAILED: "The photo didn't upload. Check your connection and try again.",
  UNAUTHENTICATED: "You've been signed out. Sign in again to carry on.",
  NETWORK: "You're offline or the connection dropped. Check your connection and try again.",
  UNKNOWN: 'Something went wrong. Please try again.',
}

export class PinWriteError extends Error {
  constructor(
    readonly reason: PinWriteReason,
    message: string = PIN_WRITE_MESSAGES[reason],
  ) {
    super(message)
    this.name = 'PinWriteError'
  }
}

function isServerReason(v: unknown): v is ServerReason {
  return typeof v === 'string' && (SERVER_REASONS as readonly string[]).includes(v)
}

/** Fallback when an error has no recognised details.reason. */
function reasonForCode(code: string): PinWriteReason {
  switch (code.replace(/^functions\//, '')) {
    case 'unauthenticated':
      return 'UNAUTHENTICATED'
    case 'resource-exhausted':
      return 'RATE_LIMITED'
    case 'already-exists':
      return 'ALREADY_EXISTS'
    case 'not-found':
      return 'NOT_FOUND'
    case 'invalid-argument':
      return 'INVALID_INPUT'
    case 'unavailable':
    case 'deadline-exceeded':
      return 'NETWORK'
    default:
      return 'UNKNOWN'
  }
}

/** Any error from a pin write → PinWriteError with friendly copy. */
export function toPinWriteError(e: unknown): PinWriteError {
  if (e instanceof PinWriteError) return e
  const err = (e ?? {}) as { code?: unknown; message?: unknown; details?: unknown }
  const details = (err.details ?? {}) as { reason?: unknown }
  const reason: PinWriteReason = isServerReason(details.reason)
    ? details.reason
    : reasonForCode(typeof err.code === 'string' ? err.code : '')
  // INVALID_INPUT: the server says which field is wrong ("Title can't contain links").
  if (reason === 'INVALID_INPUT' && typeof err.message === 'string' && err.message.trim()) {
    const msg = err.message.trim()
    if (msg.toLowerCase() !== 'invalid-argument' && msg.toLowerCase() !== 'internal') {
      return new PinWriteError(reason, msg)
    }
  }
  return new PinWriteError(reason)
}

/** Storage upload failure → PinWriteError. */
export function toUploadError(e: unknown): PinWriteError {
  const code = (e as { code?: unknown } | null)?.code
  if (code === 'storage/unauthenticated') return new PinWriteError('UNAUTHENTICATED')
  if (code === 'storage/retry-limit-exceeded') return new PinWriteError('NETWORK')
  return new PinWriteError('UPLOAD_FAILED')
}

async function call<I, O>(name: string, input: I): Promise<O> {
  try {
    const res = await httpsCallable<I, O>(functions, name)(input)
    return res.data
  } catch (e) {
    throw toPinWriteError(e)
  }
}

export function createPin(input: CreatePinInput): Promise<PinWriteResult> {
  return call<CreatePinInput, PinWriteResult>('createPin', input)
}

export function updatePin(input: UpdatePinInput): Promise<PinWriteResult> {
  return call<UpdatePinInput, PinWriteResult>('updatePin', input)
}

export function deletePin(input: DeletePinInput): Promise<PinWriteResult> {
  return call<DeletePinInput, PinWriteResult>('deletePin', input)
}
