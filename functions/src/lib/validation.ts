// Input validation for every callable (SPEC §6 "Input validation"). Runs
// before anything else; never trust client input. Unknown keys are rejected so
// server-only fields (status, geo, counts, …) can't be smuggled in.
import { invalid } from './errors.js'
import { TERMS_VERSION } from './terms.js'

export const EVENT_ID_RE = /^(HALLOWEEN|CHRISTMAS)_\d{4}$/
export const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{10,40}$/
export const PIN_ID_RE = /^[A-Za-z0-9]{20,40}_(HALLOWEEN|CHRISTMAS)_\d{4}$/

export const TITLE_MIN = 3
export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 500

// Scheme or www. prefixes, or something.tld with a common TLD.
const URL_RE =
  /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.)|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|nz|au|uk|io|co|app|dev|xyz|info|biz|me|ly|gg|tv|link|site|online|shop|store|club|top)\b/i

// A basic list (SPEC §6). Matched as whole words after lowercasing and
// stripping diacritics; a few stems also catch their suffixes.
const PROFANITY_RE =
  /\b(?:fuck\w*|f+u+c+k+|motherfuck\w*|shit\w*|bullshit|cunts?|bitch\w*|bastards?|wank\w*|twats?|sluts?|whores?|cocksuck\w*|dickhead\w*|pricks?|pussy|pussies|nigg\w*|fag|fags|faggot\w*|retard\w*|rapist|kys)\b/

// Control characters: none in titles; descriptions may keep tabs and newlines.
const TITLE_CTRL_RE = /[\u0000-\u001f\u007f-\u009f]/
const DESCRIPTION_CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
// Invisible format characters (Unicode Cf: zero-width spaces, bidi overrides,
// soft hyphens, …) can hide a link ("evil​.com") or spoof the text
// direction. Only the zero-width joiner is allowed, for emoji sequences.
const FORMAT_RE = /(?!‍)\p{Cf}/u

/** Lowercased, without diacritics or format characters, for the link and word checks. */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\p{Cf}/gu, '').toLowerCase()
}

export function containsUrl(text: string): boolean {
  return URL_RE.test(fold(text))
}

export function containsProfanity(text: string): boolean {
  return PROFANITY_RE.test(fold(text))
}

type Input = Record<string, unknown>

/** A plain object with only the allowed keys. */
export function requireObject(data: unknown, allowed: readonly string[]): Input {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) invalid('Invalid request.')
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) invalid('Invalid request.')
  }
  return data as Input
}

export function parseEventId(value: unknown): string {
  if (typeof value !== 'string' || !EVENT_ID_RE.test(value)) invalid('Unknown event.')
  return value
}

export function parseUploadId(value: unknown): string {
  if (typeof value !== 'string' || !UPLOAD_ID_RE.test(value)) invalid('Photo upload failed — try again.')
  return value
}

/**
 * The request's uploadId if it is well-formed, else null — without throwing,
 * so a callable can still delete the caller's upload when other input is bad.
 */
export function uploadIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const value = (data as Input).uploadId
  return typeof value === 'string' && UPLOAD_ID_RE.test(value) ? value : null
}

export function parsePinId(value: unknown): string {
  if (typeof value !== 'string' || !PIN_ID_RE.test(value)) invalid('Unknown display.')
  return value
}

export function parseLat(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    invalid('Choose a location on the map.')
  }
  return value
}

export function parseLng(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    invalid('Choose a location on the map.')
  }
  return value
}

function checkText(text: string, field: 'Title' | 'Description'): void {
  if (containsUrl(text)) invalid(`${field} can't include links.`)
  if (containsProfanity(text)) invalid(`${field} contains words we don't allow.`)
}

export function parseTitle(value: unknown): string {
  if (typeof value !== 'string') invalid('Add a title.')
  const title = value.trim()
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    invalid(`Title must be ${TITLE_MIN}–${TITLE_MAX} characters.`)
  }
  if (TITLE_CTRL_RE.test(title) || FORMAT_RE.test(title)) invalid('Title contains characters we don\'t allow.')
  checkText(title, 'Title')
  return title
}

/** `undefined` / `null` / blank → null. */
export function parseDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') invalid('Invalid description.')
  const description = value.trim()
  if (description.length > DESCRIPTION_MAX) invalid(`Description must be at most ${DESCRIPTION_MAX} characters.`)
  if (description.length === 0) return null
  if (DESCRIPTION_CTRL_RE.test(description) || FORMAT_RE.test(description)) {
    invalid('Description contains characters we don\'t allow.')
  }
  checkText(description, 'Description')
  return description
}

export interface CreatePinInput {
  eventId: string
  /** null only when comingSoon (the photo is optional before the decorations are up) */
  uploadId: string | null
  comingSoon: boolean
  lat: number
  lng: number
  title: string
  description: string | null
}

