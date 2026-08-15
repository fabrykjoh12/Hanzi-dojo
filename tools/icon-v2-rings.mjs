// P14 — App Icon V2, ring family (R1–R4). CONCEPTS ONLY.
//
// Writes nothing outside docs/icon-v2/rings/. Does not touch ios/, android/,
// public/, assets/ or src/, and does not modify tools/generate-app-icons.mjs.
//
// Brief: the ring stays. Turn it into a proprietary Hanzi Dojo mark that no
// longer reads as a stock ensō. Same vermilion field on every variant so the
// comparison judges the MARK — with one declared exception, R4, whose whole
// proposition is the material (see LACQUER below).
//
// The hard rule this is built against: at 40px the first read must be
// "Hanzi Dojo ring" — not a target, a record button, a character, a document.
//
// Run: node tools/icon-v2-rings.mjs

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const S = 1024
const C = 512                       // canvas centre
const OUT = 'docs/icon-v2/rings/'
mkdirSync(OUT + 'masters', { recursive: true })
mkdirSync(OUT + 'previews', { recursive: true })

// ── Palette — unchanged from the approved seal body ────────────────────────
const P = {
  light: { hi: '#C64A2E', base: '#B83A24', lo: '#96301C', mark: '#F8F1E9', mark2: '#F1E7D9' },
  dark:  { hi: '#94301E', base: '#872817', lo: '#68200F', mark: '#EFE3D6', mark2: '#E4D5C4' },
}
const TINT = { hi: '#2B333F', base: '#222932', lo: '#161A20', mark: '#A9C6EC', mark2: '#9AB6DC' }

// ── Geometry ───────────────────────────────────────────────────────────────
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
const oP = (a, r) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))]
const iP = (a, r, dx, dy) => [C + dx + r * Math.cos(rad(a)), C + dy + r * Math.sin(rad(a))]
const fmt = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const arc = (fn, from, to, steps) => {
  const out = []
  for (let i = 0; i <= steps; i++) out.push(fn(from + ((to - from) * i) / steps))
  return out
}
const poly = (pts) => 'M ' + fmt(pts[0]) + pts.slice(1).map((p) => ' L ' + fmt(p)).join('')

// THE OPENING. Not an angular wedge — a slot: the ring is cut by two genuinely
// parallel lines, `h` pixels apart, straddling the direction `theta`. Because a
// parallel chord is not a radius, both terminals come out slanted by the same
// small amount, in the same direction. That is what makes the opening read as
// deliberately cut rather than as a brush lifting off the paper, and it is why
// an angular gap (which splays into a pie-chart wedge) was wrong.
//
// Outer circle, centre C radius ro:  ro·sin(t − theta) = ±h/2
// Inner circle, centre C+(dx,dy) radius ri, with k = (dx,dy)·n̂:
//                                    ri·sin(s − theta) = ±h/2 − k
function slotAngles({ ro, ri, dx, dy, theta, h }) {
  const n = [-Math.sin(rad(theta)), Math.cos(rad(theta))]
  const k = dx * n[0] + dy * n[1]
  return {
    tA: theta + deg(Math.asin(h / (2 * ro))),          // outer, +h/2 side
    tB: theta - deg(Math.asin(h / (2 * ro))),          // outer, −h/2 side
    sA: theta + deg(Math.asin((h / 2 - k) / ri)),      // inner, +h/2 side
    sB: theta + deg(Math.asin((-h / 2 - k) / ri)),     // inner, −h/2 side
  }
}

// The ring, opened by one slot. `bevel` facets the outer corner of the closing
// terminal the way a page corner turns — one extra edge, nothing literal.
function slotRing({ ro = 300, ri = 192, dx = -18, dy = -24, theta = 40, h = 92, bevel = 0, bevelAt = 0.5, steps = 300 }) {
  const g = slotAngles({ ro, ri, dx, dy, theta, h })
  const startA = g.tA + bevel
  const outer = arc((a) => oP(a, ro), startA, g.tB + 360, steps)
  const inner = arc((a) => iP(a, ri, dx, dy), g.sB + 360, g.sA, steps)
  let pts = [...outer, ...inner]
  if (bevel > 0) pts.push(lerp(inner[inner.length - 1], oP(g.tA, ro), bevelAt))
  return poly(pts) + ' Z'
}

