// P14 — App Icon V2 concept renderer. CONCEPTS ONLY.
//
// This script writes NOTHING into any production icon path. It only writes to
// docs/icon-v2/. It does not touch ios/, android/, public/, assets/ or src/.
// tools/generate-app-icons.mjs remains the production generator and is not
// modified or invoked here.
//
// What it produces:
//   docs/icon-v2/masters/*.svg    the layered vector masters (Icon Composer input)
//   docs/icon-v2/previews/*.png   flattened comparison sheets
//
// The masters are deliberately FLAT — no baked blur, shadow, gradient or
// translucency — because Icon Composer wants exactly that and applies the
// Liquid Glass material itself ("Remove blurs and shadows, and specular,
// opacity, and translucency settings. Remove background colors and
// gradients."). The lighting you see in the previews is applied by a separate
// composite step here, standing in for what the OS would do.
//
// Run: node tools/icon-v2-concepts.mjs

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const S = 1024
const OUT = 'docs/icon-v2/'
mkdirSync(OUT + 'masters', { recursive: true })
mkdirSync(OUT + 'previews', { recursive: true })

// ── Palette ────────────────────────────────────────────────────────────────
// Everything derives from the product accent #B83A24 (languageTheme.js,
// chinese.accentHex). The light/dark steps are measured, not eyeballed:
// hi = +7% relative luminance, lo = -15%, dark body = -27%.
const P = {
  light: { hi: '#C64A2E', base: '#B83A24', lo: '#96301C', mark: '#F8F1E9' },
  dark:  { hi: '#94301E', base: '#872817', lo: '#68200F', mark: '#EFE3D6' },
  mono:  { hi: '#343434', base: '#2A2A2A', lo: '#171717', mark: '#F2F2F2' },
}
// A representative iOS tint. The system maps the greyscale asset's luminance
// through the user's chosen colour; mark = light end, body = dark end.
const TINT = { hi: '#2B333F', base: '#222932', lo: '#161A20', mark: '#A9C6EC' }

// ── Geometry helpers ───────────────────────────────────────────────────────

// A tapered stroke as a quadrilateral. Flat terminals: carved, not painted.
function taper(x1, y1, x2, y2, w1, w2) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy)
  const px = -dy / L, py = dx / L
  const p = (x, y, w, s) => (x + px * (w / 2) * s).toFixed(2) + ',' + (y + py * (w / 2) * s).toFixed(2)
  return 'M ' + p(x1, y1, w1, 1) + ' L ' + p(x2, y2, w2, 1) +
         ' L ' + p(x2, y2, w2, -1) + ' L ' + p(x1, y1, w1, -1) + ' Z'
}

// |x/a|^n + |y/a|^n = 1 sampled as a polygon. n=5 ≈ the iOS squircle,
// n=4 ≈ the Android squircle mask.
function superellipse(cx, cy, half, n, steps = 512) {
  const pts = []
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps
    const ct = Math.cos(t), st = Math.sin(t)
    const x = cx + half * Math.sign(ct) * Math.abs(ct) ** (2 / n)
    const y = cy + half * Math.sign(st) * Math.abs(st) ** (2 / n)
    pts.push(x.toFixed(2) + ',' + y.toFixed(2))
  }
  return 'M ' + pts.join(' L ') + ' Z'
}

function circlePath(cx, cy, r) {
  return `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0 Z`
}

// Rounded rect with per-corner radii [tl, tr, br, bl]. Drives the Android masks.
function rrect(x, y, w, h, [tl, tr, br, bl]) {
  return `M ${x + tl},${y} H ${x + w - tr} A ${tr},${tr} 0 0 1 ${x + w},${y + tr}` +
         ` V ${y + h - br} A ${br},${br} 0 0 1 ${x + w - br},${y + h}` +
         ` H ${x + bl} A ${bl},${bl} 0 0 1 ${x},${y + h - bl}` +
         ` V ${y + tl} A ${tl},${tl} 0 0 1 ${x + tl},${y} Z`
}

// ── Layer 2: the three principal marks ─────────────────────────────────────
// Each returns one path string, drawn in the mark colour, fill-rule evenodd.
// All three are sized to span ~62% of the canvas: comfortably inside the iOS
// icon grid, and correctly sized for the Android 66dp safe zone.

// A1 — geometric ring. Constructed, not painted: two true circles, the inner
// one offset up-left by 26px so the ring's weight modulates 84 → 136 (1.6:1)
// and thickens away from the light. No splinters, no gap, no flecks.
const MARK_A1 = {
  rule: 'evenodd', rot: 0,
  parts: [circlePath(512, 512, 300), circlePath(496, 492, 190)],
}

