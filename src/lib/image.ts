// Client-side photo re-encode (SPEC F5): decode with EXIF orientation applied,
// shrink so the long edge is at most 1600 px, re-encode as JPEG. This only
// saves bandwidth — the server re-encodes with sharp and strips metadata.

export const MAX_EDGE_PX = 1600
export const JPEG_QUALITY = 0.85
/** Storage rule: size < 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

export type ImageErrorKind = 'unsupported' | 'too-large' | 'failed'

const MESSAGES: Record<ImageErrorKind, string> = {
  unsupported: "This photo format isn't supported — try a screenshot or JPEG.",
  'too-large': 'This photo is too big. Try a smaller one or a screenshot.',
  failed: "Couldn't prepare this photo. Try again or pick another.",
}

export class ImageError extends Error {
  constructor(readonly kind: ImageErrorKind) {
    super(MESSAGES[kind])
    this.name = 'ImageError'
  }
}

export interface Size {
  width: number
  height: number
}

/** Scales (w, h) down so the long edge is at most `maxEdge`; never scales up. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE_PX): Size {
  if (!(width > 0) || !(height > 0)) throw new RangeError('Image has no size')
  const long = Math.max(width, height)
  if (long <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Storage only accepts uploads under 10 MB. */
export function isWithinUploadLimit(bytes: number): boolean {
  return bytes > 0 && bytes < MAX_UPLOAD_BYTES
}

export interface PreparedImage extends Size {
  blob: Blob
}

type Drawable = ImageBitmap | HTMLImageElement

async function decode(file: Blob): Promise<{ source: Drawable; size: Size; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, size: { width: bmp.width, height: bmp.height }, release: () => bmp.close() }
    } catch {
      // Older Safari rejects the options bag or the format; try an <img>,
      // which also applies EXIF orientation (CSS image-orientation default).
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new ImageError('unsupported')
  }
  return {
    source: img,
    size: { width: img.naturalWidth, height: img.naturalHeight },
    release: () => URL.revokeObjectURL(url),
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ImageError('failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/** Decodes, resizes and re-encodes a picked photo. Rejects with ImageError. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const { source, size, release } = await decode(file)
  try {
    if (!(size.width > 0) || !(size.height > 0)) throw new ImageError('unsupported')
    const out = fitWithin(size.width, size.height)
    const canvas = document.createElement('canvas')
    canvas.width = out.width
    canvas.height = out.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageError('failed')
    // JPEG has no alpha: transparent PNG areas would otherwise turn black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, out.width, out.height)
    const blob = await toJpeg(canvas)
    if (!isWithinUploadLimit(blob.size)) throw new ImageError('too-large')
    return { blob, ...out }
  } catch (e) {
    throw e instanceof ImageError ? e : new ImageError('failed')
  } finally {
    release()
  }
}
