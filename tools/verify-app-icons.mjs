// App Icon V2 regression gate. Renders the ACTUAL generated production assets
// (not the concept pipeline) at 180/120/60/40, simulates the Android masks and
// themed treatment from the real layer PNGs, and runs the numeric checks the
// implementation brief requires:
//
//   - the three iOS assets are 1024² and carry NO alpha channel
//   - the production light icon matches the approved device gate render
//     (mean abs diff vs docs/icon-v2/device/previews/true180-E2.png)
//   - field colour at centre-left stays in the approved vermilion family
//   - the foreground layer has no grey fringe (edge alpha fraction sane)
//   - the monochrome layer is pure single-colour + alpha
//
// Output: docs/icon-v2/impl/V-01-ios-sizes.png, V-02-android.png, and a
// pass/fail line per check. Exit code 1 on any failure.
//
// Run after tools/generate-app-icons.mjs:  node tools/verify-app-icons.mjs

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'docs/icon-v2/impl/'
mkdirSync(OUT, { recursive: true })
let failures = 0
const check = (name, ok, detail) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''))
  if (!ok) failures++
}

const IOS = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/'
const RES = 'android/app/src/main/res/'

// ── helpers ────────────────────────────────────────────────────────────────
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
const FONTF = 'DejaVu Sans, sans-serif'
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const label = (x, y, t, size = 24, fill = '#8A8A93', anchor = 'middle', weight = 400) =>
  `<text x="${x}" y="${y}" font-family="${FONTF}" font-size="${size}" font-weight="${weight}"` +
  ` fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`
async function writeSheet(name, w, h, bg, els, layers) {
  const base = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${els.join('')}</svg>`
  )).png().toBuffer()
  writeFileSync(OUT + name, await sharp(base).composite(layers).png().toBuffer())
  console.log('  ' + OUT + name)
}

// ── numeric checks ─────────────────────────────────────────────────────────
console.log('checks')
for (const [f, nm] of [['AppIcon-512@2x.png', 'light'], ['AppIcon-Dark.png', 'dark'], ['AppIcon-Tinted.png', 'tinted']]) {
  const meta = await sharp(IOS + f).metadata()
  check(`ios ${nm}: 1024² and no alpha`, meta.width === 1024 && meta.height === 1024 && !meta.hasAlpha,
    `${meta.width}x${meta.height} hasAlpha=${meta.hasAlpha}`)
}
{
  // Approved-gate fidelity: the production light asset, resized and masked the
  // same way the gate rendered its 180px single, must match it near-exactly.
  const prod = await masked(await sharp(IOS + 'AppIcon-512@2x.png').resize(180, 180, { kernel: 'lanczos3' }).png().toBuffer(), 180, iosMask(180))
  const gate = 'docs/icon-v2/device/previews/true180-E2.png'
  const a = await sharp(prod).ensureAlpha().raw().toBuffer()
  const b = await sharp(gate).ensureAlpha().raw().toBuffer()
  let sum = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += Math.abs(a[i] - b[i])
  const mad = sum / Math.min(a.length, b.length)
  check('light matches approved gate render', a.length === b.length && mad < 2.0, 'mean abs diff ' + mad.toFixed(3))
}
{
  // Field colour: sample a 40px patch centre-left (inside the field, outside
  // the mark) and confirm it stays in the vermilion family near base #B83A24.
  const { data, info } = await sharp(IOS + 'AppIcon-512@2x.png').raw().toBuffer({ resolveWithObject: true })
  let r = 0, g = 0, b = 0, n = 0
  for (let y = 492; y < 532; y++) for (let x = 40; x < 80; x++) {
    const i = (y * info.width + x) * info.channels
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  r /= n; g /= n; b /= n
  const ok = r > 150 && r < 210 && g > 40 && g < 80 && b > 20 && b < 60 && r > g + 90
  check('field colour in approved family', ok, `avg rgb(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)}) vs #B83A24`)
}
{
  // Foreground fringe: partial-alpha pixels should be a thin minority of the
  // covered area (anti-aliased edge + brush texture, not a grey halo).
  const { data, info } = await sharp(RES + 'mipmap-xxxhdpi/ic_launcher_foreground.png').raw().toBuffer({ resolveWithObject: true })
  let partial = 0, covered = 0
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * info.channels + 3]
    if (a > 8) covered++
    if (a > 8 && a < 247) partial++
  }
  const frac = partial / Math.max(1, covered)
  check('foreground has no grey fringe / halo', frac < 0.28, (100 * frac).toFixed(1) + '% partial-alpha of covered')
}
{
  // Monochrome: every covered pixel must be the same colour (alpha varies).
  const { data, info } = await sharp(RES + 'mipmap-xxxhdpi/ic_launcher_monochrome.png').raw().toBuffer({ resolveWithObject: true })
  let bad = 0
  for (let i = 0; i < info.width * info.height; i++) {
    const p = i * info.channels
    if (data[p + 3] > 8 && (data[p] < 250 || data[p + 1] < 250 || data[p + 2] < 250)) bad++
  }
  check('monochrome is flat single-colour + alpha', bad === 0, bad + ' off-colour pixels')
}
{
  // FULL-BLEED. The artwork must reach all four edges: iOS owns the corner mask,
  // and a baked plate or inset field would show as a visible border once the OS
  // rounds the corners. Verified two ways per asset — every corner pixel is live
  // artwork, and the outer 2px band carries the field's own gradient rather than
  // one flat chrome colour. (Checked 2026-08-15 after the V-01 review sheet's
  // cream/black plates were mistaken for baked-in background; they are sheet
  // chrome only. See docs/icon-v2/impl/V-03/V-04.)
  for (const [f, nm] of [['AppIcon-512@2x.png', 'light'], ['AppIcon-Dark.png', 'dark'], ['AppIcon-Tinted.png', 'tinted']]) {
    const { data, info } = await sharp(IOS + f).raw().toBuffer({ resolveWithObject: true })
    const { width: W, height: H, channels: Cn } = info
    const at = (x, y) => { const i = (y * W + x) * Cn; return [data[i], data[i + 1], data[i + 2]] }
    const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)]
    // A plate would be near-white (cream) or near-black; live artwork is neither.
    const plateLike = corners.filter((c) => {
      const mx = Math.max(...c), mn = Math.min(...c)
      return (mn > 225 && mx - mn < 14) || (mx < 26)
    }).length
    let bmin = 255, bmax = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= 2 && y >= 2 && x < W - 2 && y < H - 2) continue
      const v = at(x, y)[0]
      if (v < bmin) bmin = v
      if (v > bmax) bmax = v
    }
    check(`ios ${nm}: full-bleed, no baked plate`, plateLike === 0 && bmax - bmin > 15,
      `corners ${corners.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')).join(' ')}, border R range ${bmin}-${bmax}`)
  }
}
{
  const j = JSON.parse((await import('node:fs')).readFileSync(IOS + 'Contents.json', 'utf8'))
  const vals = j.images.map((i) => (i.appearances || [{ value: 'any' }])[0].value).sort().join(',')
  check('Contents.json declares any+dark+tinted', vals === 'any,dark,tinted', vals)
}

