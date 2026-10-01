// Builds the PWA / favicon icons in public/icons/ from the brand SVGs (SPEC F10).
// Run: npm run icons:build   (re-run after editing src/assets/brand/*.svg)
//
// Sources:
//   src/assets/brand/porchlight-mark.svg     the mark on a transparent background
//   src/assets/brand/porchlight-favicon.svg  simplified mark for 16-32 px
// Outputs (committed, referenced by vite.config.ts and index.html):
//   icon-192.png, icon-512.png   purpose "any": rounded square, transparent corners
//   maskable-512.png             purpose "maskable": full bleed, mark inside the 80% safe zone
//   apple-touch-icon.png         180 px, full bleed (iOS rounds the corners itself, no transparency)
//   favicon-32.png, favicon-16.png, favicon.svg
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BRAND_DIR = resolve(ROOT, 'src/assets/brand')
const OUT_DIR = resolve(ROOT, 'public/icons')

/** Dark Halloween background (manifest background_color / theme_color). */
const BG = '#1a1025'
/** Canvas the composite SVGs are drawn on; sharp scales down from it. */
const CANVAS = 512

const mark = readFileSync(resolve(BRAND_DIR, 'porchlight-mark.svg'), 'utf8')
const faviconSvgPath = resolve(BRAND_DIR, 'porchlight-favicon.svg')
const favicon = readFileSync(faviconSvgPath, 'utf8')

/** The mark as a nested <svg>, scaled about the canvas centre. */
function nestedMark(scale: number): string {
  const size = CANVAS * scale
  const offset = (CANVAS - size) / 2
  return mark.replace(/^\s*<svg\b/, `<svg x="${offset}" y="${offset}" width="${size}" height="${size}" overflow="visible"`)
}

/**
 * A square icon: background (rounded or full bleed) with a faint centre glow
 * and the mark. `scale` keeps the mark inside a platform's safe zone.
 */
function iconSvg(opts: { radius: number; scale: number }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <defs>
    <radialGradient id="bg-glow" cx="256" cy="300" r="300" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3a1f3d"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" rx="${opts.radius}" fill="url(#bg-glow)"/>
  ${nestedMark(opts.scale)}
</svg>`
}

async function png(svg: string, size: number, file: string): Promise<void> {
  // High density so librsvg rasterises at (at least) the target size, then a
  // high-quality downscale.
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size, { fit: 'contain', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT_DIR, file))
  console.log(`  ${file} (${size}x${size})`)
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Writing icons to ${OUT_DIR}`)

  // "any": rounded square (~22% radius, like a launcher icon), mark at full size.
  const any = iconSvg({ radius: 112, scale: 1 })
  await png(any, 192, 'icon-192.png')
  await png(any, 512, 'icon-512.png')

  // "maskable": the launcher may crop to a circle of radius 40% of the size,
  // so everything important sits inside that circle (farthest point of the
  // mark, the step ends, is ~200/512 from the centre: x0.88 → ~176 < 204.8).
  await png(iconSvg({ radius: 0, scale: 0.88 }), 512, 'maskable-512.png')

  // iOS: opaque full-bleed square; iOS applies its own corner mask.
  await png(iconSvg({ radius: 0, scale: 0.92 }), 180, 'apple-touch-icon.png')

  // Favicons from the simplified source.
  await png(favicon, 32, 'favicon-32.png')
  await png(favicon, 16, 'favicon-16.png')
  copyFileSync(faviconSvgPath, resolve(OUT_DIR, 'favicon.svg'))
  console.log('  favicon.svg')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
