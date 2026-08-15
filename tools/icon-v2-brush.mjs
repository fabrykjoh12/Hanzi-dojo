// P14 — App Icon V2, brush-mark refinement + material gate. CONCEPTS ONLY.
//
// Writes nothing outside docs/icon-v2/brush/. Does not touch ios/, android/,
// public/, assets/ or src/, and does not modify tools/generate-app-icons.mjs.
//
// Brief: the geometric rings are rejected; the expressive brush ensō IS the
// logo. Start from the actual production mark, preserve ~85-90% of the
// gesture, and refine only what hurts: uncontrolled flecks, excessive
// scratchiness, detail that dies below 120px. Then judge four materials
// (E1-E4) with the exact same refined mark in each.
//
// The mark work is image processing on the real logo raster, not a redraw —
// that is the point. V1/V2 are cleaned rasters; V3 is a polar reconstruction
// that follows the original gesture's own measured thickness profile.
//
// Run: node tools/icon-v2-brush.mjs

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const SOURCE = 'src/assets/86055582-d1d3-4cb7-a460-6c907025fe15.png'
const S = 1024
const FIT = 680                       // the mark spans ~66% of the canvas
const OUT = 'docs/icon-v2/brush/'
mkdirSync(OUT + 'masters', { recursive: true })
mkdirSync(OUT + 'previews', { recursive: true })

// ── Palette ────────────────────────────────────────────────────────────────
// Anchor #B83A24 (languageTheme.js). Lacquer deepens the low end a step
// further than the seal ramp did — poured lacquer is darkest in its depths.
const LACQ = {
  light: { hi: '#C24730', base: '#B83A24', lo: '#8E2D1A', mark: '#F8F1E9' },
  dark:  { hi: '#8F2E1C', base: '#7C2413', lo: '#5C1B0C', mark: '#EFE3D6' },
}
const PAPER = {
  light: { hi: '#F8F2E7', base: '#F3EBDC', lo: '#E7DCC8', mark: '#B23621' },
  dark:  { hi: '#3A322A', base: '#322B23', lo: '#241F19', mark: '#C64A2E' },
}
const TINT = { hi: '#343B46', base: '#262D36', lo: '#171C22', mark: '#A9C6EC' }

// ═══ 1 · Extract the production mark ═══════════════════════════════════════
// Same keying as tools/generate-app-icons.mjs: the source bakes a stock
// checkerboard, the ink is the only colourful thing, so colourfulness IS
// alpha; un-multiply the anti-aliased edge against the grey beneath it.
async function keyedMask() {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: ch } = info
  const a = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2]
    const c = Math.max(r, g, b) - Math.min(r, g, b)
    let v = Math.min(1, c / 150)
    if (v < 0.04) v = 0
    a[i] = Math.round(v * 255)
  }
  return { a, W, H }
}

// ── Mask ops (Uint8Array alpha, one channel) ───────────────────────────────
function components(a, W, H, thr = 40) {
  const labels = new Int32Array(W * H).fill(-1)
  const sizes = []
  const stack = new Int32Array(W * H)
  let count = 0
  for (let s = 0; s < W * H; s++) {
    if (a[s] <= thr || labels[s] !== -1) continue
    let top = 0, size = 0
    stack[top++] = s; labels[s] = count
    while (top > 0) {
      const p = stack[--top]; size++
      const x = p % W, y = (p / W) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (a[q] > thr && labels[q] === -1) { labels[q] = count; stack[top++] = q }
      }
    }
    sizes.push(size); count++
  }
  return { labels, sizes, count }
}

// Zero every component the predicate rejects (size, or identity of largest).
function keepComponents(a, W, H, pred) {
  const { labels, sizes } = components(a, W, H)
  const main = sizes.indexOf(Math.max(...sizes))
  const out = a.slice()
  for (let i = 0; i < W * H; i++) {
    if (labels[i] >= 0 && !pred(labels[i], sizes[labels[i]], main)) out[i] = 0
  }
  return out
}

// Fill interior holes (background not reachable from the border) up to maxArea.
function fillHoles(a, W, H, maxArea) {
  const inv = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) inv[i] = a[i] > 40 ? 0 : 255
  const { labels, sizes } = components(inv, W, H, 40)
  const touches = new Uint8Array(sizes.length)
  for (let x = 0; x < W; x++) { const t = labels[x], b = labels[(H - 1) * W + x]; if (t >= 0) touches[t] = 1; if (b >= 0) touches[b] = 1 }
  for (let y = 0; y < H; y++) { const l = labels[y * W], r = labels[y * W + W - 1]; if (l >= 0) touches[l] = 1; if (r >= 0) touches[r] = 1 }
  const out = a.slice()
  for (let i = 0; i < W * H; i++) {
    const L = labels[i]
    if (L >= 0 && !touches[L] && sizes[L] <= maxArea) out[i] = 255
  }
  return out
}
const solidify = (a, W, H) => fillHoles(a, W, H, Infinity)