// A2 — 文 (wén, "writing / language"), redrawn as a logo mark. Flat-cut
// terminals, geometric taper, authentic stroke logic: the 横 rises to the
// right, the 撇 tapers away to a point, the 捺 swells to a flat foot. The two
// diagonals overlap the bar deliberately so the whole character is one shape.
// Weights are set by the 40px gate, not by the 1024 drawing: the 横 is 9% of the
// canvas so it survives as ~3.6px, and the 点 is allowed to fuse into it there.
// Drawn as separate paths with nonzero winding — one evenodd path would punch
// a hole where 撇 and 捺 cross.
const MARK_A2 = {
  rule: 'nonzero', rot: 0,
  parts: [
    taper(460, 180, 526, 270, 70, 92),               // 点  the top dot
    'M 250,350 L 774,336 L 774,428 L 250,442 Z',     // 横  the horizontal
    taper(604, 392, 296, 820, 96, 54),               // 撇  falling left
    taper(420, 392, 728, 820, 60, 112),              // 捺  falling right
  ],
}

// A3 — learning mark. Two primitives and one move: a page with a turned
// corner, one 一 stroke cut out of it, and a 7° tilt. The tilt is what stops
// it being a file icon; the 一 is negative space, so the seal's own vermilion
// is what writes on the page.
const CARD =
  'M 348,240 H 604 L 724,360 V 736 A 48,48 0 0 1 676,784' +
  ' H 348 A 48,48 0 0 1 300,736 V 288 A 48,48 0 0 1 348,240 Z'
const CARD_FOLD = 'M 604,240 L 724,360 H 604 Z'          // the turned corner
const YI = taper(348, 502, 672, 480, 78, 106)            // 一, cut out
const MARK_A3 = { rule: 'evenodd', rot: -7, parts: [CARD, YI] }

// A2f — the same 文 with the 点 deliberately fused into the 横. Trades a little
// character fidelity for a mark that cannot read as a head on a body at 40px.
const MARK_A2F = {
  rule: 'nonzero', rot: 0,
  parts: [
    taper(462, 226, 522, 330, 74, 96),               // 点, run into the bar
    'M 250,350 L 774,336 L 774,428 L 250,442 Z',     // 横
    taper(604, 392, 296, 820, 96, 54),               // 撇
    taper(420, 392, 728, 820, 60, 112),              // 捺
  ],
}

const MARKS = { A1: MARK_A1, A2: MARK_A2, A3: MARK_A3, A2f: MARK_A2F }
const NAMES = { A1: 'A1 · geometric ring', A2: 'A2 · 文 writing mark', A3: 'A3 · learning mark' }

// Render a mark. An evenodd mark is one path (its subpaths cut holes); a
// nonzero mark is separate paths (they union instead of cancelling).
function markSVG(key, fill, { dx = 0, dy = 0, opacity = 1 } = {}) {
  const m = MARKS[key]
  const rot = m.rot ? ` rotate(${m.rot} 512 512)` : ''
  const tr = (dx || dy || rot) ? ` transform="translate(${dx},${dy})${rot}"` : ''
  const op = opacity === 1 ? '' : ` opacity="${opacity}"`
  const body = m.rule === 'evenodd'
    ? `<path d="${m.parts.join(' ')}" fill="${fill}" fill-rule="evenodd"/>`
    : m.parts.map((d) => `<path d="${d}" fill="${fill}"/>`).join('')
  return `<g${tr}${op}>${body}</g>`
}

// ── Layer 3: seal material ─────────────────────────────────────────────────
// A deterministic stipple. Vermilion seal paste never prints perfectly flat;
// this is that, at a level you feel rather than see. Seeded so the master is
// reproducible byte-for-byte.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function materialLayer() {
  const rnd = mulberry32(20260815)
  const light = [], dark = []
  for (let i = 0; i < 1400; i++) {
    const x = (rnd() * S).toFixed(1), y = (rnd() * S).toFixed(1)
    const r = (1.4 + rnd() * 4.6).toFixed(2)
    ;(rnd() > 0.46 ? dark : light).push(`<circle cx="${x}" cy="${y}" r="${r}"/>`)
  }
  return `<g fill="#000000" opacity="0.055">${dark.join('')}</g>` +
         `<g fill="#FFFFFF" opacity="0.045">${light.join('')}</g>`
}
const MATERIAL = materialLayer()

