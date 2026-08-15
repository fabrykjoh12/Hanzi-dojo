// Regenerate every app icon from the LOCKED App Icon V2 masters.
//
// Approved 2026-08-15 (P14): the V2 balanced brush mark on the E2 shallow-inlay
// vermilion lacquer field. The single source of truth for the mark is the
// committed mask — docs/icon-v2/brush/masters/mask-V2.png — and every surface
// (iOS, Android, web, favicon) rasterises from it. Never regenerate any icon
// from favicon.svg, from Hanzi-logo.png, or from a redraw; if the mark ever
// changes, it changes in docs/icon-v2/brush/masters/ first and everything
// re-runs from here.
//
// The recipe below is byte-for-byte the one approved at the device gate
// (tools/icon-v2-device.mjs): field ramp #C24730→#B83A24→#8E2D1A, warm ivory
// #F8F1E9 mark, seeded grain, restrained sheen, 7% vignette, and E2's two
// ~7px inlay bands clipped inside the stroke. Changing any constant here is a
// DESIGN change and needs the gate re-run, not just a rebuild.
//
// What this deliberately does NOT touch:
//  - splash screens (assets/splash*.png, iOS Splash.imageset, android
//    drawable*/splash.png). The native splash hands off to the web overlay
//    (SplashIntro.jsx), which draws src/assets/Hanzi-logo.png — and that file
//    waits for the Home V3 migration to land. Regenerating the splashes now
//    would make the launch mark mismatch the overlay mark at the handoff.
//    Regenerate both together, after Home V3.
//  - src/assets/Hanzi-logo.png (same reason).
//
// Run: node tools/generate-app-icons.mjs
// Verify: node tools/verify-app-icons.mjs   (renders the regression sheets)

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const MASK_SRC = 'docs/icon-v2/brush/masters/mask-V2.png'
const S = 1024

// ── Approved palette (device gate) ─────────────────────────────────────────
const LACQ = {
  light: { hi: '#C24730', base: '#B83A24', lo: '#8E2D1A', mark: '#F8F1E9' },
  dark:  { hi: '#8F2E1C', base: '#7C2413', lo: '#5C1B0C', mark: '#EFE3D6' },
}
// The tinted ASSET is neutral greyscale (Apple: "provide your tinted app icon
// as a grayscale image") — the gate previews showed it through a simulated
// blue because that is how the OS presents it, but what ships is grey. The
// luminance relationship is the approved one: light figure on a dark field.
const TINTED = { hi: '#3A3A3A', base: '#2E2E2E', lo: '#1D1D1D', mark: '#EDEDED' }

// ═══ The locked mark ═══════════════════════════════════════════════════════
async function loadMask() {
  const { data, info } = await sharp(MASK_SRC).raw().toBuffer({ resolveWithObject: true })
  if (info.width !== S || info.height !== S) throw new Error('mask-V2.png must be 1024²')
  const a = new Uint8Array(S * S)
  for (let i = 0; i < S * S; i++) a[i] = data[i * info.channels]
  return a
}
// Small-size master: identical silhouette, interior dry-brush holes filled so
// they cannot alias into grey mush. Used whenever the RENDERED mark ≤ 64px —
// the one optical adjustment documented at the brush gate.
function solidify(a) {
  const inv = new Uint8Array(S * S)
  for (let i = 0; i < S * S; i++) inv[i] = a[i] > 40 ? 0 : 255
  const labels = new Int32Array(S * S).fill(-1)
  const stack = new Int32Array(S * S)
  const sizes = []
  let count = 0
  for (let s0 = 0; s0 < S * S; s0++) {
    if (inv[s0] <= 40 || labels[s0] !== -1) continue
    let top = 0, size = 0
    stack[top++] = s0; labels[s0] = count
    while (top > 0) {
      const p = stack[--top]; size++
      const x = p % S, y = (p / S) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue
        const q = ny * S + nx
        if (inv[q] > 40 && labels[q] === -1) { labels[q] = count; stack[top++] = q }
      }
    }
    sizes.push(size); count++
  }
  const touches = new Uint8Array(count)
  for (let x = 0; x < S; x++) { const t = labels[x], b = labels[(S - 1) * S + x]; if (t >= 0) touches[t] = 1; if (b >= 0) touches[b] = 1 }
  for (let y = 0; y < S; y++) { const l = labels[y * S], r = labels[y * S + S - 1]; if (l >= 0) touches[l] = 1; if (r >= 0) touches[r] = 1 }
  const out = a.slice()
  for (let i = 0; i < S * S; i++) { const L = labels[i]; if (L >= 0 && !touches[L]) out[i] = 255 }
  return out
}
const MARK = await loadMask()
const MARK_SMALL = solidify(MARK)

