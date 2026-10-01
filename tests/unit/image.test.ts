import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ImageError,
  MAX_EDGE_PX,
  MAX_UPLOAD_BYTES,
  fitWithin,
  isWithinUploadLimit,
  prepareImage,
} from '@/lib/image'

describe('fitWithin', () => {
  it('leaves images at or under 1600 px alone', () => {
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1, 1)).toEqual({ width: 1, height: 1 })
  })

  it('never scales up', () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 })
  })

  it('scales landscape so the width is the long edge', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3200, 1000)).toEqual({ width: 1600, height: 500 })
  })

  it('scales portrait so the height is the long edge', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
  })

  it('handles square and odd sizes with rounding', () => {
    expect(fitWithin(2000, 2000)).toEqual({ width: 1600, height: 1600 })
    expect(fitWithin(4000, 2999)).toEqual({ width: 1600, height: 1200 }) // 1199.6 → 1200
    expect(fitWithin(1601, 1)).toEqual({ width: 1600, height: 1 })
  })

  it('keeps a 1 px minimum for extreme panoramas', () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 1600, height: 1 })
  })

  it('keeps the long edge within the limit and the aspect ratio close', () => {
    for (const [w, h] of [
      [5000, 3333],
      [1920, 1080],
      [1080, 2340],
      [12000, 9000],
    ] as const) {
      const out = fitWithin(w, h)
      expect(Math.max(out.width, out.height)).toBe(MAX_EDGE_PX)
      expect(Math.abs(out.width / out.height - w / h)).toBeLessThan(0.01)
    }
  })

  it('takes a custom max edge', () => {
    expect(fitWithin(800, 400, 400)).toEqual({ width: 400, height: 200 })
  })

  it('rejects empty sizes', () => {
    expect(() => fitWithin(0, 100)).toThrow(RangeError)
    expect(() => fitWithin(100, Number.NaN)).toThrow(RangeError)
  })
})

describe('isWithinUploadLimit', () => {
  it('matches the storage rule (size < 10 MB)', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
    expect(isWithinUploadLimit(1)).toBe(true)
    expect(isWithinUploadLimit(MAX_UPLOAD_BYTES - 1)).toBe(true)
    expect(isWithinUploadLimit(MAX_UPLOAD_BYTES)).toBe(false)
    expect(isWithinUploadLimit(0)).toBe(false)
  })
})

describe('prepareImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects undecodable files with the friendly message', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('bad', 'InvalidStateError')))
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new DOMException('bad', 'EncodingError'))
    const err = await prepareImage(new Blob(['not an image'], { type: 'image/heic' })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ImageError)
    expect((err as ImageError).kind).toBe('unsupported')
    expect((err as ImageError).message).toBe("This photo format isn't supported — try a screenshot or JPEG.")
  })

  it('asks for EXIF orientation and draws at the fitted size', async () => {
    const close = vi.fn()
    const bitmap = vi.fn().mockResolvedValue({ width: 4032, height: 3024, close })
    vi.stubGlobal('createImageBitmap', bitmap)
    const drawImage = vi.fn()
    const ctx = { fillRect: vi.fn(), drawImage, fillStyle: '', imageSmoothingQuality: 'low' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
    let type = ''
    let quality = 0
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb, t, q) {
      type = t ?? ''
      quality = q ?? 0
      cb(new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }))
    })

    const out = await prepareImage(new Blob(['x'], { type: 'image/jpeg' }))
    expect(bitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200)
    expect(out).toMatchObject({ width: 1600, height: 1200 })
    expect(out.blob.size).toBe(1000)
    expect(type).toBe('image/jpeg')
    expect(quality).toBe(0.85)
    expect(close).toHaveBeenCalled()
  })

  it('rejects results of 10 MB or more', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb({ size: MAX_UPLOAD_BYTES } as Blob)
    })
    const err = await prepareImage(new Blob(['x'])).catch((e: unknown) => e)
    expect((err as ImageError).kind).toBe('too-large')
  })
})
