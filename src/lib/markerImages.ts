// Canvas-drawn marker icons for the browse map (SPEC §3 theming). Drawn at
// runtime so they can be re-added with addImage after every setStyle, which
// wipes a style's images. Colors and emoji come from SEASON_THEMES.
import type { SeasonTheme } from '@/config/seasons'

export const MARKER_IMAGE = {
  verified: 'pl-marker-verified',
  unverified: 'pl-marker-unverified',
} as const

/** Marker width/height in CSS pixels. */
export const MARKER_SIZE = 40

export interface MarkerStyle {
  fill: string
  ring: string
  emoji: string
  /** Overall opacity: unverified markers are faded. */
  alpha: number
  /** Draw the small check badge (verified only). */
  check: boolean
}

export interface MarkerImage {
  name: string
  image: ImageData
  pixelRatio: number
}

export function markerStyle(theme: SeasonTheme, verified: boolean): MarkerStyle {
  return verified
    ? { fill: theme.marker.verified, ring: '#ffffff', emoji: theme.icon, alpha: 1, check: true }
    : { fill: theme.marker.unverified, ring: '#ffffff', emoji: theme.icon, alpha: 0.55, check: false }
}

/** Device pixel ratio for crisp icons, capped at 2 to keep images small. */
export function markerPixelRatio(dpr: number | undefined): number {
  if (!dpr || !Number.isFinite(dpr) || dpr < 1) return 1
  return Math.min(2, Math.ceil(dpr))
}

/**
 * Draws one marker (round badge, white ring, season emoji, optional check).
 * Returns null where canvas 2D isn't available (tests, very old browsers).
 */
export function drawMarker(style: MarkerStyle, pixelRatio = 1, doc: Document = document): ImageData | null {
  const px = Math.round(MARKER_SIZE * pixelRatio)
  const canvas = doc.createElement('canvas')
  canvas.width = px
  canvas.height = px
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    return null
  }
  if (!ctx) return null

  ctx.scale(pixelRatio, pixelRatio)
  const c = MARKER_SIZE / 2
  const r = MARKER_SIZE / 2 - 3

  ctx.globalAlpha = style.alpha
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.fillStyle = style.fill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 2.5
  ctx.strokeStyle = style.ring
  ctx.stroke()

  ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(style.emoji, c, c + 1)

  if (style.check) {
    const bx = MARKER_SIZE - 8
    const by = 8
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(bx, by, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(bx - 3, by)
    ctx.lineTo(bx - 0.8, by + 2.4)
    ctx.lineTo(bx + 3.2, by - 2.4)
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1b7f3b'
    ctx.stroke()
  }

  try {
    return ctx.getImageData(0, 0, px, px)
  } catch {
    return null
  }
}

/** Both marker images for a season, ready for map.addImage(name, image, { pixelRatio }). */
export function markerImages(theme: SeasonTheme, pixelRatio = 1, doc: Document = document): MarkerImage[] {
  const out: MarkerImage[] = []
  for (const verified of [true, false]) {
    const image = drawMarker(markerStyle(theme, verified), pixelRatio, doc)
    if (image) out.push({ name: verified ? MARKER_IMAGE.verified : MARKER_IMAGE.unverified, image, pixelRatio })
  }
  return out
}