// ── Layer 4: depth ─────────────────────────────────────────────────────────
// A 白文 seal is intaglio: the character is cut INTO the stone and prints as
// bare paper inside the ink. So the mark is a recess, and with the light at
// top-left the near wall of that recess catches a hair of shade. One offset
// copy, no blur. At 40px this is 0.3px — it vanishes rather than muddying,
// which is the correct behaviour under the size gate.
const depthLayer = (key) => markSVG(key, '#000000', { dx: -6, dy: -9, opacity: 0.34 })

// The one coherent light source: top-left. Restrained — 10% up, 14% down, no
// giant baked drop shadow anywhere.
const LIGHTING =
  `<linearGradient id="lit" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/>` +
  `<stop offset="0.48" stop-color="#FFFFFF" stop-opacity="0.015"/>` +
  `<stop offset="1" stop-color="#000000" stop-opacity="0.14"/></linearGradient>`

// ── Composites ─────────────────────────────────────────────────────────────

// The full-bleed icon: body + mark + material + edge, in one appearance.
function iconSVG(key, pal, { material = true, depth = true, lighting = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${pal.hi}"/>
    <stop offset="0.52" stop-color="${pal.base}"/>
    <stop offset="1" stop-color="${pal.lo}"/>
  </linearGradient>
  ${LIGHTING}
</defs>
<rect width="${S}" height="${S}" fill="url(#body)"/>
${material ? MATERIAL : ''}
${depth ? depthLayer(key) : ''}
${markSVG(key, pal.mark)}
${lighting ? `<rect width="${S}" height="${S}" fill="url(#lit)"/>` : ''}
</svg>`
}

// The authored Android monochrome layer: the mark alone, flat, on transparent.
// The launcher keeps only the alpha and applies its own theme colours, so a
// flat silhouette is the only thing that survives — never texture, never a
// gradient, never the seal body (that would theme as a solid blob).
function monoSVG(key) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${markSVG(key, '#FFFFFF')}</svg>`
}

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()

// Apply a mask (an SVG path over a transparent canvas) to an icon buffer.
async function masked(buf, size, pathD) {
  const m = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<path d="${pathD}" fill="#fff"/></svg>`)
  return sharp(buf)
    .composite([{ input: await sharp(m).png().toBuffer(), blend: 'dest-in' }])
    .png().toBuffer()
}

const iosMask = (s) => superellipse(s / 2, s / 2, s / 2, 5)
const iosIcon = async (key, pal, size, opts) =>
  masked(await png(iconSVG(key, pal, opts), size), size, iosMask(size))

// ── Sheet plumbing ─────────────────────────────────────────────────────────
const FONT = 'DejaVu Sans, sans-serif'
function sheetSVG(w, h, bg, els) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="${bg}"/>${els.join('')}</svg>`
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const label = (x, y, t, size = 26, fill = '#8A8A93', anchor = 'middle', weight = 400) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}"` +
  ` fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`

async function writeSheet(name, w, h, bg, els, layers) {
  const base = await sharp(Buffer.from(sheetSVG(w, h, bg, els))).png().toBuffer()
  const out = await sharp(base).composite(layers).png().toBuffer()
  writeFileSync(OUT + 'previews/' + name, out)
  console.log('  previews/' + name + '  ' + w + 'x' + h)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('masters/')

// Layer masters. Flat, Icon-Composer-ready: no gradients, no effects.
const flat = (inner, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
  (fill ? `<path d="${inner}" fill="${fill}" fill-rule="evenodd"/>` : inner) + '</svg>'

writeFileSync(OUT + 'masters/layer1-body.svg',
  flat(`<rect width="${S}" height="${S}" fill="${P.light.base}"/>`, null))
writeFileSync(OUT + 'masters/layer3-material.svg', flat(MATERIAL, null))
for (const k of ['A1', 'A2', 'A3']) {
  writeFileSync(OUT + `masters/layer2-mark-${k}.svg`, flat(markSVG(k, P.light.mark), null))
  writeFileSync(OUT + `masters/mono-${k}.svg`, monoSVG(k))
  console.log(`  masters/layer2-mark-${k}.svg + mono-${k}.svg`)
}
writeFileSync(OUT + 'masters/layer2-mark-A3-fold.svg', flat(CARD_FOLD, '#E7D8C6'))

console.log('previews/')

// ── 1 · The three candidates at 1024 ───────────────────────────────────────
{
  const pad = 72, w = 3 * S + 4 * pad, h = S + 300
  const els = [label(w / 2, 76, 'Direction A · Vermilion Seal — three internal marks at 1024px', 40, '#1A1A1E', 'middle', 700)]
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  for (let i = 0; i < 3; i++) {
    const x = pad + i * (S + pad)
    comps.push({ input: await iosIcon(keys[i], P.light, S), left: x, top: 130 })
    els.push(label(x + S / 2, 130 + S + 66, NAMES[keys[i]], 34, '#3A3A42', 'middle', 600))
  }
  await writeSheet('01-candidates-1024.png', w, h, '#F2F1EE', els, comps)
}

// ── 2 · The size gate ──────────────────────────────────────────────────────
{
  const sizes = [180, 120, 60, 40]
  const colX = [140, 420, 640, 800, 980]   // true-size columns, then the 6x blow-up
  const rowH = 260, w = 1560, h = 150 + 3 * rowH + 40
  const els = [
    label(w / 2, 62, 'Size gate — rendered at true pixel size', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'the 40px column is the one that decides', 24, '#8A8A93'),
  ]
  sizes.forEach((s, i) => els.push(label(colX[i] + 90, 138, s + 'px', 22, '#8A8A93')))
  els.push(label(colX[4] + 120, 138, '40px @6×', 22, '#8A8A93'))
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  for (let r = 0; r < 3; r++) {
    const cy = 150 + r * rowH + rowH / 2
    els.push(label(24, cy + 8, keys[r], 30, '#3A3A42', 'start', 700))
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      comps.push({ input: await iosIcon(keys[r], P.light, s), left: colX[i] + 90 - s / 2 | 0, top: cy - s / 2 | 0 })
    }
    const big = await sharp(await iosIcon(keys[r], P.light, 40))
      .resize(240, 240, { kernel: 'nearest' }).png().toBuffer()
    comps.push({ input: big, left: colX[4], top: cy - 120 })
  }
  await writeSheet('02-size-gate.png', w, h, '#F2F1EE', els, comps)
}

// ── 2b · 40px, side by side, the only comparison that matters ──────────────
{
  const w = 1180, h = 460
  const els = [
    label(w / 2, 58, 'All three at 40px', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 96, 'true size on the left · 8× nearest-neighbour on the right', 22, '#8A8A93'),
  ]
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  for (let i = 0; i < 3; i++) {
    const x = 90 + i * 350
    comps.push({ input: await iosIcon(keys[i], P.light, 40), left: x + 34, top: 150 })
    const big = await sharp(await iosIcon(keys[i], P.light, 40))
      .resize(200, 200, { kernel: 'nearest' }).png().toBuffer()
    comps.push({ input: big, left: x + 100, top: 210 })
    els.push(label(x + 60, 140, keys[i], 24, '#3A3A42', 'middle', 700))
  }
  await writeSheet('02b-40px.png', w, h, '#F2F1EE', els, comps)
}

// ── 3 · iOS appearances ────────────────────────────────────────────────────
{
  const IS = 260, pad = 60, w = 4 * IS + 5 * pad + 120, h = 3 * (IS + 100) + 170
  const cols = [
    { t: 'Light (Any)', bg: '#EDEBE6', pal: P.light, opts: {} },
    { t: 'Dark', bg: '#101014', pal: P.dark, opts: {} },
    { t: 'Tinted (mono)', bg: '#101014', pal: TINT, opts: { material: false } },
    { t: 'Clear (mono, iOS 26)', bg: null, pal: null, opts: {} },
  ]
  const els = [
    label(w / 2, 60, 'iOS appearances — every variant authored, none left to the system', 36, '#F2F1EE', 'middle', 700),
    label(w / 2, 98, 'Clear is a simulation: Icon Composer needs macOS and cannot run here', 22, '#7E7E88'),
  ]
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  cols.forEach((c, i) => els.push(label(120 + pad + i * (IS + pad) + IS / 2, 150, c.t, 26, '#C8C8D0', 'middle', 600)))
  // a stand-in wallpaper for the Clear column
  const wall = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}">
     <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
     <stop offset="0" stop-color="#2E4A6B"/><stop offset="0.5" stop-color="#6B4A72"/>
     <stop offset="1" stop-color="#8A5A3C"/></linearGradient></defs>
     <rect width="${IS}" height="${IS}" fill="url(#g)"/></svg>`)).png().toBuffer()

  for (let r = 0; r < 3; r++) {
    const y = 190 + r * (IS + 100)
    els.push(label(56, y + IS / 2, keys[r], 30, '#C8C8D0', 'start', 700))
    for (let i = 0; i < cols.length; i++) {
      const x = 120 + pad + i * (IS + pad)
      const c = cols[i]
      if (c.pal) {
        els.push(`<rect x="${x - 18}" y="${y - 18}" width="${IS + 36}" height="${IS + 36}" rx="26" fill="${c.bg}"/>`)
        comps.push({ input: await iosIcon(keys[r], c.pal, IS, c.opts), left: x, top: y })
      } else {
        // Clear: the greyscale asset as frosted glass over the wallpaper.
        const glass = await sharp(Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}" viewBox="0 0 ${S} ${S}">
           <rect width="${S}" height="${S}" fill="#FFFFFF" opacity="0.16"/>
           ${markSVG(keys[r], '#FFFFFF', { opacity: 0.62 })}</svg>`)).png().toBuffer()
        const plate = await sharp(wall).composite([{ input: glass }]).png().toBuffer()
        comps.push({ input: await masked(plate, IS, iosMask(IS)), left: x, top: y })
      }
    }
  }
  await writeSheet('03-ios-appearances.png', w, h, '#08080B', els, comps)
}