export function parseCreatePinInput(data: unknown): CreatePinInput {
  const d = requireObject(data, [
    'eventId',
    'uploadId',
    'lat',
    'lng',
    'title',
    'description',
    'consentOwnerOrPermission',
    'comingSoon',
  ])
  if (d.consentOwnerOrPermission !== true) invalid('Confirm this is your house, or that you have permission.')
  if (d.comingSoon !== undefined && typeof d.comingSoon !== 'boolean') invalid('Invalid comingSoon.')
  const comingSoon = d.comingSoon === true
  return {
    eventId: parseEventId(d.eventId),
    uploadId: comingSoon && d.uploadId == null ? null : parseUploadId(d.uploadId),
    comingSoon,
    lat: parseLat(d.lat),
    lng: parseLng(d.lng),
    title: parseTitle(d.title),
    description: parseDescription(d.description),
  }
}

export interface UpdatePinInput {
  eventId: string
  /** undefined = unchanged */
  title?: string
  /** undefined = unchanged; null = cleared */
  description?: string | null
  /** undefined = keep the current photo */
  uploadId?: string
  /** "My lights are up!": COMING_SOON → READY. Needs a new (decorated) photo. */
  lightsUp?: true
}

export function parseUpdatePinInput(data: unknown): UpdatePinInput {
  const d = requireObject(data, ['eventId', 'title', 'description', 'uploadId', 'lightsUp'])
  const out: UpdatePinInput = { eventId: parseEventId(d.eventId) }
  if (d.title !== undefined) out.title = parseTitle(d.title)
  if (d.description !== undefined) out.description = parseDescription(d.description)
  if (d.uploadId !== undefined) out.uploadId = parseUploadId(d.uploadId)
  if (d.lightsUp !== undefined && d.lightsUp !== true) invalid('Invalid lightsUp.')
  if (d.lightsUp === true) {
    if (out.uploadId === undefined) invalid('Add a photo of your decorations.')
    out.lightsUp = true
  }
  if (out.title === undefined && out.description === undefined && out.uploadId === undefined) {
    invalid('Nothing to update.')
  }
  return out
}

export interface DeletePinInput {
  eventId: string
}

export function parseDeletePinInput(data: unknown): DeletePinInput {
  const d = requireObject(data, ['eventId'])
  return { eventId: parseEventId(d.eventId) }
}

// ---- Phase 3: votes, reports, moderation ---------------------------------

export type VoteValue = 'HERE' | 'NOT_THERE'
export const VOTE_VALUES: readonly VoteValue[] = ['HERE', 'NOT_THERE']

export type ReportReason = 'NOT_A_DISPLAY' | 'INAPPROPRIATE' | 'PRIVACY' | 'SPAM' | 'OTHER'
export const REPORT_REASONS: readonly ReportReason[] = ['NOT_A_DISPLAY', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER']

export type ModerationAction = 'APPROVE' | 'REMOVE' | 'RESTORE' | 'BAN_USER'
export const MODERATION_ACTIONS: readonly ModerationAction[] = ['APPROVE', 'REMOVE', 'RESTORE', 'BAN_USER']

export const NOTE_MAX = 500

function oneOf<T extends string>(value: unknown, allowed: readonly T[], message: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) invalid(message)
  return value as T
}

export interface CastVoteInput {
  pinId: string
  value: VoteValue
}

export function parseCastVoteInput(data: unknown): CastVoteInput {
  const d = requireObject(data, ['pinId', 'value'])
  return { pinId: parsePinId(d.pinId), value: oneOf(d.value, VOTE_VALUES, 'Invalid vote.') }
}

export interface ReportPinInput {
  pinId: string
  reason: ReportReason
}

export function parseReportPinInput(data: unknown): ReportPinInput {
  const d = requireObject(data, ['pinId', 'reason'])
  return { pinId: parsePinId(d.pinId), reason: oneOf(d.reason, REPORT_REASONS, 'Pick a reason.') }
}

/** Moderator's note: `undefined` / `null` / blank → null; plain text up to NOTE_MAX. */
export function parseNote(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') invalid('Invalid note.')
  const note = value.trim()
  if (note.length > NOTE_MAX) invalid(`Note must be at most ${NOTE_MAX} characters.`)
  if (note.length === 0) return null
  if (DESCRIPTION_CTRL_RE.test(note) || FORMAT_RE.test(note)) invalid("Note contains characters we don't allow.")
  return note
}

export interface ModeratePinInput {
  pinId: string
  action: ModerationAction
  note: string | null
}

export function parseModeratePinInput(data: unknown): ModeratePinInput {
  const d = requireObject(data, ['pinId', 'action', 'note'])
  return {
    pinId: parsePinId(d.pinId),
    action: oneOf(d.action, MODERATION_ACTIONS, 'Unknown moderation action.'),
    note: parseNote(d.note),
  }
}

// ---- Community rules -----------------------------------------------------

export interface AcceptTermsInput {
  version: string
}

/** Only the current rules can be agreed to (an old tab must reload first). */
export function parseAcceptTermsInput(data: unknown): AcceptTermsInput {
  const d = requireObject(data, ['version'])
  if (d.version !== TERMS_VERSION) invalid('These community rules have changed. Reload Porchlight and try again.')
  return { version: TERMS_VERSION }
}