// A plain ring segment with radial cuts at both ends. Used for R3's lap joints,
// where the cut is hidden under the strip in front of it.
function ringSeg({ ro = 300, ri = 192, dx = -18, dy = -24, from, to, steps = 300 }) {
  const outer = arc((a) => oP(a, ro), from, to, steps)
  const inner = arc((a) => iP(a, ri, dx, dy), to, from, steps)
  return poly([...outer, ...inner]) + ' Z'
}

// ── The four variants ──────────────────────────────────────────────────────
const BASE = { ro: 300, ri: 192, dx: -14, dy: -19 }

// WHERE THE OPENING GOES. At the top-right, ~1 o'clock — the same place the
// existing logo breaks. That position is the brand equity and it is free to
// keep; what made the old mark read as a stock ensō was the brush texture, the
// tapered dry-brush terminals and the flecks, not where it opened. Moving the
// break to 4 o'clock was tried first and cost more than it bought: it reads as
// a gauge or a progress ring, and it throws away the one thing a returning user
// recognises.
const THETA = -58

// R1 · Proprietary Ring. Clean but not mathematically perfect: the hole sits
// 24px up-left of the outer circle, so the stroke runs 84 → 132 and thickens
// away from the light. One opening — a 92px parallel slot, flat-cut, both
// terminals slanted the same way. No flecks, no brush caps, no taper.
const R1 = {
  name: 'R1 · proprietary ring',
  layers: [{ tone: 'mark', d: slotRing({ ...BASE, theta: THETA, h: 92 }) }],
}

// R2 · Ring + Page Cut. The same ring and the same slot, with the closing
// terminal's outer corner faceted at ~45°. The negative space between the two
// ends stops being a plain slot and takes the profile of a turned page corner.
// Discoverable, not literal — it reads as a considered cut first.
const R2 = {
  name: 'R2 · ring + page cut',
  layers: [{ tone: 'mark', d: slotRing({ ...BASE, theta: THETA, h: 104, bevel: 17, bevelAt: 0.42 }) }],
}

// R3 · Layered Paper Ring. Two overlapping strips instead of one stroke, lapped
// at 130–152°, the front one lifted 6px up-left and casting a real shade onto
// the strip beneath it. The depth is layer separation — what Icon Composer
// builds material from — not a painted gradient. The strips stay concentric so
// the silhouette is still R1's, and in monochrome they merge back to one ring.
const R3 = {
  name: 'R3 · layered paper ring',
  laps: true,
  layers: [
    { tone: 'mark2', d: ringSeg({ ...BASE, from: -49, to: 152 }) },
    { tone: 'mark', dx: -6, dy: -8, d: ringSeg({ ...BASE, from: 130, to: 294 }) },
  ],
}

// R4 · Lacquer Seal Ring. Strongest continuity — the silhouette is barely
// touched: fractionally heavier, gentler modulation, a narrow 56px slot. Nothing
// geometric is doing the work. The material is: a wide low specular sweep and a
// lit top rim, the finish of poured lacquer rather than flat paste.
const R4 = {
  name: 'R4 · lacquer seal ring',
  lacquer: true,
  layers: [{ tone: 'mark', d: slotRing({ ro: 302, ri: 198, dx: -13, dy: -17, theta: THETA, h: 56 }) }],
}

const V = { R1, R2, R3, R4 }
const KEYS = ['R1', 'R2', 'R3', 'R4']