// ── 4 · Android adaptive masks ─────────────────────────────────────────────
// Background full-bleed 108dp with NO inset, foreground mark at safe-zone size
// — i.e. the audit's §4 corrections, applied.
{
  const IS = 240, pad = 56, w = 4 * IS + 5 * pad + 120, h = 3 * (IS + 96) + 170
  const masks = {
    'circle': (s) => circlePath(s / 2, s / 2, s / 2),
    'squircle': (s) => superellipse(s / 2, s / 2, s / 2, 4),
    'rounded square': (s) => rrect(0, 0, s, s, [s * 0.22, s * 0.22, s * 0.22, s * 0.22]),
    'teardrop': (s) => rrect(0, 0, s, s, [s * 0.13, s / 2, s / 2, s / 2]),
  }
  const els = [
    label(w / 2, 60, 'Android adaptive — four launcher masks', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 98, 'background full-bleed 108dp, no inset · mark sized to the 66dp safe zone', 22, '#8A8A93'),
  ]
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  Object.keys(masks).forEach((t, i) => els.push(label(120 + pad + i * (IS + pad) + IS / 2, 148, t, 24, '#5A5A63', 'middle', 600)))
  for (let r = 0; r < 3; r++) {
    const y = 186 + r * (IS + 96)
    els.push(label(56, y + IS / 2, keys[r], 30, '#3A3A42', 'start', 700))
    const full = await png(iconSVG(keys[r], P.light), IS)
    let i = 0
    for (const t of Object.keys(masks)) {
      comps.push({ input: await masked(full, IS, masks[t](IS)), left: 120 + pad + i * (IS + pad), top: y })
      i++
    }
  }
  await writeSheet('04-android-masks.png', w, h, '#F2F1EE', els, comps)
}