// Binary morphology, chebyshev disc via iterated 3x3 passes.
function morph(a, W, H, r, isDilate) {
  let cur = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) cur[i] = a[i] > 100 ? 255 : 0
  for (let it = 0; it < r; it++) {
    const next = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = isDilate ? 0 : 255
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        const q = (nx < 0 || ny < 0 || nx >= W || ny >= H) ? (isDilate ? 0 : 255) : cur[ny * W + nx]
        v = isDilate ? Math.max(v, q) : Math.min(v, q)
      }
      next[y * W + x] = v
    }
    cur = next
  }
  return cur
}
const close = (a, W, H, r) => morph(morph(a, W, H, r, true), W, H, r, false)

async function blurMask(a, W, H, sigma) {
  const { data, info } = await sharp(Buffer.from(a), { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma).raw().toBuffer({ resolveWithObject: true })
  if (info.channels === 1) return new Uint8Array(data)
  const out = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) out[i] = data[i * info.channels]
  return out
}
function smoothstepMap(a, lo, hi) {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) {
    let t = (a[i] / 255 - lo) / (hi - lo)
    t = Math.max(0, Math.min(1, t))
    out[i] = Math.round(255 * t * t * (3 - 2 * t))
  }
  return out
}

// Normalise: crop to the MAIN component's bbox, fit into FIT px, centre on S².
async function normalise(a, W, H) {
  const { labels, sizes } = components(a, W, H)
  const main = sizes.indexOf(Math.max(...sizes))
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== main) continue
    const x = i % W, y = (i / W) | 0
    if (x < minx) minx = x; if (x > maxx) maxx = x
    if (y < miny) miny = y; if (y > maxy) maxy = y
  }
  const bw = maxx - minx + 1, bh = maxy - miny + 1
  const sub = new Uint8Array(bw * bh)
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) sub[y * bw + x] = a[(miny + y) * W + minx + x]
  const scale = FIT / Math.max(bw, bh)
  const tw = Math.round(bw * scale), th = Math.round(bh * scale)
  // Read the real output geometry back — assuming it matches the request is
  // exactly the kind of silent shear that ruins a mask.
  const { data: rb, info: ri } = await sharp(Buffer.from(sub), { raw: { width: bw, height: bh, channels: 1 } })
    .resize(tw, th, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const out = new Uint8Array(S * S)
  const ox = (S - ri.width) >> 1, oy = (S - ri.height) >> 1
  for (let y = 0; y < ri.height; y++) for (let x = 0; x < ri.width; x++) {
    out[(oy + y) * S + ox + x] = rb[(y * ri.width + x) * ri.channels]
  }
  return out
}

// ═══ 2 · The three refinements ═════════════════════════════════════════════
console.log('mark refinement')
const raw = await keyedMask()

// CURRENT — the production mark, keyed and normalised, untouched otherwise.
const CURRENT = await normalise(raw.a, raw.W, raw.H)

// V1 · Conservative. Cleanup only: detached flecks under 150px² go (the
// uncontrolled splatter), pinholes under 60px² close, and the edge alpha is
// clamped so half-transparent fringe stops greying the silhouette. Every
// deliberate satellite blob and all the dry-brush texture stays.
{
  let a = keepComponents(raw.a, raw.W, raw.H, (id, size, main) => id === main || size >= 150)
  a = fillHoles(a, raw.W, raw.H, 60)
  for (let i = 0; i < a.length; i++) a[i] = a[i] < 16 ? 0 : a[i] > 240 ? 255 : a[i]
  var V1 = await normalise(a, raw.W, raw.H)
}

// V2 · Balanced. The stroke consolidates: satellites go entirely, a close(3)
// fuses dry-brush streaks thinner than ~6px (precisely the detail that dies
// below 120px) while keeping the chunky texture, holes under 300px² fill,
// and the edge is softened with a blur + smoothstep so the silhouette is
// confident rather than scratchy. The gesture, gap, taper and heavy/light
// modulation are untouched — they are far larger than the close radius.
{
  let a = keepComponents(raw.a, raw.W, raw.H, (id, size, main) => id === main)
  a = close(a, raw.W, raw.H, 3)
  a = fillHoles(a, raw.W, raw.H, 300)
  a = await blurMask(a, raw.W, raw.H, 1.4)
  a = smoothstepMap(a, 0.32, 0.68)
  var V2 = await normalise(a, raw.W, raw.H)
}