// Every variant's silhouette — what the Android monochrome layer and the 40px
// read actually get. Layer offsets fold in; tones do not.
function markSVG(key, pal, { opacity = 1, flat = false, tx = 0, ty = 0 } = {}) {
  const v = V[key]
  // The lap shade: the front strip offset down-right in a dark tone, clipped to
  // the strip beneath it so it only shows where one layer actually laps another.
  const lap = (!flat && v.laps)
    ? `<clipPath id="lap-${key}"><path d="${v.layers[0].d}"/></clipPath>` +
      `<g clip-path="url(#lap-${key})"><path d="${v.layers[1].d}" fill="#000000" opacity="0.28"` +
      ` transform="translate(${(v.layers[1].dx || 0) + tx + 7},${(v.layers[1].dy || 0) + ty + 8})"/></g>`
    : ''
  const body = lap + v.layers.map((L) => {
    const dx = (L.dx || 0) + tx, dy = (L.dy || 0) + ty
    const t = (dx || dy) ? ` transform="translate(${dx},${dy})"` : ''
    const f = flat ? pal : (L.tone === 'mark2' ? pal.mark2 : pal.mark)
    return `<path d="${L.d}" fill="${f}"${t}/>`
  }).join('')
  return `<g${opacity === 1 ? '' : ` opacity="${opacity}"`}>${body}</g>`
}
const monoSVG = (key, fill) => markSVG(key, fill, { flat: true })

// ── Shared seal material ───────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const MATERIAL = (() => {
  const rnd = mulberry32(20260815)
  const light = [], dark = []
  for (let i = 0; i < 1400; i++) {
    const x = (rnd() * S).toFixed(1), y = (rnd() * S).toFixed(1)
    const r = (1.4 + rnd() * 4.6).toFixed(2)
    ;(rnd() > 0.46 ? dark : light).push(`<circle cx="${x}" cy="${y}" r="${r}"/>`)
  }
  return `<g fill="#000000" opacity="0.055">${dark.join('')}</g>` +
         `<g fill="#FFFFFF" opacity="0.045">${light.join('')}</g>`
})()

// R4 only. A wide, low specular sweep plus a lit top rim: poured lacquer, not
// gloss. Deliberately the one field difference in the set, because it is R4's
// entire proposition — the mark geometry stays near-identical to R1 so the
// comparison is still a fair one.
const LACQUER_DEFS =
  `<linearGradient id="sheen" x1="0" y1="0" x2="0.72" y2="1">` +
  `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/>` +
  `<stop offset="0.30" stop-color="#FFFFFF" stop-opacity="0.05"/>` +
  `<stop offset="0.52" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.20"/>` +
  `<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>`
const LACQUER =
  `<rect width="${S}" height="${S}" fill="url(#sheen)"/>` +
  `<rect width="${S}" height="26" fill="url(#rim)"/>`

const LIGHTING =
  `<linearGradient id="lit" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/>` +
  `<stop offset="0.48" stop-color="#FFFFFF" stop-opacity="0.015"/>` +
  `<stop offset="1" stop-color="#000000" stop-opacity="0.14"/></linearGradient>`

// Intaglio: the mark is cut into the seal, so with the light at top-left the
// near wall of the recess catches shade. 0.3px at 40px — it vanishes rather
// than muddying.
const depth = (key) => markSVG(key, '#000000', { opacity: 0.34, flat: true, tx: -6, ty: -9 })