// ── V-01: iOS production assets at 180/120/60/40 ───────────────────────────
console.log('sheets')
{
  // Plates are NEUTRAL GREY on purpose. Earlier versions used cream and
  // near-black, which read as though an outer background were baked into the
  // asset — it is not (see the full-bleed check above, and V-03/V-04). Grey
  // cannot be mistaken for either the ivory mark or a dark plate.
  const files = [['AppIcon-512@2x.png', 'Light (Any)', '#9AA0A6', '#1A1A1E'], ['AppIcon-Dark.png', 'Dark', '#9AA0A6', '#1A1A1E'], ['AppIcon-Tinted.png', 'Tinted (grey asset)', '#9AA0A6', '#1A1A1E']]
  const sizes = [180, 120, 60, 40]
  const rowH = 260, w = 1560, h = 150 + 3 * rowH + 40
  const els = [
    label(0.5 * w, 60, 'PRODUCTION iOS assets — rendered from the shipped PNGs, true size', 34, '#1A1A1E', 'middle', 700),
    label(0.5 * w, 98, 'plus the 40px render at 6× — grey plates are sheet chrome; the assets are full-bleed', 22, '#8A8A93'),
  ]
  const colX = [150, 410, 610, 760, 910]
  sizes.forEach((s, i) => els.push(label(colX[i] + 90, 138, s + 'px', 22, '#8A8A93')))
  els.push(label(colX[4] + 120, 138, '40px @6×', 22, '#8A8A93'))
  const comps = []
  for (let r = 0; r < files.length; r++) {
    const [f, nm, plate] = files[r]
    const cy = 150 + r * rowH + rowH / 2
    els.push(label(24, cy + 8, nm, 24, '#3A3A42', 'start', 700))
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i]
      els.push(`<rect x="${colX[i] + 90 - s / 2 - 12}" y="${cy - s / 2 - 12}" width="${s + 24}" height="${s + 24}" rx="14" fill="${plate}"/>`)
      const buf = await masked(await sharp(IOS + f).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer(), s, iosMask(s))
      comps.push({ input: buf, left: (colX[i] + 90 - s / 2) | 0, top: (cy - s / 2) | 0 })
    }
    const forty = await masked(await sharp(IOS + f).resize(40, 40, { kernel: 'lanczos3' }).png().toBuffer(), 40, iosMask(40))
    comps.push({ input: await sharp(forty).resize(240, 240, { kernel: 'nearest' }).png().toBuffer(), left: colX[4], top: cy - 120 })
  }
  await writeSheet('V-01-ios-sizes.png', w, h, '#F2F1EE', els, comps)
}