// V3 · Expressive premium. A polar reconstruction: measure the ORIGINAL
// stroke's own inner/outer radius at 1440 angles, low-pass the profile so the
// sweep reads as one deliberate movement, re-add 22% of the measured residual
// so it stays hand-made, and ease the terminals into real tapers. The result
// follows the existing gesture — its heavy side, its gap, its asymmetry are
// the measured ones — but drawn as a single confident stroke. Output is a
// true vector.
function polarRebuild(solid, W, H) {
  // bbox centre of the solid stroke, not centroid — centroid leans heavy-side
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1
  for (let i = 0; i < W * H; i++) {
    if (solid[i] < 128) continue
    const x = i % W, y = (i / W) | 0
    if (x < minx) minx = x; if (x > maxx) maxx = x
    if (y < miny) miny = y; if (y > maxy) maxy = y
  }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
  const Rmax = Math.max(maxx - minx, maxy - miny) * 0.72
  const N = 1440
  const rin = new Float64Array(N), rout = new Float64Array(N), hit = new Uint8Array(N)
  for (let k = 0; k < N; k++) {
    const t = (2 * Math.PI * k) / N
    const dx = Math.cos(t), dy = Math.sin(t)
    // longest solid run along the ray wins (handles the overlap zone)
    let bestLen = 0, bestIn = 0, bestOut = 0, runStart = -1
    for (let r = 20; r < Rmax; r++) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r)
      const on = x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x] > 128
      if (on && runStart < 0) runStart = r
      if (!on && runStart >= 0) {
        if (r - runStart > bestLen) { bestLen = r - runStart; bestIn = runStart; bestOut = r - 1 }
        runStart = -1
      }
    }
    if (runStart >= 0 && Rmax - runStart > bestLen) { bestLen = Rmax - runStart; bestIn = runStart; bestOut = Rmax - 1 }
    if (bestLen >= 4) { hit[k] = 1; rin[k] = bestIn; rout[k] = bestOut }
  }
  // the gap = the longest circular run of empty rays
  let gapStart = 0, gapLen = 0, curStart = -1, curLen = 0
  for (let k = 0; k < 2 * N; k++) {
    if (!hit[k % N]) { if (curStart < 0) curStart = k; curLen = k - curStart + 1 }
    else { if (curLen > gapLen && curStart < N) { gapLen = curLen; gapStart = curStart % N } curStart = -1; curLen = 0 }
  }
  // unwrap the stroke arc, gap end → gap start
  const a0 = (gapStart + gapLen) % N
  const M = N - gapLen
  const mid = new Float64Array(M), th = new Float64Array(M)
  for (let i = 0; i < M; i++) {
    const k = (a0 + i) % N
    if (hit[k]) { mid[i] = (rin[k] + rout[k]) / 2; th[i] = rout[k] - rin[k] }
    else { mid[i] = NaN; th[i] = NaN }
  }
  // interpolate stray empty rays inside the arc
  for (let i = 0; i < M; i++) {
    if (!Number.isNaN(mid[i])) continue
    let a = i - 1; while (a >= 0 && Number.isNaN(mid[a])) a--
    let b = i + 1; while (b < M && Number.isNaN(mid[b])) b++
    const fa = a >= 0 ? mid[a] : mid[b], fb = b < M ? mid[b] : mid[a]
    const ta = a >= 0 ? th[a] : th[b], tb = b < M ? th[b] : th[a]
    const t = a >= 0 && b < M ? (i - a) / (b - a) : 0
    mid[i] = fa + (fb - fa) * t; th[i] = ta + (tb - ta) * t
  }
  const gauss = (arr, sigma) => {
    const out = new Float64Array(arr.length)
    const R = Math.ceil(sigma * 3)
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, wsum = 0
      for (let d = -R; d <= R; d++) {
        const j = Math.min(arr.length - 1, Math.max(0, i + d))  // reflectish clamp
        const w = Math.exp(-(d * d) / (2 * sigma * sigma))
        sum += arr[j] * w; wsum += w
      }
      out[i] = sum / wsum
    }
    return out
  }
  // Median first: where the stroke start/end overlap radially, longest-run
  // flips between the two and the raw profile jumps 30-50px — a median-9 kills
  // the flips without softening the genuine modulation.
  const median = (arr, R) => {
    const out = new Float64Array(arr.length)
    for (let i = 0; i < arr.length; i++) {
      const win = []
      for (let d = -R; d <= R; d++) win.push(arr[Math.min(arr.length - 1, Math.max(0, i + d))])
      win.sort((a, b) => a - b)
      out[i] = win[R]
    }
    return out
  }
  const midM = median(mid, 4), thM = median(th, 4)
  // The PATH gets heavy smoothing — wobble in the centreline is what reads as
  // a mistake. The WIDTH keeps more of its life — modulation is the brush.
  const midS = gauss(midM, 26), thS = gauss(thM, 14)
  for (let i = 0; i < M; i++) {
    midS[i] += (midM[i] - midS[i]) * 0.08
    thS[i] += (thM[i] - thS[i]) * 0.25
  }
  // deliberate terminal tapers over the last 13% of each end
  const taperN = Math.round(M * 0.10)
  for (let i = 0; i < taperN; i++) {
    const t = i / taperN, e = t * t * (3 - 2 * t)
    const f = 0.24 + 0.76 * e
    thS[i] *= f; thS[M - 1 - i] *= f
  }
  // rebuild the outline
  const pts = []
  for (let i = 0; i < M; i++) {
    const t = (2 * Math.PI * ((a0 + i) % N)) / N
    pts.push([cx + Math.cos(t) * (midS[i] + thS[i] / 2), cy + Math.sin(t) * (midS[i] + thS[i] / 2)])
  }
  for (let i = M - 1; i >= 0; i--) {
    const t = (2 * Math.PI * ((a0 + i) % N)) / N
    pts.push([cx + Math.cos(t) * (midS[i] - thS[i] / 2), cy + Math.sin(t) * (midS[i] - thS[i] / 2)])
  }
  return pts
}
let V3, V3_PATH
{
  // Feed the reconstruction the fleck-INCLUSIVE stroke: dropping satellites
  // first breaks the arc at the dry zone, and the rebuild then puts the
  // opening in the wrong place. With the flecks closed into the stroke, the
  // longest empty run is the logo's true gap.
  const src = keepComponents(raw.a, raw.W, raw.H, (id, size, main) => id === main || size >= 60)
  const solid = solidify(close(src, raw.W, raw.H, 4), raw.W, raw.H)
  const pts = polarRebuild(solid, raw.W, raw.H)
  // normalise the polygon to the shared FIT box
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9
  for (const [x, y] of pts) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y }
  const sc = FIT / Math.max(maxx - minx, maxy - miny)
  const ox = (S - (maxx - minx) * sc) / 2 - minx * sc, oy = (S - (maxy - miny) * sc) / 2 - miny * sc
  V3_PATH = 'M ' + pts.map(([x, y]) => (x * sc + ox).toFixed(2) + ',' + (y * sc + oy).toFixed(2)).join(' L ') + ' Z'
  V3 = new Uint8Array(await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><path d="${V3_PATH}" fill="#fff"/></svg>`
  )).ensureAlpha().extractChannel(3).raw().toBuffer())
}

const MARKS = { CURRENT, V1, V2, V3 }
const MNAMES = { CURRENT: 'current', V1: 'V1 · conservative', V2: 'V2 · balanced', V3: 'V3 · expressive' }

// Small-size master: at ≤72px the interior dry-brush streaks alias into grey
// mush, so sizes at or below that render from a hole-filled twin. The
// silhouette — gap, taper, heavy/light — is identical; only interior texture
// goes. This is the one documented optical adjustment.
const SMALL = {}
for (const k of Object.keys(MARKS)) SMALL[k] = solidify(MARKS[k], S, S)

// ═══ 3 · Raster plumbing ═══════════════════════════════════════════════════
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
// The band of mask pixels whose (dx,dy)-ward neighbour is outside the mask —
// i.e. the edge facing direction (-dx,-dy).
function band(mask, dx, dy) {
  const sh = shift(mask, dx, dy)
  const out = new Uint8Array(S * S)
  for (let i = 0; i < S * S; i++) out[i] = Math.min(mask[i], 255 - sh[i])
  return out
}
async function blurPNG(pngBuf, sigma) { return sharp(pngBuf).blur(sigma).png().toBuffer() }

// ── Mask shapes ────────────────────────────────────────────────────────────
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
async function maskedPNG(buf, size, d) {
  const m = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="${d}" fill="#fff"/></svg>`
  )).png().toBuffer()
  return sharp(buf).composite([{ input: m, blend: 'dest-in' }]).png().toBuffer()
}
const iosMask = (s) => superellipse(s / 2, s / 2, s / 2, 5)