function iconSVG(key, pal, { material = true, useDepth = true, lighting = true } = {}) {
  const v = V[key]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${pal.hi}"/><stop offset="0.52" stop-color="${pal.base}"/>
  <stop offset="1" stop-color="${pal.lo}"/></linearGradient>${LIGHTING}${v.lacquer ? LACQUER_DEFS : ''}</defs>
<rect width="${S}" height="${S}" fill="url(#body)"/>
${material ? MATERIAL : ''}
${v.lacquer ? LACQUER : ''}
${useDepth ? depth(key) : ''}
${markSVG(key, pal)}
${lighting ? `<rect width="${S}" height="${S}" fill="url(#lit)"/>` : ''}
</svg>`
}

// ── Raster plumbing ────────────────────────────────────────────────────────
const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()

function superellipse(cx, cy, half, n, steps = 512) {
  const pts = []
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps
    const ct = Math.cos(t), st = Math.sin(t)
    pts.push((cx + half * Math.sign(ct) * Math.abs(ct) ** (2 / n)).toFixed(2) + ',' +
             (cy + half * Math.sign(st) * Math.abs(st) ** (2 / n)).toFixed(2))
  }
  return 'M ' + pts.join(' L ') + ' Z'
}
const circlePath = (cx, cy, r) =>
  `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0 Z`
const rrect = (x, y, w, h, [tl, tr, br, bl]) =>
  `M ${x + tl},${y} H ${x + w - tr} A ${tr},${tr} 0 0 1 ${x + w},${y + tr}` +
  ` V ${y + h - br} A ${br},${br} 0 0 1 ${x + w - br},${y + h}` +
  ` H ${x + bl} A ${bl},${bl} 0 0 1 ${x},${y + h - bl}` +
  ` V ${y + tl} A ${tl},${tl} 0 0 1 ${x + tl},${y} Z`

async function masked(buf, size, d) {
  const m = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="${d}" fill="#fff"/></svg>`
  )).png().toBuffer()
  return sharp(buf).composite([{ input: m, blend: 'dest-in' }]).png().toBuffer()
}
const iosMask = (s) => superellipse(s / 2, s / 2, s / 2, 5)
const iosIcon = async (key, pal, size, o) => masked(await png(iconSVG(key, pal, o), size), size, iosMask(size))

const FONT = 'DejaVu Sans, sans-serif'
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const label = (x, y, t, size = 26, fill = '#8A8A93', anchor = 'middle', weight = 400) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}"` +
  ` fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`
async function writeSheet(name, w, h, bg, els, layers) {
  const base = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${els.join('')}</svg>`
  )).png().toBuffer()
  writeFileSync(OUT + 'previews/' + name, await sharp(base).composite(layers).png().toBuffer())
  console.log('  previews/' + name + '  ' + w + 'x' + h)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('masters/')
for (const k of KEYS) {
  const v = V[k]
  writeFileSync(OUT + `masters/mark-${k}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${markSVG(k, P.light)}</svg>`)
  writeFileSync(OUT + `masters/mono-${k}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${monoSVG(k, '#FFFFFF')}</svg>`)
  console.log(`  masters/mark-${k}.svg + mono-${k}.svg  (${v.layers.length} layer${v.layers.length > 1 ? 's' : ''})`)
}
writeFileSync(OUT + 'masters/body.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${P.light.base}"/></svg>`)
writeFileSync(OUT + 'masters/material.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${MATERIAL}</svg>`)

console.log('previews/')

// ── 1 · Four variants at 1024 ──────────────────────────────────────────────
{
  const IS = 700, pad = 56, w = 4 * IS + 5 * pad, h = IS + 300
  const els = [label(w / 2, 78, 'The ring, four ways — same vermilion field, judge the mark', 42, '#1A1A1E', 'middle', 700)]
  const comps = []
  for (let i = 0; i < 4; i++) {
    const x = pad + i * (IS + pad)
    comps.push({ input: await iosIcon(KEYS[i], P.light, IS), left: x, top: 132 })
    els.push(label(x + IS / 2, 132 + IS + 62, V[KEYS[i]].name, 30, '#3A3A42', 'middle', 600))
  }
  await writeSheet('R-01-candidates.png', w, h, '#F2F1EE', els, comps)
}

// ── 2 · The size ladder, at true pixel size ────────────────────────────────
{
  const sizes = [180, 60, 40]
  const colX = [150, 420, 560, 720]
  const rowH = 250, w = 1120, h = 150 + 4 * rowH + 40
  const els = [
    label(w / 2, 62, 'Size ladder — true pixel size', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'the 40px column decides: the first read must be "Hanzi Dojo ring"', 23, '#8A8A93'),
  ]
  sizes.forEach((s, i) => els.push(label(colX[i] + 90, 138, s + 'px', 22, '#8A8A93')))
  els.push(label(colX[3] + 120, 138, '40px @6×', 22, '#8A8A93'))
  const comps = []
  for (let r = 0; r < 4; r++) {
    const cy = 150 + r * rowH + rowH / 2
    els.push(label(24, cy + 8, KEYS[r], 30, '#3A3A42', 'start', 700))
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      comps.push({ input: await iosIcon(KEYS[r], P.light, s), left: (colX[i] + 90 - s / 2) | 0, top: (cy - s / 2) | 0 })
    }
    comps.push({
      input: await sharp(await iosIcon(KEYS[r], P.light, 40)).resize(240, 240, { kernel: 'nearest' }).png().toBuffer(),
      left: colX[3], top: cy - 120,
    })
  }
  await writeSheet('R-02-sizes.png', w, h, '#F2F1EE', els, comps)
}

