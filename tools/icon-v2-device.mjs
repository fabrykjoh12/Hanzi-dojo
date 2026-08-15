// P14 — App Icon V2, E1 vs E2 device-validation package. CONCEPTS ONLY.
//
// Writes nothing outside docs/icon-v2/device/. Does not touch ios/, android/,
// public/, assets/ or src/, and does not modify tools/generate-app-icons.mjs.
//
// The identity is locked: the V2 brush mark (approved) — this script does not
// re-derive it, it LOADS the committed master from docs/icon-v2/brush/masters/
// so both finalists are guaranteed to carry the byte-identical silhouette.
// The only question left: does E2's shallow inlay improve the icon on a real
// device, or is E1's flat mark cleaner?
//
// Run: node tools/icon-v2-device.mjs   (requires the brush masters, committed)

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const S = 1024
const OUT = 'docs/icon-v2/device/'
const MASK_SRC = 'docs/icon-v2/brush/masters/mask-V2.png'
mkdirSync(OUT + 'previews', { recursive: true })

// ── Palette — locked from the brush gate ───────────────────────────────────
const LACQ = {
  light: { hi: '#C24730', base: '#B83A24', lo: '#8E2D1A', mark: '#F8F1E9' },
  dark:  { hi: '#8F2E1C', base: '#7C2413', lo: '#5C1B0C', mark: '#EFE3D6' },
}
const TINT = { hi: '#343B46', base: '#262D36', lo: '#171C22', mark: '#A9C6EC' }

// ═══ 1 · Load the locked V2 mask ═══════════════════════════════════════════
async function loadMask() {
  const { data, info } = await sharp(MASK_SRC).raw().toBuffer({ resolveWithObject: true })
  if (info.width !== S || info.height !== S) throw new Error('mask-V2.png is not 1024²')
  const a = new Uint8Array(S * S)
  for (let i = 0; i < S * S; i++) a[i] = data[i * info.channels]
  return a
}
// Solidify (small-size master): fill interior holes not reachable from border.
function solidify(a) {
  const W = S, H = S
  const inv = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) inv[i] = a[i] > 40 ? 0 : 255
  const labels = new Int32Array(W * H).fill(-1)
  const stack = new Int32Array(W * H)
  const sizes = []
  let count = 0
  for (let s0 = 0; s0 < W * H; s0++) {
    if (inv[s0] <= 40 || labels[s0] !== -1) continue
    let top = 0
    stack[top++] = s0; labels[s0] = count
    let size = 0
    while (top > 0) {
      const p = stack[--top]; size++
      const x = p % W, y = (p / W) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (inv[q] > 40 && labels[q] === -1) { labels[q] = count; stack[top++] = q }
      }
    }
    sizes.push(size); count++
  }
  const touches = new Uint8Array(count)
  for (let x = 0; x < W; x++) { const t = labels[x], b = labels[(H - 1) * W + x]; if (t >= 0) touches[t] = 1; if (b >= 0) touches[b] = 1 }
  for (let y = 0; y < H; y++) { const l = labels[y * W], r = labels[y * W + W - 1]; if (l >= 0) touches[l] = 1; if (r >= 0) touches[r] = 1 }
  const out = a.slice()
  for (let i = 0; i < W * H; i++) { const L = labels[i]; if (L >= 0 && !touches[L]) out[i] = 255 }
  return out
}
const MARK = await loadMask()
const MARK_SMALL = solidify(MARK)