// ── 5 · Android themed icons ───────────────────────────────────────────────
// From our own <monochrome> layer — never the system's auto-theming.
{
  const IS = 240, pad = 108, gut = 140, w = 3 * IS + 4 * pad + gut, h = 3 * (IS + 96) + 170
  const themes = [
    { t: 'authored monochrome', bg: '#26262B', fg: '#F2F1EE', plate: null },
    { t: 'themed · light', bg: '#F2F1EE', fg: '#7A2B1B', plate: '#E9C9BD' },
    { t: 'themed · dark', bg: '#101014', fg: '#2A1712', plate: '#C88C78' },
  ]
  const els = [
    label(w / 2, 60, 'Android themed icons — from our own monochrome layer', 36, '#F2F1EE', 'middle', 700),
    label(w / 2, 98, 'the launcher keeps only the alpha and applies its own two colours', 22, '#7E7E88'),
  ]
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  themes.forEach((c, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 148, c.t, 24, '#C8C8D0', 'middle', 600)))
  for (let r = 0; r < 3; r++) {
    const y = 186 + r * (IS + 96)
    els.push(label(56, y + IS / 2, keys[r], 30, '#C8C8D0', 'start', 700))
    for (let i = 0; i < themes.length; i++) {
      const c = themes[i], x = gut + pad + i * (IS + pad)
      if (!c.plate) {
        els.push(`<rect x="${x}" y="${y}" width="${IS}" height="${IS}" rx="18" fill="${c.bg}"/>`)
        comps.push({
          input: await png(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
            ${markSVG(keys[r], c.fg)}</svg>`, IS),
          left: x, top: y,
        })
      } else {
        const themed = await sharp(Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}" viewBox="0 0 ${S} ${S}">
           <rect width="${S}" height="${S}" fill="${c.plate}"/>
           ${markSVG(keys[r], c.fg)}</svg>`)).png().toBuffer()
        els.push(`<rect x="${x - 14}" y="${y - 14}" width="${IS + 28}" height="${IS + 28}" rx="22" fill="${c.bg}"/>`)
        comps.push({ input: await masked(themed, IS, circlePath(IS / 2, IS / 2, IS / 2)), left: x, top: y })
      }
    }
  }
  await writeSheet('05-android-themed.png', w, h, '#08080B', els, comps)
}

