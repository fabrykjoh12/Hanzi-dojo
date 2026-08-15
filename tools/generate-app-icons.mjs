// Regenerate every app icon and splash from the REAL brush ensō.
//
// The originals were rasterised from public/favicon.svg — a single clean arc
// with round caps. Fine as a 16px favicon, wrong as the app icon: it shares
// nothing with the brand mark, which is a textured brush stroke.
//
// Done with sharp rather than @capacitor/assets on purpose: that tool also
// rewrites public/manifest.webmanifest, and last time it wrote scope-escaping
// ../icons/ paths and typed a .webp as image/png.

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const SOURCE = 'src/assets/86055582-d1d3-4cb7-a460-6c907025fe15.png'
const LIGHT = { r: 250, g: 250, b: 248 }   // matches Splash.imageset + SPLASH_BG
const DARK = { r: 15, g: 17, b: 21 }

// The source ships a stock-preview checkerboard baked into its pixels as fake
// transparency. Key it out: the checkerboard is neutral, the ink is red, so
// colourfulness IS the alpha channel. Then un-multiply against the grey it was
// composited on, or every anti-aliased brush edge stays muddy.
async function keyedMaster() {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: ch } = info
  const out = Buffer.alloc(W * H * 4)
  const BG = 248
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1

  for (let i = 0; i < W * H; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2]
    const colourfulness = Math.max(r, g, b) - Math.min(r, g, b)
    let a = Math.min(1, colourfulness / 150)
    if (a < 0.04) a = 0
    let R = r, G = g, B = b
    if (a > 0 && a < 1) {
      R = Math.min(255, Math.max(0, (r - (1 - a) * BG) / a))
      G = Math.min(255, Math.max(0, (g - (1 - a) * BG) / a))
      B = Math.min(255, Math.max(0, (b - (1 - a) * BG) / a))
    }
    out[i * 4] = R; out[i * 4 + 1] = G; out[i * 4 + 2] = B; out[i * 4 + 3] = Math.round(a * 255)
    if (a > 0.12) {
      const x = i % W, y = (i / W) | 0
      if (x < minx) minx = x; if (x > maxx) maxx = x
      if (y < miny) miny = y; if (y > maxy) maxy = y
    }
  }

  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minx, top: miny, width: maxx - minx + 1, height: maxy - miny + 1 })
    .png().toBuffer()
}

const master = await keyedMaster()

// The mark at `coverage` of the canvas, centred, over an optional background.
async function compose(size, coverage, bg) {
  // coverage 0 = the plain ground, no mark (the adaptive-icon background layer).
  if (coverage === 0) {
    return sharp({ create: { width: size, height: size, channels: 4,
      background: { ...bg, alpha: 1 } } }).png().toBuffer()
  }
  const inner = Math.round(size * coverage)
  const mark = await sharp(master).resize(inner, inner, { fit: 'contain', kernel: 'lanczos3',
    background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  const offset = Math.round((size - inner) / 2)
  return sharp({ create: { width: size, height: size, channels: 4,
    background: bg ? { ...bg, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: offset, top: offset }])
    .png().toBuffer()
}

const write = async (buf, path) => { await sharp(buf).toFile(path); console.log('  ' + path) }

// App Store Connect rejects a marketing icon that carries an alpha channel at
// all, even one that is fully opaque — so this one is flattened, not just
// composited over a background.
const writeOpaque = async (buf, path) => {
  await sharp(buf).flatten({ background: LIGHT }).removeAlpha().toFile(path)
  console.log('  ' + path + ' (opaque)')
}

// ── Capacitor asset sources ────────────────────────────────────────────────
// 0.68 leaves the breathing room iOS icons need — the OS rounds the corners
// and the mark should not crowd them.
console.log('assets/')
await write(await compose(1024, 0.68, LIGHT), 'assets/icon-only.png')
// Android draws the adaptive foreground inside its own ~16.7% inset, so the
// mark must be small in ITS frame or the launcher crops the brush.
await write(await compose(1024, 0.50, null), 'assets/icon-foreground.png')
await write(await compose(1024, 0, LIGHT), 'assets/icon-background.png')
// 0.15 is not arbitrary. The launch storyboard draws this square image
// scaleAspectFill, so on a portrait screen it scales to the screen HEIGHT —
// which makes the mark render at exactly `coverage x screen height` points.
// The web overlay that takes over uses 15vh for the same reason, so the logo
// does not jump size at the handoff.
await write(await compose(2732, 0.15, LIGHT), 'assets/splash.png')
await write(await compose(2732, 0.15, DARK), 'assets/splash-dark.png')

// ── iOS ────────────────────────────────────────────────────────────────────
// The App Store icon must be fully opaque — a transparent one is rejected.
console.log('ios/')
await writeOpaque(await compose(1024, 0.68, LIGHT), 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')

const SPLASH_DIR = 'ios/App/App/Assets.xcassets/Splash.imageset/'
const splashLight = await compose(2732, 0.15, LIGHT)
const splashDark = await compose(2732, 0.15, DARK)
for (const scale of ['@1x', '@2x', '@3x']) {
  await write(splashLight, SPLASH_DIR + 'Default' + scale + '~universal~anyany.png')
  await write(splashDark, SPLASH_DIR + 'Default' + scale + '~universal~anyany-dark.png')
}
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await write(splashLight, SPLASH_DIR + name)
}

// ── Android ────────────────────────────────────────────────────────────────
console.log('android/')
const DENSITIES = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [density, size] of Object.entries(DENSITIES)) {
  const dir = 'android/app/src/main/res/mipmap-' + density + '/'
  mkdirSync(dir, { recursive: true })
  await write(await compose(size, 0.68, LIGHT), dir + 'ic_launcher.png')
  await write(await compose(size, 0.68, LIGHT), dir + 'ic_launcher_round.png')
  await write(await compose(size, 0.50, null), dir + 'ic_launcher_foreground.png')
  await write(await compose(size, 0, LIGHT), dir + 'ic_launcher_background.png')
}

// ── PWA / web ──────────────────────────────────────────────────────────────
// A maskable icon is cropped to a circle by the launcher, so its mark sits
// inside the safe zone (40% of the canvas) rather than filling it.
console.log('public/')
await write(await compose(192, 0.68, LIGHT), 'public/icon-192.png')
await write(await compose(512, 0.68, LIGHT), 'public/icon-512.png')
await write(await compose(512, 0.46, LIGHT), 'public/maskable-512.png')
await write(await compose(180, 0.68, LIGHT), 'public/apple-touch-icon.png')

console.log('done')