// ═══ 2 · Compositing (identical to the approved brush-gate recipe) ═════════
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
function fieldSVG(pal, sheen = true) {
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

// e: 'E1' | 'E2' · mode: 'light' | 'dark' | 'tint' · small: ≤72px master
async function matIcon(e, mode, small = false) {
  const m = small ? MARK_SMALL : MARK
  const pal = mode === 'tint' ? TINT : LACQ[mode]
  const bg = await sharp(Buffer.from(fieldSVG(pal, mode !== 'tint'))).png().toBuffer()
  const comps = [{ input: await tintPNG(m, pal.mark) }]
  if (e === 'E2' && mode !== 'tint') {
    comps.push({ input: await blurPNG(await tintPNG(band(m, 7, 9), '#000000', 0.20), 2.2) })
    comps.push({ input: await blurPNG(await tintPNG(band(m, -6, -8), '#FFFFFF', 0.15), 2.2) })
  }
  return sharp(bg).composite(comps).png().toBuffer()
}
const CACHE = {}
async function flat(e, mode, small) {
  const k = e + mode + (small ? 's' : '')
  if (!CACHE[k]) CACHE[k] = await matIcon(e, mode, small)
  return CACHE[k]
}

// ── Shapes + resize ────────────────────────────────────────────────────────
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
async function maskedPNG(buf, size, d) {
  const m = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="${d}" fill="#fff"/></svg>`
  )).png().toBuffer()
  return sharp(buf).composite([{ input: m, blend: 'dest-in' }]).png().toBuffer()
}
const iosMask = (s) => superellipse(s / 2, s / 2, s / 2, 5)
async function icon(e, mode, size) {
  const buf = await sharp(await flat(e, mode, size <= 72)).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  return maskedPNG(buf, size, iosMask(size))
}

// ── Sheet plumbing ─────────────────────────────────────────────────────────
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

console.log('device package')

// ═══ D-01 · size ladder ════════════════════════════════════════════════════
{
  const sizes = [180, 120, 60, 40]
  const colX = [150, 410, 610, 760, 910]
  const rowH = 260, w = 1580, h = 150 + 2 * rowH + 40
  const els = [
    label(w / 2, 62, 'E1 vs E2 — true 180 / 120 / 60 / 40, then 40px at 6×', 36, '#1A1A1E', 'middle', 700),
    label(w / 2, 100, 'byte-identical V2 silhouette in both; the only difference is the inlay', 22, '#8A8A93'),
  ]
  sizes.forEach((s, i) => els.push(label(colX[i] + 90, 138, s + 'px', 22, '#8A8A93')))
  els.push(label(colX[4] + 120, 138, '40px @6×', 22, '#8A8A93'))
  const comps = []
  const E = ['E1', 'E2']
  for (let r = 0; r < 2; r++) {
    const cy = 150 + r * rowH + rowH / 2
    els.push(label(30, cy + 8, E[r], 30, '#3A3A42', 'start', 700))
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      comps.push({ input: await icon(E[r], 'light', s), left: (colX[i] + 90 - s / 2) | 0, top: (cy - s / 2) | 0 })
    }
    comps.push({
      input: await sharp(await icon(E[r], 'light', 40)).resize(240, 240, { kernel: 'nearest' }).png().toBuffer(),
      left: colX[4], top: cy - 120,
    })
  }
  await writeSheet('D-01-ladder.png', w, h, '#F2F1EE', els, comps)
}

// ═══ D-02/D-03 · realistic Home Screen mockups ═════════════════════════════
// 393pt-wide iPhone at 3×: 1179px, 60pt icons = 180px, 4 columns. E1 and E2
// sit side by side in row 2 so the comparison happens in situ. Neighbour
// icons are generic category tiles (no real brands) so nothing distracts.
const NB = {
  msg: `<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BE06E"/><stop offset="1" stop-color="#2BB84C"/></linearGradient></defs>
    <rect width="180" height="180" fill="url(#g1)"/><path d="M90 42c-30 0-54 19-54 43 0 14 8 26 21 34l-6 19 22-11c5 1 11 2 17 2 30 0 54-19 54-44s-24-43-54-43z" fill="#fff"/>`,
  mail: `<defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4DA1FF"/><stop offset="1" stop-color="#1C6FE8"/></linearGradient></defs>
    <rect width="180" height="180" fill="url(#g2)"/><rect x="34" y="56" width="112" height="72" rx="10" fill="#fff"/><path d="M38 62l52 40 52-40" stroke="#1C6FE8" stroke-width="7" fill="none"/>`,
  cam: `<rect width="180" height="180" fill="#D8D9DE"/><rect x="30" y="56" width="120" height="76" rx="14" fill="#4A4A52"/><circle cx="90" cy="94" r="26" fill="#8E9098"/><circle cx="90" cy="94" r="15" fill="#3A3B40"/><rect x="52" y="44" width="30" height="16" rx="5" fill="#4A4A52"/>`,
  mus: `<defs><linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FC5C7D"/><stop offset="1" stop-color="#E8324F"/></linearGradient></defs>
    <rect width="180" height="180" fill="url(#g3)"/><circle cx="70" cy="120" r="15" fill="#fff"/><circle cx="122" cy="108" r="15" fill="#fff"/><path d="M83 120V56l54-12v64" stroke="#fff" stroke-width="10" fill="none"/>`,
  cal: `<rect width="180" height="180" fill="#FDFDFE"/><rect width="180" height="52" fill="#F0453B"/><text x="90" y="38" font-family="${FONTF}" font-size="26" fill="#fff" text-anchor="middle" font-weight="600">FRI</text><text x="90" y="138" font-family="${FONTF}" font-size="72" fill="#1A1A1E" text-anchor="middle" font-weight="300">15</text>`,
  clk: `<rect width="180" height="180" fill="#0F0F13"/><circle cx="90" cy="90" r="62" fill="#fff"/><line x1="90" y1="90" x2="90" y2="46" stroke="#111" stroke-width="6"/><line x1="90" y1="90" x2="118" y2="104" stroke="#111" stroke-width="5"/><line x1="90" y1="90" x2="70" y2="58" stroke="#F0453B" stroke-width="3"/>`,
  set: `<rect width="180" height="180" fill="#C9CBD2"/><circle cx="90" cy="90" r="46" fill="#7C7E88"/><circle cx="90" cy="90" r="20" fill="#C9CBD2"/><g fill="#7C7E88">${[0,45,90,135,180,225,270,315].map(a=>`<rect x="84" y="30" width="12" height="22" rx="4" transform="rotate(${a} 90 90)"/>`).join('')}</g>`,
  wea: `<defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4BA5EF"/><stop offset="1" stop-color="#2E7CD6"/></linearGradient></defs>
    <rect width="180" height="180" fill="url(#g4)"/><circle cx="72" cy="72" r="26" fill="#FFD34D"/><ellipse cx="104" cy="108" rx="38" ry="24" fill="#fff"/><ellipse cx="74" cy="114" rx="26" ry="18" fill="#fff"/>`,
  not: `<rect width="180" height="180" fill="#FDFDFE"/><rect width="180" height="46" fill="#F7D64A"/><line x1="30" y1="76" x2="150" y2="76" stroke="#D8D9DE" stroke-width="5"/><line x1="30" y1="104" x2="150" y2="104" stroke="#D8D9DE" stroke-width="5"/><line x1="30" y1="132" x2="112" y2="132" stroke="#D8D9DE" stroke-width="5"/>`,
  pho: `<rect width="180" height="180" fill="#FDFDFE"/>${[0,45,90,135,180,225,270,315].map((a,i)=>`<ellipse cx="90" cy="62" rx="16" ry="30" fill="${['#F5C242','#F09537','#EA5D57','#D6539B','#8E5BC0','#5271D6','#4BA5C9','#67C06B'][i]}" opacity="0.82" transform="rotate(${a} 90 90)"/>`).join('')}`,
  map: `<rect width="180" height="180" fill="#EFEBE2"/><path d="M0 120 C50 96 70 150 122 122 L180 96 V180 H0 Z" fill="#CFE6B8"/><path d="M0 70 C60 60 90 110 180 74" stroke="#F5C242" stroke-width="14" fill="none"/><path d="M28 40 C70 46 120 20 180 40" stroke="#9EC5EA" stroke-width="18" fill="none"/>`,
  fit: `<defs><linearGradient id="g5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3A42"/><stop offset="1" stop-color="#141418"/></linearGradient></defs>
    <rect width="180" height="180" fill="url(#g5)"/><circle cx="90" cy="90" r="46" stroke="#FA4D67" stroke-width="13" fill="none" stroke-dasharray="216 74" transform="rotate(-90 90 90)"/><circle cx="90" cy="90" r="28" stroke="#A6F03C" stroke-width="13" fill="none" stroke-dasharray="120 56" transform="rotate(-90 90 90)"/>`,
}
async function nbIcon(key, size, dim = false) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">${NB[key]}${dim ? '<rect width="180" height="180" fill="#000" opacity="0.22"/>' : ''}</svg>`
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  return maskedPNG(buf, size, iosMask(size))
}
async function homeSheet(name, dark) {
  const PW = 1179, PH = 1720
  const IC = 180
  const mx = 81, gap = (PW - 2 * mx - 4 * IC) / 3
  const colXs = [0, 1, 2, 3].map((c) => mx + c * (IC + gap))
  const rowYs = [170, 458, 746, 1034]
  const wallLight = `<defs><linearGradient id="wp" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#DCE3E8"/><stop offset="0.55" stop-color="#CBB9AE"/>
    <stop offset="1" stop-color="#A98E80"/></linearGradient></defs><rect width="${PW}" height="${PH}" fill="url(#wp)"/>`
  const wallDark = `<defs><linearGradient id="wp" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#20242E"/><stop offset="0.55" stop-color="#161A24"/>
    <stop offset="1" stop-color="#0C0E14"/></linearGradient></defs><rect width="${PW}" height="${PH}" fill="url(#wp)"/>`
  const els = [dark ? wallDark : wallLight]
  // status bar
  els.push(label(mx + 30, 74, '9:41', 40, '#FFFFFF', 'start', 600))
  els.push(`<g fill="#FFF"><rect x="${PW - 120}" y="52" width="44" height="22" rx="6" opacity="0.95"/><rect x="${PW - 72}" y="59" width="4" height="8" rx="2" opacity="0.95"/><path d="M${PW - 176} 72 a26 26 0 0 1 36 0" stroke="#FFF" stroke-width="7" fill="none"/><path d="M${PW - 226} 60 l12 14 12-14z" opacity="0.95"/></g>`)
  const comps = []
  const grid = [
    ['cal', 'clk', 'map', 'wea'],
    ['msg', 'E1', 'E2', 'mail'],
    ['pho', 'mus', 'not', 'fit'],
  ]
  const names = {
    cal: 'Calendar', clk: 'Clock', map: 'Maps', wea: 'Weather', msg: 'Messages',
    mail: 'Mail', pho: 'Photos', mus: 'Music', not: 'Notes', fit: 'Fitness',
    cam: 'Camera', set: 'Settings', E1: 'Hanzi Dojo', E2: 'Hanzi Dojo',
  }
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < 4; c++) {
      const key = grid[r][c]
      const x = colXs[c] | 0, y = rowYs[r]
      const buf = key === 'E1' || key === 'E2'
        ? await icon(key, dark ? 'dark' : 'light', IC)
        : await nbIcon(key, IC, dark)
      comps.push({ input: buf, left: x, top: y })
      const shadowText = label(x + IC / 2 + 2, y + IC + 46, names[key], 30, 'rgba(0,0,0,0.45)', 'middle', 500)
      els.push(shadowText, label(x + IC / 2, y + IC + 44, names[key], 30, '#FFFFFF', 'middle', 500))
      if (key === 'E1' || key === 'E2') {
        els.push(`<rect x="${x + IC / 2 - 34}" y="${y - 48}" width="68" height="34" rx="17" fill="${dark ? '#EFE3D6' : '#1A1A1E'}" opacity="0.9"/>`)
        els.push(label(x + IC / 2, y - 24, key, 22, dark ? '#1A1A1E' : '#FFFFFF', 'middle', 700))
      }
    }
  }
  // search pill + dock
  els.push(`<rect x="${PW / 2 - 110}" y="1320" width="220" height="58" rx="29" fill="#FFF" opacity="${dark ? 0.14 : 0.4}"/>`)
  els.push(label(PW / 2, 1358, 'Search', 26, dark ? 'rgba(255,255,255,0.8)' : 'rgba(40,40,46,0.75)', 'middle'))
  els.push(`<rect x="30" y="1420" width="${PW - 60}" height="252" rx="64" fill="#FFF" opacity="${dark ? 0.12 : 0.32}"/>`)
  const dock = ['cam', 'set', 'msg', 'mail']
  for (let c = 0; c < 4; c++) {
    comps.push({ input: await nbIcon(dock[c], IC, dark), left: colXs[c] | 0, top: 1456 })
  }
  // frame the phone on a sheet
  const SW = PW + 240, SH = PH + 300
  const phone = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">${els.join('')}</svg>`
  )).png().toBuffer()
  const phoneComp = await sharp(phone).composite(comps).png().toBuffer()
  const cornered = await sharp(phoneComp).composite([{
    input: await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}"><rect width="${PW}" height="${PH}" rx="110" fill="#fff"/></svg>`
    )).png().toBuffer(), blend: 'dest-in',
  }]).png().toBuffer()
  const sheetEls = [
    label(SW / 2, 78, dark ? 'Home Screen — dark, authored dark icons' : 'Home Screen — light', 38, dark ? '#F2F1EE' : '#1A1A1E', 'middle', 700),
    label(SW / 2, 120, 'E1 and E2 side by side in row two — generic neighbour tiles, no real brands', 22, '#8A8A93'),
    `<rect x="${(SW - PW) / 2 - 14}" y="${166}" width="${PW + 28}" height="${PH + 28}" rx="122" fill="${dark ? '#26262B' : '#3A3A42'}"/>`,
  ]
  await writeSheet(name, SW, SH, dark ? '#08080B' : '#EDEDEA',
    sheetEls, [{ input: cornered, left: (SW - PW) / 2, top: 180 }])
}
await homeSheet('D-02-home-light.png', false)
await homeSheet('D-03-home-dark.png', true)