// Measure the mark's real extent so coverage numbers mean what they say.
let MARK_SPAN = 0
{
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1
  for (let i = 0; i < S * S; i++) {
    if (MARK[i] <= 40) continue
    const x = i % S, y = (i / S) | 0
    if (x < minx) minx = x; if (x > maxx) maxx = x
    if (y < miny) miny = y; if (y > maxy) maxy = y
  }
  MARK_SPAN = Math.max(maxx - minx, maxy - miny) / S     // ≈ 0.664
}

// Re-canvas a mask so the mark spans `coverage` of the 1024 canvas.
const scaledCache = {}
async function markAt(coverage, small) {
  const key = coverage.toFixed(3) + (small ? 's' : '')
  if (scaledCache[key]) return scaledCache[key]
  const src = small ? MARK_SMALL : MARK
  if (Math.abs(coverage - MARK_SPAN) < 0.004) return (scaledCache[key] = src)
  const f = coverage / MARK_SPAN
  const tw = Math.round(S * f)
  const { data, info } = await sharp(Buffer.from(src), { raw: { width: S, height: S, channels: 1 } })
    .resize(tw, tw, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const out = new Uint8Array(S * S)
  const off = (S - info.width) >> 1
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const oy = off + y, ox = off + x
    if (ox >= 0 && oy >= 0 && ox < S && oy < S) out[oy * S + ox] = data[(y * info.width + x) * info.channels]
  }
  return (scaledCache[key] = out)
}

// ═══ Pixel helpers ═════════════════════════════════════════════════════════
function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] }
function tintPNG(mask, hex, opacity = 1) {
  const [r, g, b] = hex2rgb(hex)
  const out = Buffer.alloc(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b
    out[i * 4 + 3] = Math.round(mask[i] * opacity)
  }
  return sharp(out, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer()
}
function shift(mask, dx, dy) {
  const out = new Uint8Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = x - dx, sy = y - dy
    if (sx >= 0 && sy >= 0 && sx < S && sy < S) out[y * S + x] = mask[sy * S + sx]
  }
  return out
}
function band(mask, dx, dy) {
  const sh = shift(mask, dx, dy)
  const out = new Uint8Array(S * S)
  for (let i = 0; i < S * S; i++) out[i] = Math.min(mask[i], 255 - sh[i])
  return out
}
const blurPNG = (buf, sigma) => sharp(buf).blur(sigma).png().toBuffer()

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const GRAIN = (() => {
  const rnd = mulberry32(20260815)
  const dark = [], light = []
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() * S).toFixed(1), y = (rnd() * S).toFixed(1)
    const r = (0.8 + rnd() * 1.8).toFixed(2)
    ;(rnd() > 0.48 ? dark : light).push(`<circle cx="${x}" cy="${y}" r="${r}"/>`)
  }
  return `<g fill="#000" opacity="0.04">${dark.join('')}</g><g fill="#FFF" opacity="0.035">${light.join('')}</g>`
})()
function fieldSVG(pal, sheen) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
<defs>
  <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${pal.hi}"/><stop offset="0.5" stop-color="${pal.base}"/>
    <stop offset="1" stop-color="${pal.lo}"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#FFF" stop-opacity="0.11"/>
    <stop offset="0.28" stop-color="#FFF" stop-opacity="0.04"/>
    <stop offset="0.46" stop-color="#FFF" stop-opacity="0"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFF" stop-opacity="0.16"/>
    <stop offset="1" stop-color="#FFF" stop-opacity="0"/></linearGradient>
  <radialGradient id="vig" cx="0.42" cy="0.4" r="0.85">
    <stop offset="0.62" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.07"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#body)"/>