// ── 3 · iOS appearances ────────────────────────────────────────────────────
{
  const IS = 240, pad = 54, gut = 110, w = 4 * IS + 5 * pad + gut, h = 4 * (IS + 92) + 170
  const cols = [
    { t: 'Light (Any)', bg: '#EDEBE6', pal: P.light, o: {} },
    { t: 'Dark', bg: '#101014', pal: P.dark, o: {} },
    { t: 'Tinted (mono)', bg: '#101014', pal: TINT, o: { material: false } },
    { t: 'Clear (sim.)', bg: null, pal: null, o: {} },
  ]
  const els = [
    label(w / 2, 60, 'iOS appearances — all four authored', 36, '#F2F1EE', 'middle', 700),
    label(w / 2, 98, 'Clear is simulated; Icon Composer needs macOS and cannot run here', 22, '#7E7E88'),
  ]
  const comps = []
  cols.forEach((c, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 150, c.t, 25, '#C8C8D0', 'middle', 600)))
  const wall = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}"><defs>
     <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E4A6B"/>
     <stop offset="0.5" stop-color="#6B4A72"/><stop offset="1" stop-color="#8A5A3C"/></linearGradient></defs>
     <rect width="${IS}" height="${IS}" fill="url(#g)"/></svg>`)).png().toBuffer()
  for (let r = 0; r < 4; r++) {
    const y = 190 + r * (IS + 92)
    els.push(label(50, y + IS / 2, KEYS[r], 29, '#C8C8D0', 'start', 700))
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i], x = gut + pad + i * (IS + pad)
      if (c.pal) {
        els.push(`<rect x="${x - 16}" y="${y - 16}" width="${IS + 32}" height="${IS + 32}" rx="24" fill="${c.bg}"/>`)
        comps.push({ input: await iosIcon(KEYS[r], c.pal, IS, c.o), left: x, top: y })
      } else {
        const glass = await sharp(Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}" viewBox="0 0 ${S} ${S}">
           <rect width="${S}" height="${S}" fill="#FFFFFF" opacity="0.16"/>
           ${markSVG(KEYS[r], '#FFFFFF', { flat: true, opacity: 0.62 })}</svg>`)).png().toBuffer()
        comps.push({
          input: await masked(await sharp(wall).composite([{ input: glass }]).png().toBuffer(), IS, iosMask(IS)),
          left: x, top: y,
        })
      }
    }
  }
  await writeSheet('R-03-ios.png', w, h, '#08080B', els, comps)
}

