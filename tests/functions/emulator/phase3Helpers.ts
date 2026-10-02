// Fixtures for the Phase 3 emulator tests (votes, reports, moderation,
// scheduled jobs). Pins are seeded directly (no sharp) so these tests stay fast.
import { randomBytes } from 'node:crypto'
import { auth, bucket, db, FieldValue, GeoPoint, Timestamp } from '../../../functions/src/lib/admin'
import type { PinDoc } from '../../../functions/src/pins/model'
import { agreeToRules, DAY_MS, type TestUser } from './helpers'

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomUid(): string {
  return Array.from(randomBytes(28), (b) => ALNUM[b % ALNUM.length]).join('')
}

export type AccountKind = 'google' | 'youngEmail' | 'oldEmail'

/**
 * An Auth emulator account of a given kind, imported so the provider and
 * creation time can be faked:
 * - google: providerData has google.com (counted at once)
 * - youngEmail: email-link style ('password' provider), created just now (not counted)
 * - oldEmail: same, created 2 days ago (counted)
 * Agrees to the community rules unless `terms: false`.
 */
export async function account(
  kind: AccountKind = 'google',
  opts: { tester?: boolean; admin?: boolean; terms?: boolean } = {},
): Promise<TestUser> {
  const uid = randomUid()
  const email = `${uid.toLowerCase()}@example.com`
  const created = kind === 'oldEmail' ? Date.now() - 2 * DAY_MS : Date.now()
  const providerData =
    kind === 'google'
      ? [{ uid: `g${uid}`, providerId: 'google.com', email, displayName: 'Tester' }]
      : [{ uid: email, providerId: 'password', email }]
  const result = await auth().importUsers([
    {
      uid,
      email,
      emailVerified: true,
      providerData,
      metadata: { creationTime: new Date(created).toUTCString(), lastSignInTime: new Date().toUTCString() },
    },
  ])
  if (result.failureCount > 0) throw result.errors[0]?.error ?? new Error('importUsers failed')
  if (opts.tester ?? true) {
    await db()
      .doc('config/testers')
      .set({ emails: FieldValue.arrayUnion(email) }, { merge: true })
  }
  const user = { uid, email, admin: opts.admin ?? false }
  if (opts.terms ?? true) await agreeToRules(user)
  return user
}

export const PAPAMOA_PLACE = {
  areaKey: 'tauranga',
  area: 'Tauranga & surrounds',
  townKey: 'papamoa-beach-e8-nz',
  town: 'Pāpāmoa Beach',
  region: 'Bay of Plenty',
  countryCode: 'NZ',
}

export const ROTORUA_PLACE = {
  areaKey: null,
  area: null,
  townKey: 'rotorua-e8-nz',
  town: 'Rotorua',
  region: 'Bay of Plenty',
  countryCode: 'NZ',
}

/** Writes an ACTIVE, unverified pin straight to Firestore and returns its id. */
export async function seedPin(
  ownerId: string = randomUid(),
  eventId = 'HALLOWEEN_2026',
  overrides: Partial<PinDoc> & Record<string, unknown> = {},
): Promise<string> {
  const pinId = `${ownerId}_${eventId}`
  const now = Date.now()
  const folder = `photos/${pinId}/upload12345/`
  const pin: PinDoc = {
    ownerId,
    eventId,
    season: eventId.startsWith('CHRISTMAS') ? 'CHRISTMAS' : 'HALLOWEEN',
    seasonYear: Number(eventId.split('_')[1]),
    title: 'Seeded spooky house',
    description: null,
    photoPath: `${folder}full.webp`,
    thumbPath: `${folder}thumb.webp`,
    photoUrl: 'https://example.com/full.webp',
    thumbUrl: 'https://example.com/thumb.webp',
    geo: new GeoPoint(-37.7, 176.29),
    geohash: 'rckq2zzzz',
    place: PAPAMOA_PLACE,
    status: 'ACTIVE',
    hiddenReason: null,
    removedBy: null,
    consentAt: Timestamp.fromMillis(now),
    voteRound: 0,
    hereVotes: 0,
    notThereVotes: 0,
    verified: false,
    reportsCount: 0,
    rankScore: 0,
    isFeatured: false,
    featuredUntil: null,
    moderation: { decision: 'NONE', reviewedBy: null, reviewedAt: null, note: null },
    createdAt: Timestamp.fromMillis(now),
    updatedAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + 30 * DAY_MS),
    purgeAt: Timestamp.fromMillis(now + 400 * DAY_MS),
  }
  await db().doc(`pins/${pinId}`).set({ ...pin, ...overrides })
  return pinId
}

/** Puts placeholder photo files where a pin's photoPath/thumbPath point. */
export async function seedPhotos(pinId: string): Promise<void> {
  const pin = (await db().doc(`pins/${pinId}`).get()).data() as PinDoc
  for (const path of [pin.photoPath, pin.thumbPath]) {
    await bucket().file(path).save(Buffer.from('webp'), { contentType: 'image/webp', resumable: false })
  }
}

export async function pinData(pinId: string): Promise<PinDoc> {
  const data = (await db().doc(`pins/${pinId}`).get()).data()
  if (!data) throw new Error(`no pin ${pinId}`)
  return data as PinDoc
}

export async function setRateLimit(uid: string, counts: Record<string, number>): Promise<void> {
  await db()
    .doc(`rateLimits/${uid}`)
    .set({ day: new Date().toISOString().slice(0, 10), createPin: 0, updatePin: 0, castVote: 0, reportPin: 0, ...counts })
}

export async function auditFor(pinId: string) {
  const snap = await db().collection('moderationActions').where('pinId', '==', pinId).get()
  return snap.docs.map((d) => d.data())
}