${GRAIN}
${sheen ? `<rect width="${S}" height="${S}" fill="url(#sheen)"/><rect width="${S}" height="26" fill="url(#rim)"/>` : ''}
<rect width="${S}" height="${S}" fill="url(#vig)"/>
</svg>`
}

// The mark layer at a given coverage: ivory brush + E2 inlay bands, on
// transparent. Band geometry lives in 1024-mask space, so it scales with the
// mark and stays proportionally the approved ~7px-at-full-size.
async function markLayerPNG(coverage, { small = false, color, bands = true } = {}) {
  const m = await markAt(coverage, small)
  const layers = [{ input: await tintPNG(m, color) }]
  if (bands) {
    layers.push({ input: await blurPNG(await tintPNG(band(m, 7, 9), '#000000', 0.20), 2.2) })
    layers.push({ input: await blurPNG(await tintPNG(band(m, -6, -8), '#FFFFFF', 0.15), 2.2) })
  }
  const base = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  return sharp(base).composite(layers).png().toBuffer()
}

// The complete flat icon (full square, no corner rounding — every OS masks).
const flatCache = {}
async function flatIcon(mode, small = false) {
  const key = mode + (small ? 's' : '')
  if (flatCache[key]) return flatCache[key]
  const pal = mode === 'tinted' ? TINTED : LACQ[mode]
  const bg = await sharp(Buffer.from(fieldSVG(pal, mode !== 'tinted'))).png().toBuffer()
  const mark = await markLayerPNG(MARK_SPAN, { small, color: pal.mark, bands: mode !== 'tinted' })
  return (flatCache[key] = await sharp(bg).composite([{ input: mark }]).png().toBuffer())
}

// Rendered-mark size decides the master: ≤64px of actual brush → small master.
const smallFor = (size, coverage = MARK_SPAN) => size * coverage <= 64

async function writeSized(buf, size, path, { opaque = false, maskD = null } = {}) {
  let img = sharp(buf).resize(size, size, { kernel: 'lanczos3' })
  if (maskD) {
    const m = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="${maskD}" fill="#fff"/></svg>`
    )).png().toBuffer()
    img = sharp(await img.png().toBuffer()).composite([{ input: m, blend: 'dest-in' }])
  }
  if (opaque) img = sharp(await img.png().toBuffer()).removeAlpha()
  await img.png().toFile(path)
  console.log('  ' + path + (opaque ? ' (opaque)' : ''))
}
const circlePath = (r) => `M 0,${r} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0 Z`
  .replace('M 0', `M ${0}`)

// ═══ iOS ═══════════════════════════════════════════════════════════════════
// Single-size 1024 catalog, three authored appearances. The light/marketing
// icon must carry no alpha channel at all (App Store Connect rejects it).
// Dark is full-square opaque lacquer — the documented, deliberate departure
// from Apple's transparent-background advice: the field IS the identity.
// Tinted is opaque neutral greyscale; the OS maps it through the user's tint.
console.log('ios/')
const IOS_DIR = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/'
await writeSized(await flatIcon('light'), 1024, IOS_DIR + 'AppIcon-512@2x.png', { opaque: true })
await writeSized(await flatIcon('dark'), 1024, IOS_DIR + 'AppIcon-Dark.png', { opaque: true })
await writeSized(await flatIcon('tinted'), 1024, IOS_DIR + 'AppIcon-Tinted.png', { opaque: true })