// ── 4 · Android adaptive + monochrome + themed ─────────────────────────────
{
  const IS = 200, pad = 40, gut = 100, cols = 6
  const w = cols * IS + (cols + 1) * pad + gut, h = 4 * (IS + 88) + 170
  const masks = [
    ['circle', (s) => circlePath(s / 2, s / 2, s / 2)],
    ['squircle', (s) => superellipse(s / 2, s / 2, s / 2, 4)],
    ['rounded sq.', (s) => rrect(0, 0, s, s, [s * 0.22, s * 0.22, s * 0.22, s * 0.22])],
    ['teardrop', (s) => rrect(0, 0, s, s, [s * 0.13, s / 2, s / 2, s / 2])],
  ]
  const heads = [...masks.map((m) => m[0]), 'monochrome', 'themed · dark']
  const els = [
    label(w / 2, 60, 'Android — adaptive masks, authored monochrome, themed', 36, '#F2F1EE', 'middle', 700),
    label(w / 2, 98, 'background full-bleed 108dp with no inset · mark at safe-zone size', 22, '#7E7E88'),
  ]
  const comps = []
  heads.forEach((t, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 148, t, 21, '#C8C8D0', 'middle', 600)))
  for (let r = 0; r < 4; r++) {
    const y = 186 + r * (IS + 88)
    els.push(label(46, y + IS / 2, KEYS[r], 28, '#C8C8D0', 'start', 700))
    const full = await png(iconSVG(KEYS[r], P.light), IS)
    for (let i = 0; i < masks.length; i++) {
      comps.push({ input: await masked(full, IS, masks[i][1](IS)), left: gut + pad + i * (IS + pad), top: y })
    }
    const xm = gut + pad + 4 * (IS + pad)
    els.push(`<rect x="${xm}" y="${y}" width="${IS}" height="${IS}" rx="16" fill="#26262B"/>`)
    comps.push({
      input: await png(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${monoSVG(KEYS[r], '#F2F1EE')}</svg>`, IS),
      left: xm, top: y,
    })
    const xt = gut + pad + 5 * (IS + pad)
    const themed = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}" viewBox="0 0 ${S} ${S}">
       <rect width="${S}" height="${S}" fill="#C88C78"/>${monoSVG(KEYS[r], '#2A1712')}</svg>`)).png().toBuffer()
    els.push(`<rect x="${xt - 12}" y="${y - 12}" width="${IS + 24}" height="${IS + 24}" rx="20" fill="#101014"/>`)
    comps.push({ input: await masked(themed, IS, circlePath(IS / 2, IS / 2, IS / 2)), left: xt, top: y })
  }
  await writeSheet('R-04-android.png', w, h, '#08080B', els, comps)
}

// ── 5 · The bare geometry, so the drawing itself is judgeable ──────────────
{
  const IS = 420, pad = 48, w = 4 * IS + 5 * pad, h = IS + 250
  const els = [
    label(w / 2, 62, 'The marks alone — silhouette, opening, weight modulation', 34, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'this is also exactly what the Android monochrome layer ships', 22, '#8A8A93'),
  ]
  const comps = []
  for (let i = 0; i < 4; i++) {
    const x = pad + i * (IS + pad)
    els.push(`<rect x="${x}" y="140" width="${IS}" height="${IS}" rx="14" fill="#E4E5E0"/>`)
    comps.push({
      input: await png(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${monoSVG(KEYS[i], '#B83A24')}</svg>`, IS),
      left: x, top: 140,
    })
    els.push(label(x + IS / 2, 140 + IS + 54, KEYS[i], 28, '#3A3A42', 'middle', 700))
  }
  await writeSheet('R-05-marks.png', w, h, '#F2F1EE', els, comps)
}

// True-size singles for embedding at 1:1
for (const k of KEYS) for (const sz of [40, 60, 120, 180]) {
  writeFileSync(OUT + `previews/true${sz}-${k}.png`, await iosIcon(k, P.light, sz))
}
console.log('  previews/true{40,60,120,180}-{R1..R4}.png')
console.log('done — nothing outside docs/icon-v2/rings/ was written')