// ═══ D-04 · iOS Light / Dark / Tinted ══════════════════════════════════════
{
  const IS = 260, pad = 60, gut = 110, w = 3 * IS + 4 * pad + gut, h = 2 * (IS + 100) + 170
  const cols = [
    { t: 'Light (Any)', bg: '#EDEBE6', mode: 'light' },
    { t: 'Dark (authored)', bg: '#101014', mode: 'dark' },
    { t: 'Tinted (mono)', bg: '#101014', mode: 'tint' },
  ]
  const els = [label(w / 2, 60, 'iOS appearances — E1 vs E2, all authored', 36, '#F2F1EE', 'middle', 700)]
  const comps = []
  cols.forEach((c, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 128, c.t, 26, '#C8C8D0', 'middle', 600)))
  const E = ['E1', 'E2']
  for (let r = 0; r < 2; r++) {
    const y = 170 + r * (IS + 100)
    els.push(label(46, y + IS / 2, E[r], 30, '#C8C8D0', 'start', 700))
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i], x = gut + pad + i * (IS + pad)
      els.push(`<rect x="${x - 16}" y="${y - 16}" width="${IS + 32}" height="${IS + 32}" rx="24" fill="${c.bg}"/>`)
      comps.push({ input: await icon(E[r], c.mode, IS), left: x, top: y })
    }
  }
  await writeSheet('D-04-ios.png', w, h, '#08080B', els, comps)
}