// ═══ 4 · Material fields ═══════════════════════════════════════════════════
// Deterministic stipple, two grades: lacquer grain is finer than seal paste.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function stipple(seed, n, rmin, rmax, opD, opL) {
  const rnd = mulberry32(seed)
  const dark = [], light = []
  for (let i = 0; i < n; i++) {
    const x = (rnd() * S).toFixed(1), y = (rnd() * S).toFixed(1)
    const r = (rmin + rnd() * (rmax - rmin)).toFixed(2)
    ;(rnd() > 0.48 ? dark : light).push(`<circle cx="${x}" cy="${y}" r="${r}"/>`)
  }
  return `<g fill="#000" opacity="${opD}">${dark.join('')}</g><g fill="#FFF" opacity="${opL}">${light.join('')}</g>`
}
const GRAIN_LACQ = stipple(20260815, 2600, 0.8, 2.6, 0.04, 0.035)
const GRAIN_PAPER = stipple(20260816, 2200, 0.9, 3.0, 0.03, 0.05)

// One coherent top-left light. Sheen pulled far back from gloss: 11% → 0 by
// 46%, plus a 20px lit rim at the top. Depth: the diagonal ramp itself plus a
// 7% corner vignette. No painted object shadow anywhere.
function fieldSVG(pal, { paper = false, sheen = true } = {}) {
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
${paper ? GRAIN_PAPER : GRAIN_LACQ}
${sheen && !paper ? `<rect width="${S}" height="${S}" fill="url(#sheen)"/><rect width="${S}" height="26" fill="url(#rim)"/>` : ''}
<rect width="${S}" height="${S}" fill="url(#vig)"/>
</svg>`
}

// ═══ 5 · The four materials, composited at 1024 ════════════════════════════
// mode: light | dark | tint.  stages lets the layer sheet build cumulatively.
const APPROVED = 'V2'   // the recommended mark; swap here re-runs everything
async function matIcon(e, mode, { mark = APPROVED, small = false,
  stages = { mark: true, depth: true, grain: true, sheen: true } } = {}) {
  const m = small ? SMALL[mark] : MARKS[mark]
  const isPaper = e === 'E4'
  const pal = mode === 'tint' ? TINT : (isPaper ? PAPER : LACQ)[mode]
  const layers = []
  const bg = await sharp(Buffer.from(fieldSVG(
    mode === 'tint' ? { ...pal, hi: pal.hi, base: pal.base, lo: pal.lo } : pal,
    { paper: isPaper, sheen: stages.sheen && mode !== 'tint' }
  ))).png().toBuffer()
  if (!stages.grain && mode !== 'tint') {
    // grainless stage for the layer diagram: plain ramp
    layers.push({ input: await sharp(Buffer.from(fieldSVG(pal, { paper: isPaper, sheen: false })
      .replace(GRAIN_LACQ, '').replace(GRAIN_PAPER, ''))).png().toBuffer() })
  }
  if (!stages.mark) return sharp(bg).png().toBuffer()

  const comps = []
  // E3's contact shadow sits UNDER the mark: the solid silhouette shifted
  // down-right, softened, 26% black. Depth ≈ 9px at 1024 — a paper thickness.
  if (e === 'E3' && stages.depth && mode !== 'tint') {
    // Paper thickness, not a sticker: 5px offset, wide soft blur, 15% — the
    // shadow should be felt as contact, never seen as an object shadow.
    comps.push({ input: await blurPNG(await tintPNG(shift(SMALL[mark], 5, 7), '#000000', 0.15), 9) })
  }
  comps.push({ input: await tintPNG(m, pal.mark) })
  if (stages.depth && mode !== 'tint') {
    if (e === 'E2') {
      // Recess: with light at top-left, the top-left inner wall shades and the
      // bottom-right inner edge catches light. Bands ~7px wide — inlay, not
      // carving. Both clipped inside the mark by construction.
      comps.push({ input: await blurPNG(await tintPNG(band(m, 7, 9), '#000000', 0.20), 2.2) })
      comps.push({ input: await blurPNG(await tintPNG(band(m, -6, -8), '#FFFFFF', 0.15), 2.2) })
    }
    if (e === 'E3') {
      // The lifted paper's lit edge, top-left, 3px.
      comps.push({ input: await blurPNG(await tintPNG(band(m, 3, 4), '#FFFFFF', 0.22), 1.2) })
    }
    if (e === 'E4') {
      // Ink settles darker at the stroke edge — 2px, 10%, both sides.
      const edge = new Uint8Array(S * S)
      const b1 = band(m, 2, 3), b2 = band(m, -2, -3)
      for (let i = 0; i < S * S; i++) edge[i] = Math.max(b1[i], b2[i])
      comps.push({ input: await blurPNG(await tintPNG(edge, '#7E2313', 0.20), 1.4) })
    }
  }
  return sharp(bg).composite(comps).png().toBuffer()
}

const ENAMES = {
  E1: 'E1 · lacquer + flat ivory', E2: 'E2 · recessed inlay',
  E3: 'E3 · lifted paper', E4: 'E4 · ink on paper',
}
const EKEYS = ['E1', 'E2', 'E3', 'E4']

// cache flattened 1024s; sizes ≤72 use the small-size master
const CACHE = {}
async function flat(e, mode, small) {
  const key = e + '.' + mode + (small ? '.s' : '')
  if (!CACHE[key]) CACHE[key] = await matIcon(e, mode, { small })
  return CACHE[key]
}
async function icon(e, mode, size) {
  const f = await flat(e, mode, size <= 72)
  const buf = await sharp(f).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  return maskedPNG(buf, size, iosMask(size))
}

// ═══ 6 · Sheets ════════════════════════════════════════════════════════════
const FONTF = 'DejaVu Sans, sans-serif'
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const label = (x, y, t, size = 26, fill = '#8A8A93', anchor = 'middle', weight = 400) =>
  `<text x="${x}" y="${y}" font-family="${FONTF}" font-size="${size}" font-weight="${weight}"` +
  ` fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`
async function writeSheet(name, w, h, bg, els, layers) {
  const base = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${els.join('')}</svg>`
  )).png().toBuffer()
  writeFileSync(OUT + 'previews/' + name, await sharp(base).composite(layers).png().toBuffer())
  console.log('  previews/' + name + '  ' + w + 'x' + h)
}
// mark rendered alone, vermilion on a warm card, at a given size
async function markAlone(k, size, small = size <= 72) {
  const m = small ? SMALL[k] : MARKS[k]
  const buf = await tintPNG(m, '#B83A24')
  return sharp(buf).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
}

