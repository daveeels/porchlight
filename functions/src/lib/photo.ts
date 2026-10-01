// Server-side photo cleaning (SPEC §6 createPin step 2, golden rule 4).
// Reads uploads/{uid}/{uploadId}, checks the real format, auto-orients from
// EXIF, re-encodes to WebP (sharp keeps NO metadata by default — this is the
// real EXIF/GPS strip) and writes photos/{pinId}/{uploadId}/full.webp +
// thumb.webp. Never call this inside a transaction.
import { randomUUID } from 'node:crypto'
import { getDownloadURL } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import sharp from 'sharp'
import { bucket } from './admin.js'
import { fail } from './errors.js'

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const MAX_INPUT_PIXELS = 50e6
export const FULL_EDGE_PX = 1600
export const THUMB_EDGE_PX = 400
export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])

export interface StoredPhoto {
  photoPath: string
  thumbPath: string
  photoUrl: string
  thumbUrl: string
}

/** Storage paths are always built from auth.uid, never from input (SPEC §6). */
export function uploadPath(uid: string, uploadId: string): string {
  return `uploads/${uid}/${uploadId}`
}

export function photoFolder(pinId: string, uploadId: string): string {
  return `photos/${pinId}/${uploadId}/`
}

export function photoPaths(pinId: string, uploadId: string): { photoPath: string; thumbPath: string } {
  const folder = photoFolder(pinId, uploadId)
  return { photoPath: `${folder}full.webp`, thumbPath: `${folder}thumb.webp` }
}

function invalidPhoto(): never {
  fail('PHOTO_INVALID', 'invalid-argument', "This photo format isn't supported — try a screenshot or JPEG.")
}

async function readUpload(uid: string, uploadId: string): Promise<Buffer> {
  const file = bucket().file(uploadPath(uid, uploadId))
  let size: number
  try {
    const [meta] = await file.getMetadata()
    size = Number(meta.size)
  } catch {
    fail('PHOTO_INVALID', 'invalid-argument', 'Photo upload not found — try again.')
  }
  if (!Number.isFinite(size) || size <= 0 || size >= UPLOAD_MAX_BYTES) {
    fail('PHOTO_INVALID', 'invalid-argument', 'That photo is too large — the limit is 10 MB.')
  }
  try {
    const [buf] = await file.download()
    return buf
  } catch {
    fail('PHOTO_INVALID', 'invalid-argument', 'Photo upload not found — try again.')
  }
}

async function encode(input: Buffer): Promise<{ full: Buffer; thumb: Buffer }> {
  const opts = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' } as const
  let format: string | undefined
  try {
    format = (await sharp(input, opts).metadata()).format
  } catch {
    invalidPhoto()
  }
  if (!format || !ALLOWED_FORMATS.has(format)) invalidPhoto()

  // rotate() with no angle applies the EXIF Orientation; the output carries
  // no EXIF, XMP, IPTC or ICC data (no withMetadata/keepMetadata).
  const base = sharp(input, opts).rotate()
  const resize = (edge: number) => ({ width: edge, height: edge, fit: 'inside' as const, withoutEnlargement: true })
  try {
    const [full, thumb] = await Promise.all([
      base.clone().resize(resize(FULL_EDGE_PX)).webp({ quality: 80 }).toBuffer(),
      base.clone().resize(resize(THUMB_EDGE_PX)).webp({ quality: 70 }).toBuffer(),
    ])
    return { full, thumb }
  } catch {
    invalidPhoto()
  }
}

function isPreconditionFailed(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 412
}

/**
 * Writes one cleaned photo and returns its download URL. Create only: a second
 * call with the same uploadId (a retry or a double-tap) must not replace the
 * download token behind a URL the first call may already have stored on the
 * pin, so an existing object (same upload, same bytes) is kept as it is.
 */
async function writePhoto(path: string, data: Buffer): Promise<string> {
  const file = bucket().file(path)
  const [exists] = await file.exists()
  if (exists) return getDownloadURL(file)
  try {
    await file.save(data, {
      resumable: false,
      contentType: 'image/webp',
      // Closes the race between the exists() check and this write.
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        cacheControl: PHOTO_CACHE_CONTROL,
        // getDownloadURL needs a Firebase download token on the object.
        metadata: { firebaseStorageDownloadTokens: randomUUID() },
      },
    })
  } catch (err) {
    // Already written from this same upload: reuse its token.
    if (!isPreconditionFailed(err)) throw err
  }
  return getDownloadURL(file)
}

/**
 * Cleans the user's upload into photos/{pinId}/{uploadId}/. Throws
 * PHOTO_INVALID for a missing, oversized or non-JPEG/PNG/WebP upload. If
 * writing fails half-way, whatever was written is removed before rethrowing.
 */
export async function processUpload(uid: string, uploadId: string, pinId: string): Promise<StoredPhoto> {
  const input = await readUpload(uid, uploadId)
  const { full, thumb } = await encode(input)
  const { photoPath, thumbPath } = photoPaths(pinId, uploadId)
  try {
    const [photoUrl, thumbUrl] = await Promise.all([writePhoto(photoPath, full), writePhoto(thumbPath, thumb)])
    return { photoPath, thumbPath, photoUrl, thumbUrl }
  } catch (err) {
    await deletePhotoFolder(photoFolder(pinId, uploadId))
    throw err
  }
}

/** Best effort: the client upload is never needed after the callable finishes. */
export async function deleteUpload(uid: string, uploadId: string): Promise<void> {
  try {
    await bucket().file(uploadPath(uid, uploadId)).delete({ ignoreNotFound: true })
  } catch (err) {
    logger.warn('Could not delete upload', { uid, error: String(err) })
  }
}

/** Best effort: deletes every object under `folder` (must end in '/'). */
export async function deletePhotoFolder(folder: string): Promise<void> {
  if (!folder.startsWith('photos/') || !folder.endsWith('/')) throw new Error(`Refusing to delete ${folder}`)
  try {
    await bucket().deleteFiles({ prefix: folder, force: true })
  } catch (err) {
    logger.warn('Could not delete photos', { folder, error: String(err) })
  }
}

/** The versioned folder holding a stored photo path, e.g. photos/{pinId}/{uploadId}/. */
export function folderOf(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const m = /^(photos\/[^/]+\/[^/]+\/)[^/]+$/.exec(path)
  return m?.[1] ?? null
}