// ═══ D-05 · Android squircle / circle / monochrome / themed ════════════════
{
  const IS = 230, pad = 56, gut = 110, w = 4 * IS + 5 * pad + gut, h = 2 * (IS + 100) + 190
  const heads = ['squircle', 'circle', 'monochrome', 'themed · dark']
  const els = [
    label(w / 2, 60, 'Android — adaptive masks, authored monochrome, themed', 36, '#F2F1EE', 'middle', 700),
    label(w / 2, 98, 'the monochrome layer is the V2 small-size silhouette — the real mark, not a ring', 22, '#7E7E88'),
  ]
  const comps = []
  heads.forEach((t, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 146, t, 24, '#C8C8D0', 'middle', 600)))
  const E = ['E1', 'E2']
  for (let r = 0; r < 2; r++) {
    const y = 186 + r * (IS + 100)
    els.push(label(46, y + IS / 2, E[r], 30, '#C8C8D0', 'start', 700))
    const full = await sharp(await flat(E[r], 'light', false)).resize(IS, IS).png().toBuffer()
    comps.push({ input: await maskedPNG(full, IS, superellipse(IS / 2, IS / 2, IS / 2, 4)), left: gut + pad, top: y })
    comps.push({ input: await maskedPNG(full, IS, circlePath(IS / 2, IS / 2, IS / 2)), left: gut + pad + (IS + pad), top: y })
    const xm = gut + pad + 2 * (IS + pad)
    els.push(`<rect x="${xm}" y="${y}" width="${IS}" height="${IS}" rx="18" fill="#26262B"/>`)
    comps.push({ input: await sharp(await tintPNG(MARK_SMALL, '#F2F1EE')).resize(IS, IS).png().toBuffer(), left: xm, top: y })
    const xt = gut + pad + 3 * (IS + pad)
    const themedFull = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#C88C78"/></svg>`
    )).composite([{ input: await tintPNG(MARK_SMALL, '#2A1712') }]).png().toBuffer()
    els.push(`<rect x="${xt - 12}" y="${y - 12}" width="${IS + 24}" height="${IS + 24}" rx="20" fill="#101014"/>`)
    comps.push({
      input: await maskedPNG(await sharp(themedFull).resize(IS, IS).png().toBuffer(), IS, circlePath(IS / 2, IS / 2, IS / 2)),
      left: xt, top: y,
    })
  }
  await writeSheet('D-05-android.png', w, h, '#08080B', els, comps)
}

// true-size singles for the review page
for (const e of ['E1', 'E2']) for (const sz of [40, 60, 120, 180]) {
  writeFileSync(OUT + `previews/true${sz}-${e}.png`, await icon(e, 'light', sz))
}
console.log('  previews/true{40,60,120,180}-{E1,E2}.png')
console.log('done — nothing outside docs/icon-v2/device/ was written')