console.log('sheets')
const MK = ['CURRENT', 'V1', 'V2', 'V3']

// ── B-01 · current → V1 → V2 → V3 at 180 ───────────────────────────────────
{
  const IS = 180, pad = 70, w = 4 * (IS + pad) + pad, h = 460
  const els = [
    label(w / 2, 62, 'The mark — current production vs three refinements, 180px', 34, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'mark alone, no field: §3 says it must survive without the background', 22, '#8A8A93'),
  ]
  const comps = []
  for (let i = 0; i < 4; i++) {
    const x = pad + i * (IS + pad)
    els.push(`<rect x="${x - 20}" y="140" width="${IS + 40}" height="${IS + 40}" rx="16" fill="#F5EFE4"/>`)
    comps.push({ input: await markAlone(MK[i], IS, false), left: x, top: 160 })
    els.push(label(x + IS / 2, 140 + IS + 84, MNAMES[MK[i]], 25, '#3A3A42', 'middle', 600))
  }
  await writeSheet('B-01-marks-180.png', w, h, '#EDEDEA', els, comps)
}

// ── B-02 · the same four at TRUE 40, plus 6× ───────────────────────────────
{
  const w = 1560, h = 560
  const els = [
    label(w / 2, 58, 'The decision gate — true 40px, then 6×', 34, '#1A1A1E', 'middle', 700),
    label(w / 2, 96, 'first read: that is the Hanzi Dojo logo — not a new circle logo', 22, '#8A8A93'),
  ]
  const comps = []
  for (let i = 0; i < 4; i++) {
    const x = 90 + i * 370
    els.push(label(x + 130, 150, MNAMES[MK[i]], 23, '#3A3A42', 'middle', 600))
    els.push(`<rect x="${x - 4}" y="${196}" width="48" height="48" rx="6" fill="#F5EFE4"/>`)
    comps.push({ input: await markAlone(MK[i], 40), left: x, top: 200 })
    const big = await sharp(await markAlone(MK[i], 40)).resize(240, 240, { kernel: 'nearest' }).png().toBuffer()
    els.push(`<rect x="${x + 58}" y="180" width="248" height="248" rx="8" fill="#F5EFE4"/>`)
    comps.push({ input: big, left: x + 62, top: 184 })
    els.push(label(x + 20, 480, '40px', 19, '#8A8A93'))
    els.push(label(x + 182, 480, '40px @6×', 19, '#8A8A93'))
  }
  await writeSheet('B-02-marks-40.png', w, h, '#EDEDEA', els, comps)
}

