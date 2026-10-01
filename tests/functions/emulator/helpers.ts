// Shared fixtures for the functions emulator tests. Everything Firebase goes
// through functions/src/lib/admin.ts so the tests and the services share one
// copy of firebase-admin (the repo root has another).
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect } from 'vitest'
import { auth, bucket, db, FieldValue, Timestamp } from '../../../functions/src/lib/admin'
import type { Caller } from '../../../functions/src/lib/caller'
import type { FailReason } from '../../../functions/src/lib/errors'

// sharp lives in functions/node_modules only.
type SharpType = typeof import('../../../functions/node_modules/sharp').default
const requireFromFunctions = createRequire(new URL('../../../functions/package.json', import.meta.url))
export const sharp = requireFromFunctions('sharp') as SharpType

export const PROJECT_ID = 'demo-porchlight'
export const DAY_MS = 24 * 60 * 60 * 1000

/** A Pāpāmoa street (Tauranga & surrounds). */
export const PAPAMOA = { lat: -37.7, lng: 176.29 }

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const UPLOAD_CHARS = `${ALNUM}_-`

function randomString(chars: string, length: number): string {
  const bytes = randomBytes(length)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

/** Same shape as the client's uploadId: 20 chars of [A-Za-z0-9_-]. */
export function newUploadId(): string {
  return randomString(UPLOAD_CHARS, 20)
}

async function emulatorDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
  if (!res.ok) throw new Error(`DELETE ${url} → ${res.status}`)
}

/** Clears Firestore, Auth and Storage in the emulators. */
export async function resetEmulators(): Promise<void> {
  await emulatorDelete(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
  )
  await emulatorDelete(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`)
  await bucket().deleteFiles({ force: true })
}

/** config/app in BETA with an empty tester list (tests add their own testers). */
export async function seedConfig(launchMode: 'BETA' | 'LIVE' = 'BETA'): Promise<void> {
  await db().doc('config/app').set({
    mapAccess: 'ACCOUNT',
    launchCenter: { lat: -37.6878, lng: 176.1651, zoom: 11 },
    defaultAreaKey: 'tauranga',
    launchMode,
    feedbackEmail: 'feedback@example.com',
  })
  await db().doc('config/testers').set({ emails: [] })
}

export async function setLaunchMode(launchMode: 'BETA' | 'LIVE'): Promise<void> {
  await db().doc('config/app').set({ launchMode }, { merge: true })
}

/** An open event: submissions opened yesterday, expires in 30 days. */
export async function seedEvent(
  eventId = 'HALLOWEEN_2026',
  overrides: Partial<Record<'isActive' | 'opensInMs' | 'expiresInMs', number | boolean>> = {},
): Promise<string> {
  const now = Date.now()
  const opensIn = (overrides.opensInMs as number | undefined) ?? -DAY_MS
  const expiresIn = (overrides.expiresInMs as number | undefined) ?? 30 * DAY_MS
  const season = eventId.split('_')[0]
  const year = Number(eventId.split('_')[1])
  await db()
    .doc(`events/${eventId}`)
    .set({
      season,
      seasonYear: year,
      holidayDate: Timestamp.fromMillis(now + 10 * DAY_MS),
      submissionsOpenAt: Timestamp.fromMillis(now + opensIn),
      expiresAt: Timestamp.fromMillis(now + expiresIn),
      purgeAt: Timestamp.fromMillis(now + expiresIn + 400 * DAY_MS),
      isActive: (overrides.isActive as boolean | undefined) ?? true,
    })
  return eventId
}

export interface TestUser extends Caller {
  email: string
}

/** An Auth emulator user (Google-style 28-char uid); a tester unless `tester: false`. */
export async function newUser(opts: { tester?: boolean; emailVerified?: boolean; admin?: boolean } = {}): Promise<TestUser> {
  const uid = randomString(ALNUM, 28)
  const email = `${uid.toLowerCase()}@Example.com`
  await auth().createUser({ uid, email, emailVerified: opts.emailVerified ?? true })
  if (opts.tester ?? true) {
    await db()
      .doc('config/testers')
      .set({ emails: FieldValue.arrayUnion(email.toLowerCase()) }, { merge: true })
  }
  return { uid, admin: opts.admin ?? false, email }
}

/** A JPEG with EXIF camera + GPS tags (what a phone would upload). */
export async function gpsJpeg(width = 2400, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 240, g: 120, b: 20 } } })
    .jpeg({ quality: 85 })
    .withExif({
      IFD0: { Make: 'PorchlightTestCam', Model: 'GPS Phone 9000' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '37/1 42/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '176/1 17/1 24/1',
      },
    })
    .toBuffer()
}

/** A landscape JPEG whose EXIF says "rotate 90° clockwise" (Orientation 6). */
export async function rotatedJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

/** Puts a file where the client would: uploads/{uid}/{uploadId}. */
export async function upload(uid: string, data?: Buffer, uploadId = newUploadId()): Promise<string> {
  await bucket()
    .file(`uploads/${uid}/${uploadId}`)
    .save(data ?? (await gpsJpeg(800, 600)), { contentType: 'image/jpeg', resumable: false })
  return uploadId
}

export async function uploadExists(uid: string, uploadId: string): Promise<boolean> {
  const [exists] = await bucket().file(`uploads/${uid}/${uploadId}`).exists()
  return exists
}

export async function filesUnder(prefix: string): Promise<string[]> {
  const [files] = await bucket().getFiles({ prefix })
  return files.map((f) => f.name).sort()
}

export function createInput(eventId: string, uploadId: string, extra: Record<string, unknown> = {}) {
  return {
    eventId,
    uploadId,
    lat: PAPAMOA.lat,
    lng: PAPAMOA.lng,
    title: 'Pāpāmoa Pumpkin Parade',
    description: 'A pumpkin for every year.',
    consentOwnerOrPermission: true as const,
    ...extra,
  }
}

export async function expectReason(promise: Promise<unknown>, reason: FailReason): Promise<void> {
  await expect(promise).rejects.toMatchObject({ details: { reason } })
}

export function pinRef(pinId: string) {
  return db().doc(`pins/${pinId}`)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