// ── 6 · Layer breakdown ────────────────────────────────────────────────────
{
  const IS = 300, pad = 52, cols = 5
  const w = cols * IS + (cols + 1) * pad, h = 3 * (IS + 108) + 180
  const stack = [
    { t: '1 · seal body', opts: { material: false, depth: false, lighting: false }, bodyOnly: true },
    { t: '2 · principal mark', opts: { material: false, depth: false, lighting: false } },
    { t: '3 · seal material', opts: { depth: false, lighting: false } },
    { t: '4 · depth (optional)', opts: { lighting: false } },
    { t: 'lighting (system)', opts: {} },
  ]
  const els = [
    label(w / 2, 60, 'Layer breakdown — flat masters, lighting applied last', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 98, 'layers 1–4 ship as SVG with no baked effects; Icon Composer supplies the material', 22, '#8A8A93'),
  ]
  const comps = []
  const keys = ['A1', 'A2', 'A3']
  stack.forEach((c, i) => els.push(label(pad + i * (IS + pad) + IS / 2, 150, c.t, 23, '#5A5A63', 'middle', 600)))
  for (let r = 0; r < 3; r++) {
    const y = 186 + r * (IS + 108)
    for (let i = 0; i < stack.length; i++) {
      const x = pad + i * (IS + pad)
      const svg = stack[i].bodyOnly
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${P.light.base}"/></svg>`
        : iconSVG(keys[r], P.light, stack[i].opts)
      comps.push({ input: await masked(await png(svg, IS), IS, iosMask(IS)), left: x, top: y })
    }
    els.push(label(pad + IS / 2, y + IS + 44, keys[r], 26, '#3A3A42', 'middle', 700))
  }
  await writeSheet('06-layers.png', w, h, '#F2F1EE', els, comps)
}

// ── 7 · A2 mitigation — does fusing the 点 kill the stick-figure read? ──────
{
  const sizes = [180, 60, 40]
  const w = 1460, h = 520
  const els = [
    label(w / 2, 58, 'A2 mitigation — the 点 fused into the 横', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 96, 'left: 文 as drawn · right: dot run into the bar, so there is no detached head at 40px', 22, '#8A8A93'),
  ]
  const comps = []
  const variants = [['A2', 'as drawn'], ['A2f', 'fused 点']]
  for (let v = 0; v < 2; v++) {
    const ox = 100 + v * 700
    els.push(label(ox + 200, 148, variants[v][1], 26, '#3A3A42', 'middle', 600))
    let x = ox
    for (const sz of sizes) {
      comps.push({ input: await iosIcon(variants[v][0], P.light, sz), left: x, top: 200 + (180 - sz) / 2 | 0 })
      els.push(label(x + sz / 2, 420, sz + 'px', 20, '#8A8A93'))
      x += sz + 40
    }
    const big = await sharp(await iosIcon(variants[v][0], P.light, 40))
      .resize(180, 180, { kernel: 'nearest' }).png().toBuffer()
    comps.push({ input: big, left: x + 20, top: 200 })
    els.push(label(x + 110, 420, '40px @4.5×', 20, '#8A8A93'))
  }
  await writeSheet('07-a2-mitigation.png', w, h, '#F2F1EE', els, comps)
}

// ── True-size singles, for embedding at 1:1 in a review page ───────────────
for (const k of ['A1', 'A2', 'A3']) {
  for (const sz of [40, 60, 120]) {
    writeFileSync(OUT + `previews/true${sz}-${k}.png`, await iosIcon(k, P.light, sz))
  }
}
console.log('  previews/true{40,60,120}-{A1,A2,A3}.png')

console.log('done — nothing outside docs/icon-v2/ was written')