// ── B-03 · the full ladder for the marks ───────────────────────────────────
{
  const sizes = [180, 60, 40]
  const colX = [180, 470, 620, 760]
  const rowH = 250, w = 1180, h = 150 + 4 * rowH + 260
  const els = [
    label(w / 2, 62, 'Mark ladder — 180 / 60 / 40 true size, and 1024 detail below', 34, '#1A1A1E', 'middle', 700),
  ]
  sizes.forEach((s, i) => els.push(label(colX[i] + 90, 118, s + 'px', 22, '#8A8A93')))
  const comps = []
  for (let r = 0; r < 4; r++) {
    const cy = 140 + r * rowH + rowH / 2
    els.push(label(24, cy + 8, MNAMES[MK[r]], 24, '#3A3A42', 'start', 700))
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      els.push(`<rect x="${colX[i] + 90 - s / 2 - 10}" y="${cy - s / 2 - 10}" width="${s + 20}" height="${s + 20}" rx="10" fill="#F5EFE4"/>`)
      comps.push({ input: await markAlone(MK[r], s), left: (colX[i] + 90 - s / 2) | 0, top: (cy - s / 2) | 0 })
    }
  }
  // 1024 crops of the terminal zone, current vs V2 vs V3, for craft judgement
  const cropY = 150 + 4 * rowH + 10
  els.push(label(w / 2, cropY, 'terminal detail at 1024 (crop) — current / V2 / V3', 22, '#8A8A93'))
  const crops = [['CURRENT', 90], ['V2', 460], ['V3', 830]]
  for (const [k, x] of crops) {
    const full = await tintPNG(MARKS[k], '#B83A24')
    const crop = await sharp(full).extract({ left: 380, top: 40, width: 560, height: 340 })
      .resize(260, 158).png().toBuffer()
    els.push(`<rect x="${x - 6}" y="${cropY + 16}" width="272" height="170" rx="8" fill="#F5EFE4"/>`)
    comps.push({ input: crop, left: x, top: cropY + 22 })
  }
  await writeSheet('B-03-marks-ladder.png', w, h, '#EDEDEA', els, comps)
}