// ── V-02: Android — adaptive composition from the real layers ──────────────
{
  const IS = 220, pad = 50, gut = 130, cols = 6
  const w = cols * IS + (cols + 1) * pad + gut, h = IS + 260
  // Compose exactly as a launcher does: 108dp canvas = layer PNG, mask shows
  // the centre 72/108 of it.
  const bg = await sharp(RES + 'mipmap-xxxhdpi/ic_launcher_background.png').png().toBuffer()
  const fg = await sharp(RES + 'mipmap-xxxhdpi/ic_launcher_foreground.png').png().toBuffer()
  const full = await sharp(bg).composite([{ input: fg }]).png().toBuffer()          // 432²
  const visible = Math.round(432 * 72 / 108)                                        // 288
  const crop = await sharp(full).extract({ left: (432 - visible) / 2, top: (432 - visible) / 2, width: visible, height: visible })
    .resize(IS, IS, { kernel: 'lanczos3' }).png().toBuffer()
  const masks = [
    ['circle', circlePath(IS / 2, IS / 2, IS / 2)],
    ['squircle', superellipse(IS / 2, IS / 2, IS / 2, 4)],
    ['rounded sq.', rrect(0, 0, IS, IS, [IS * 0.22, IS * 0.22, IS * 0.22, IS * 0.22])],
    ['teardrop', rrect(0, 0, IS, IS, [IS * 0.13, IS / 2, IS / 2, IS / 2])],
  ]
  const els = [
    label(w / 2, 60, 'PRODUCTION Android layers — launcher composition (72dp crop of the 108dp canvas)', 30, '#F2F1EE', 'middle', 700),
    label(w / 2, 98, 'plus the authored monochrome and both themed treatments from the shipped monochrome PNG', 21, '#7E7E88'),
  ]
  const comps = []
  const heads = [...masks.map((m) => m[0]), 'monochrome', 'themed light / dark']
  heads.forEach((t, i) => els.push(label(gut + pad + i * (IS + pad) + IS / 2, 146, t, 21, '#C8C8D0', 'middle', 600)))
  const y = 180
  for (let i = 0; i < masks.length; i++) {
    comps.push({ input: await masked(crop, IS, masks[i][1]), left: gut + pad + i * (IS + pad), top: y })
  }
  const mono = await sharp(RES + 'mipmap-xxxhdpi/ic_launcher_monochrome.png').png().toBuffer()
  const xm = gut + pad + 4 * (IS + pad)
  els.push(`<rect x="${xm}" y="${y}" width="${IS}" height="${IS}" rx="16" fill="#26262B"/>`)
  comps.push({ input: await sharp(mono).resize(IS, IS).png().toBuffer(), left: xm, top: y })
  // themed: launcher recolours the mono alpha on a tonal plate — light + dark
  const xt = gut + pad + 5 * (IS + pad)
  const monoVis = await sharp(mono).extract({ left: (432 - visible) / 2, top: (432 - visible) / 2, width: visible, height: visible })
    .resize(IS / 2 | 0, IS / 2 | 0).png().toBuffer()
  for (let t = 0; t < 2; t++) {
    const plate = t === 0 ? '#E9C9BD' : '#C88C78'
    const fgcol = t === 0 ? [122, 43, 27] : [42, 23, 18]
    const half = IS / 2 | 0
    const tinted = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${half}" height="${half}"><rect width="${half}" height="${half}" fill="${plate}"/></svg>`
    )).composite([{
      input: await sharp(monoVis).tint({ r: fgcol[0], g: fgcol[1], b: fgcol[2] }).png().toBuffer(),
    }]).png().toBuffer()
    comps.push({ input: await masked(tinted, half, circlePath(half / 2, half / 2, half / 2)), left: xt + (t === 0 ? 0 : half + 8), top: y + IS / 4 })
  }
  await writeSheet('V-02-android.png', w, h, '#08080B', els, comps)
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED')
process.exit(failures === 0 ? 0 : 1)