// ═══ Android ═══════════════════════════════════════════════════════════════
// Adaptive layers are 108dp canvases (not 48dp launcher sizes — the old
// generator's mistake). Background: FULL-BLEED field, no inset — the outer
// 18dp is the launcher's parallax margin and must be painted. Foreground and
// monochrome: mark at 44% of the 108dp canvas, which puts it well inside the
// 66dp safe zone AND reproduces the approved look — 66% of the visible 72dp,
// exactly the proportion of the flat icon. Legacy 48dp-based PNGs remain for
// API 24-25.
console.log('android/')
const RES = 'android/app/src/main/res/'
const LAYER = { ldpi: 81, mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
const LEGACY = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const FG_COV = 0.44
const bgFlat = await sharp(Buffer.from(fieldSVG(LACQ.light, true))).png().toBuffer()
for (const [density, size] of Object.entries(LAYER)) {
  const dir = RES + 'mipmap-' + density + '/'
  mkdirSync(dir, { recursive: true })
  await writeSized(bgFlat, size, dir + 'ic_launcher_background.png')
  const small = smallFor(size, FG_COV)
  await writeSized(await markLayerPNG(FG_COV, { small, color: LACQ.light.mark }), size, dir + 'ic_launcher_foreground.png')
  // Monochrome: the REAL brush silhouette, flat white on transparent — the
  // launcher keeps only the alpha and applies its own theme colours. Always
  // the solid small master: themed icons render small and single-tone, where
  // interior holes only sparkle.
  await writeSized(await markLayerPNG(FG_COV, { small: true, color: '#FFFFFF', bands: false }), size, dir + 'ic_launcher_monochrome.png')
}
for (const [density, size] of Object.entries(LEGACY)) {
  const dir = RES + 'mipmap-' + density + '/'
  const small = smallFor(size)
  await writeSized(await flatIcon('light', small), size, dir + 'ic_launcher.png')
  await writeSized(await flatIcon('light', small), size, dir + 'ic_launcher_round.png',
    { maskD: circlePath(size / 2) })
}

// ═══ Capacitor asset sources (kept coherent with the layers) ═══════════════
console.log('assets/')
await writeSized(await flatIcon('light'), 1024, 'assets/icon-only.png')
await writeSized(await markLayerPNG(FG_COV, { color: LACQ.light.mark }), 1024, 'assets/icon-foreground.png')
await writeSized(bgFlat, 1024, 'assets/icon-background.png')

// Icon Composer masters: flat layers with NO baked gradient/blur/shadow —
// the composer applies material itself. The ramp/sheen/vignette numbers it
// should reproduce are the constants at the top of this file.
const IC_DIR = 'assets/icon-composer/'
mkdirSync(IC_DIR, { recursive: true })
await sharp({ create: { width: S, height: S, channels: 3, background: hex2rgb(LACQ.light.base).reduce((o, v, i) => ({ ...o, [['r', 'g', 'b'][i]]: v }), {}) } })
  .png().toFile(IC_DIR + 'layer1-field-flat.png')
console.log('  ' + IC_DIR + 'layer1-field-flat.png')
writeFileSync(IC_DIR + 'layer2-mark.png', await tintPNG(MARK, LACQ.light.mark))
console.log('  ' + IC_DIR + 'layer2-mark.png')
{
  const base = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  const inlay = await sharp(base).composite([
    { input: await blurPNG(await tintPNG(band(MARK, 7, 9), '#000000', 0.20), 2.2) },
    { input: await blurPNG(await tintPNG(band(MARK, -6, -8), '#FFFFFF', 0.15), 2.2) },
  ]).png().toBuffer()
  writeFileSync(IC_DIR + 'layer3-inlay.png', inlay)
  console.log('  ' + IC_DIR + 'layer3-inlay.png')
}
writeFileSync(IC_DIR + 'layer4-grain.png', await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${GRAIN}</svg>`)).png().toBuffer())
console.log('  ' + IC_DIR + 'layer4-grain.png')

// ═══ Web / PWA ═════════════════════════════════════════════════════════════
// Maskable: the launcher may crop to a circle whose safe zone is a centred
// 80%-diameter circle. The mark at its standard ~66% coverage sits inside it,
// and the field is full-bleed — same asset shape as the adaptive icon.
console.log('public/')
await writeSized(await flatIcon('light'), 192, 'public/icon-192.png')
await writeSized(await flatIcon('light'), 512, 'public/icon-512.png')
await writeSized(await flatIcon('light'), 512, 'public/maskable-512.png')
await writeSized(await flatIcon('light'), 180, 'public/apple-touch-icon.png', { opaque: true })
await writeSized(await markLayerPNG(MARK_SPAN, { small: true, color: '#FFFFFF', bands: false }), 512, 'public/monochrome-512.png')

// Favicon: the SAME mark, not a separate drawing. The mark is raster by
// nature (a cleaned brush stroke), so the SVG embeds an optimised PNG of the
// solid small master — vermilion on transparent, so it reads on light and
// dark browser tabs alike. A hand-traced vector would fork the silhouette,
// which is exactly what this file used to do.
{
  const fav = await sharp(await markLayerPNG(MARK_SPAN, { small: true, color: '#B83A24', bands: false }))
    .resize(160, 160, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true }).toBuffer()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <!-- Hanzi Dojo mark: the V2 refined brush ensō, identical to the app icon.
       Embedded raster on purpose — the brush mask IS the master
       (docs/icon-v2/brush/masters/mask-V2.png); a traced vector would fork it.
       Regenerate via tools/generate-app-icons.mjs, never by hand. -->
  <image width="160" height="160" href="data:image/png;base64,${fav.toString('base64')}"/>
</svg>
`
  writeFileSync('public/favicon.svg', svg)
  console.log('  public/favicon.svg (' + (svg.length / 1024).toFixed(1) + ' KB)')
}

console.log('done')