// ── B-04 · materials at 1024, plus the current production icon ─────────────
{
  const IS = 560, pad = 48, w = 5 * (IS + pad) + pad, h = IS + 300
  const els = [label(w / 2, 74, 'Current production icon, then E1–E4 — all four use the same V2 mark', 40, '#1A1A1E', 'middle', 700)]
  const comps = []
  // current production icon for honest comparison
  const cur = await sharp('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
    .resize(IS, IS).png().toBuffer()
  comps.push({ input: await maskedPNG(cur, IS, iosMask(IS)), left: pad, top: 130 })
  els.push(label(pad + IS / 2, 130 + IS + 58, 'current production', 28, '#3A3A42', 'middle', 600))
  for (let i = 0; i < 4; i++) {
    const x = pad + (i + 1) * (IS + pad)
    comps.push({ input: await icon(EKEYS[i], 'light', IS), left: x, top: 130 })
    els.push(label(x + IS / 2, 130 + IS + 58, ENAMES[EKEYS[i]], 28, '#3A3A42', 'middle', 600))
  }
  await writeSheet('B-04-materials-1024.png', w, h, '#F2F1EE', els, comps)
}

// ── B-05 · material ladder: 180 / 120 / 60 / 40 true + 40@6× ──────────────
{
  const sizes = [180, 120, 60, 40]
  const colX = [140, 400, 600, 750, 900]
  const rowH = 250, w = 1560, h = 150 + 4 * rowH + 40
  const els = [
    label(w / 2, 62, 'Materials at true size — 180 / 120 / 60 / 40, then 40px at 6×', 34, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'sizes at or below 72px render from the small-size master (interior texture solidified)', 22, '#8A8A93'),
  ]
  sizes.forEach((s, i) => els.push(label(colX[i] + 90, 138, s + 'px', 22, '#8A8A93')))
  els.push(label(colX[4] + 120, 138, '40px @6×', 22, '#8A8A93'))
  const comps = []
  for (let r = 0; r < 4; r++) {
    const cy = 150 + r * rowH + rowH / 2
    els.push(label(24, cy + 8, EKEYS[r], 28, '#3A3A42', 'start', 700))
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      comps.push({ input: await icon(EKEYS[r], 'light', s), left: (colX[i] + 90 - s / 2) | 0, top: (cy - s / 2) | 0 })
    }
    comps.push({
      input: await sharp(await icon(EKEYS[r], 'light', 40)).resize(240, 240, { kernel: 'nearest' }).png().toBuffer(),
      left: colX[4], top: cy - 120,
    })
  }
  await writeSheet('B-05-materials-ladder.png', w, h, '#F2F1EE', els, comps)
}

// ── B-06 · iOS appearances ─────────────────────────────────────────────────
{
  const IS = 240, pad = 54, gut = 110, w = 4 * IS + 5 * pad + gut, h = 4 * (IS + 92) + 170
  const cols = [
    { t: 'Light (Any)', bg: '#EDEBE6', mode: 'light' },
    { t: 'Dark (authored)', bg: '#101014', mode: 'dark' },
    { t: 'Tinted (mono)', bg: '#101014', mode: 'tint' },
    { t: 'Clear — SIMULATED', bg: null, mode: null },
  ]
  const els = [
    label(w / 2, 60, 'iOS appearances — authored; Clear is a simulation (Icon Composer needs macOS)', 34, '#F2F1EE', 'middle', 700),
  ]
  const comps = []
  cols.forEach((c, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 130, c.t, 24, '#C8C8D0', 'middle', 600)))
  const wall = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IS}" height="${IS}"><defs>
     <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E4A6B"/>
     <stop offset="0.5" stop-color="#6B4A72"/><stop offset="1" stop-color="#8A5A3C"/></linearGradient></defs>
     <rect width="${IS}" height="${IS}" fill="url(#g)"/></svg>`)).png().toBuffer()
  for (let r = 0; r < 4; r++) {
    const y = 170 + r * (IS + 92)
    els.push(label(46, y + IS / 2, EKEYS[r], 28, '#C8C8D0', 'start', 700))
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i], x = gut + pad + i * (IS + pad)
      if (c.mode) {
        els.push(`<rect x="${x - 16}" y="${y - 16}" width="${IS + 32}" height="${IS + 32}" rx="24" fill="${c.bg}"/>`)
        comps.push({ input: await icon(EKEYS[r], c.mode, IS), left: x, top: y })
      } else {
        const glassMark = await tintPNG(SMALL[APPROVED], '#FFFFFF', 0.62)
        const glassFull = await sharp(Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#FFF" opacity="0.16"/></svg>`
        )).composite([{ input: glassMark }]).png().toBuffer()
        const glass = await sharp(glassFull).resize(IS, IS).png().toBuffer()
        comps.push({
          input: await maskedPNG(await sharp(wall).composite([{ input: glass }]).png().toBuffer(), IS, iosMask(IS)),
          left: x, top: y,
        })
      }
    }
  }
  await writeSheet('B-06-ios.png', w, h, '#08080B', els, comps)
}

