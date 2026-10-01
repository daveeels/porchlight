import { describe, expect, it, vi } from 'vitest'
import { SEASON_THEMES } from '@/config/seasons'
import { MARKER_IMAGE, MARKER_SIZE, drawMarker, markerImages, markerPixelRatio, markerStyle } from '@/lib/markerImages'

describe('markerStyle', () => {
  it('uses the full season color for verified pins', () => {
    const s = markerStyle(SEASON_THEMES.HALLOWEEN, true)
    expect(s).toMatchObject({ fill: SEASON_THEMES.HALLOWEEN.marker.verified, emoji: '🎃', alpha: 1, check: true })
  })

  it('fades unverified pins and drops the check', () => {
    const s = markerStyle(SEASON_THEMES.CHRISTMAS, false)
    expect(s.fill).toBe(SEASON_THEMES.CHRISTMAS.marker.unverified)
    expect(s.emoji).toBe('🎄')
    expect(s.alpha).toBeLessThan(1)
    expect(s.check).toBe(false)
  })
})

describe('markerPixelRatio', () => {
  it('is at least 1 and capped at 2', () => {
    expect(markerPixelRatio(undefined)).toBe(1)
    expect(markerPixelRatio(0.5)).toBe(1)
    expect(markerPixelRatio(1)).toBe(1)
    expect(markerPixelRatio(1.5)).toBe(2)
    expect(markerPixelRatio(3)).toBe(2)
    expect(markerPixelRatio(Number.NaN)).toBe(1)
  })
})

function fakeDocument(ctx: Partial<CanvasRenderingContext2D> | null) {
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) }
  return { doc: { createElement: vi.fn(() => canvas) } as unknown as Document, canvas }
}

function fakeContext() {
  const noop = () => {}
  return {
    scale: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    fillText: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    })),
  } as unknown as CanvasRenderingContext2D
}

describe('drawMarker', () => {
  it('returns null when canvas 2D is unavailable', () => {
    const { doc } = fakeDocument(null)
    expect(drawMarker(markerStyle(SEASON_THEMES.HALLOWEEN, true), 1, doc)).toBeNull()
  })

  it('draws at the pixel ratio and includes the emoji', () => {
    const ctx = fakeContext()
    const { doc, canvas } = fakeDocument(ctx)
    const img = drawMarker(markerStyle(SEASON_THEMES.HALLOWEEN, true), 2, doc)
    expect(canvas.width).toBe(MARKER_SIZE * 2)
    expect(img?.width).toBe(MARKER_SIZE * 2)
    expect(ctx.fillText).toHaveBeenCalledWith('🎃', expect.any(Number), expect.any(Number))
  })
})

describe('markerImages', () => {
  it('returns both named images', () => {
    const { doc } = fakeDocument(fakeContext())
    const imgs = markerImages(SEASON_THEMES.HALLOWEEN, 1, doc)
    expect(imgs.map((i) => i.name)).toEqual([MARKER_IMAGE.verified, MARKER_IMAGE.unverified])
    expect(imgs.every((i) => i.pixelRatio === 1)).toBe(true)
  })

  it('returns nothing when drawing is impossible', () => {
    const { doc } = fakeDocument(null)
    expect(markerImages(SEASON_THEMES.HALLOWEEN, 1, doc)).toEqual([])
  })
})