// ── B-07 · Android: masks + authored monochrome + themed, finalists E1+E2 ──
{
  const IS = 200, pad = 40, gut = 100, cols = 6
  const w = cols * IS + (cols + 1) * pad + gut, h = 2 * (IS + 96) + 190
  const masksArr = [
    ['circle', (s) => circlePath(s / 2, s / 2, s / 2)],
    ['squircle', (s) => superellipse(s / 2, s / 2, s / 2, 4)],
    ['rounded sq.', (s) => rrect(0, 0, s, s, [s * 0.22, s * 0.22, s * 0.22, s * 0.22])],
    ['teardrop', (s) => rrect(0, 0, s, s, [s * 0.13, s / 2, s / 2, s / 2])],
  ]
  const heads = [...masksArr.map((m) => m[0]), 'monochrome', 'themed · dark']
  const els = [
    label(w / 2, 60, 'Android — adaptive masks, authored monochrome (the real brush), themed', 32, '#F2F1EE', 'middle', 700),
    label(w / 2, 96, 'monochrome ships the actual mark silhouette, not a simplified ring', 21, '#7E7E88'),
  ]
  const comps = []
  heads.forEach((t, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 140, t, 21, '#C8C8D0', 'middle', 600)))
  const fins = ['E1', 'E2']
  for (let r = 0; r < 2; r++) {
    const y = 180 + r * (IS + 96)
    els.push(label(40, y + IS / 2, fins[r], 26, '#C8C8D0', 'start', 700))
    const full = await sharp(await flat(fins[r], 'light', false)).resize(IS, IS).png().toBuffer()
    for (let i = 0; i < masksArr.length; i++) {
      comps.push({ input: await maskedPNG(full, IS, masksArr[i][1](IS)), left: gut + pad + i * (IS + pad), top: y })
    }
    const xm = gut + pad + 4 * (IS + pad)
    els.push(`<rect x="${xm}" y="${y}" width="${IS}" height="${IS}" rx="16" fill="#26262B"/>`)
    comps.push({ input: await sharp(await tintPNG(SMALL[APPROVED], '#F2F1EE')).resize(IS, IS).png().toBuffer(), left: xm, top: y })
    const xt = gut + pad + 5 * (IS + pad)
    const themedFull = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#C88C78"/></svg>`
    )).composite([{ input: await tintPNG(SMALL[APPROVED], '#2A1712') }]).png().toBuffer()
    const themedBg = await sharp(themedFull).resize(IS, IS).png().toBuffer()
    els.push(`<rect x="${xt - 12}" y="${y - 12}" width="${IS + 24}" height="${IS + 24}" rx="20" fill="#101014"/>`)
    comps.push({ input: await maskedPNG(themedBg, IS, circlePath(IS / 2, IS / 2, IS / 2)), left: xt, top: y })
  }
  await writeSheet('B-07-android.png', w, h, '#08080B', els, comps)
}

// ── B-08 · layer architecture, E2 built cumulatively ───────────────────────
{
  const IS = 300, pad = 52, cols = 5
  const w = cols * IS + (cols + 1) * pad, h = IS + 300
  const stages = [
    { t: '1 · lacquer field', o: { stages: { mark: false, depth: false, grain: true, sheen: true } } },
    { t: '2 · brush mark', o: { stages: { mark: true, depth: false, grain: true, sheen: false } } },
    { t: '3 · inlay depth', o: { stages: { mark: true, depth: true, grain: true, sheen: false } } },
    { t: '4 · sheen + rim', o: { stages: { mark: true, depth: true, grain: true, sheen: true } } },
    { t: 'small-size master', o: { small: true, stages: { mark: true, depth: true, grain: true, sheen: true } } },
  ]
  const els = [
    label(w / 2, 62, 'Layer architecture — E2, cumulative; each layer stays a separate flat asset', 32, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'field / mark / depth bands / sheen — Icon Composer gets the flat layers and applies its own material', 21, '#8A8A93'),
  ]
  const comps = []
  for (let i = 0; i < stages.length; i++) {
    const x = pad + i * (IS + pad)
    const buf = await matIcon('E2', 'light', stages[i].o)
    const sized = await sharp(buf).resize(IS, IS).png().toBuffer()
    comps.push({ input: await maskedPNG(sized, IS, iosMask(IS)), left: x, top: 150 })
    els.push(label(x + IS / 2, 150 + IS + 48, stages[i].t, 24, '#3A3A42', 'middle', 600))
  }
  await writeSheet('B-08-layers.png', w, h, '#F2F1EE', els, comps)
}

// ── masters + true-size singles ────────────────────────────────────────────
console.log('masters/')
for (const k of MK) {
  writeFileSync(OUT + `masters/mark-${k}.png`, await tintPNG(MARKS[k], '#B83A24'))
  writeFileSync(OUT + `masters/mask-${k}.png`,
    await sharp(Buffer.from(MARKS[k]), { raw: { width: S, height: S, channels: 1 } }).png().toBuffer())
}
writeFileSync(OUT + 'masters/mark-V3.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><path d="${V3_PATH}" fill="#B83A24"/></svg>`)
writeFileSync(OUT + 'masters/mono-approved.png', await tintPNG(SMALL[APPROVED], '#FFFFFF'))
console.log('  masters/mark-{CURRENT,V1,V2,V3}.png + mask-*.png + mark-V3.svg + mono-approved.png')

for (const e of EKEYS) for (const sz of [40, 120, 180]) {
  writeFileSync(OUT + `previews/true${sz}-${e}.png`, await icon(e, 'light', sz))
}
for (const k of MK) {
  writeFileSync(OUT + `previews/mark40-${k}.png`, await markAlone(k, 40))
  writeFileSync(OUT + `previews/mark180-${k}.png`, await markAlone(k, 180, false))
}
console.log('  previews/true{40,120,180}-{E1..E4}.png + mark{40,180}-*.png')
console.log('done — nothing outside docs/icon-v2/brush/ was written')
