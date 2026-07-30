// Contact sheet + automated art gate for a manhua episode.
//
// WHY THIS EXISTS: generating an episode's panels is fast (they all render in
// parallel); LOOKING at them was the slow part — one image at a time, then a
// second pass for whatever failed. Episode 2 needed 14 of 19 panels regenerated,
// and finding that out cost more wall-clock than making them.
//
// This does two things in one run:
//
//   1. Screens every panel MECHANICALLY for the two failure modes that don't
//      need judgement — a baked-in panel frame / white margin, and a colour blob
//      (a red seal stamp) in art that is supposed to be monochrome plus one
//      restrained accent. Those two accounted for most of episode 2's rework.
//   2. Renders every panel into ONE contact sheet PNG, labelled, so the third
//      failure mode — invented hanzi, an off-model character, a bubble landing
//      on a face — can be judged in a single look instead of nineteen.
//
// It runs the panels through Chromium (already installed for Playwright) because
// the sandbox has no image library; a <canvas> is the pixel access we have.
//
//   node tools/manhua-contact-sheet.mjs data/manhua/inkbound-hsk2-ep02.json
//
// Exit code is 1 if the mechanical screen flags anything, so it can gate a batch
// before any of it reaches a commit. The contact sheet is written regardless —
// a flagged run is exactly when you want to look.
//
// HOW GOOD IS THE MECHANICAL SCREEN? Measured against episode 2's seven
// known-bad panels (kept in git history at 020db7d) and the nineteen that
// shipped:
//
//   border:  catches the unmistakable case (a full drawn rectangle with a white
//            margin) and misses two subtler ones, where the border only really
//            reads on two sides. One false positive on the shipped set —
//            panel-02, whose left and right edges are both dark architecture.
//            So: 1 of 3, with 1 of 19 crying wolf. Useful, not a gate you can
//            trust on its own.
//   colour:  catches everything, because it flags any colour at all and lets a
//            human separate a ribbon from a seal. Deliberately over-eager.
//
// The reliable win here is NOT the screen — it is the contact sheet. Judging
// nineteen panels went from nineteen separate looks to one. Do not let the
// "no flags" line talk you out of looking at the sheet; invented hanzi, an
// off-model character and a bubble sitting on a face all pass the screen
// silently, and all three shipped in episode 2's first pass.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const episodePath = process.argv[2]
if (!episodePath) {
  console.error('usage: node tools/manhua-contact-sheet.mjs <episode.json>')
  process.exit(2)
}

const ep = JSON.parse(readFileSync(resolve(ROOT, episodePath), 'utf8'))
const base = (ep.panels && ep.panels.meta && ep.panels.meta.art_base) || ''
const panels = ((ep.panels && ep.panels.panels) || []).filter(p => p.art)

const items = panels.map(p => {
  const file = join(ROOT, 'public', base, p.art)
  return {
    id: p.id,
    art: p.art,
    ratio: p.ratio || '',
    exists: existsSync(file),
    url: pathToFileURL(file).href,
    // Where the app will draw text, so the sheet can show it.
    bubbles: (p.bubbles || []).map(b => ({
      top: typeof b.top === 'number' ? b.top : 8,
      width: b.width || 68,
      side: b.side || 'right',
      kind: b.kind || 'speech',
    })),
  }
})

const missing = items.filter(i => !i.exists)
if (missing.length) {
  console.error('missing art: ' + missing.map(m => m.art).join(', '))
  process.exit(2)
}

// ── The page: every panel as a labelled card, with the bubble boxes overlaid ──
//
// The bubble rectangles are drawn on purpose. A panel can be flawless and still
// be wrong for this episode if the line that goes on it covers a face, and that
// is invisible when you look at the art alone.
function buildHtml(list) {
  const cards = list.map((i, n) => {
    const boxes = i.bubbles.map(b => {
      const left = b.side === 'left' ? 4 : b.side === 'center' ? (100 - b.width) / 2 : 100 - b.width - 4
      return '<div class="bb" style="top:' + b.top + '%;left:' + left + '%;width:' + b.width + '%"></div>'
    }).join('')
    return '<figure><div class="wrap"><img src="' + i.url + '">' + boxes + '</div>'
      + '<figcaption>' + (n + 1) + '. ' + i.id + ' &middot; ' + i.art + ' &middot; ' + i.ratio + '</figcaption></figure>'
  }).join('')
  return '<!doctype html><meta charset="utf-8"><style>'
    + 'body{margin:0;background:#f4f1ec;font:13px/1.3 ui-monospace,monospace;color:#171411}'
    + '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:14px}'
    + 'figure{margin:0}.wrap{position:relative;background:#fff;border:1px solid #171411}'
    + 'img{display:block;width:100%;height:auto}'
    + '.bb{position:absolute;height:34px;border:2px dashed #B83A24;background:rgba(184,58,36,.12);border-radius:14px}'
    + 'figcaption{padding:4px 2px;font-size:11px}'
    + '</style><div class="grid">' + cards + '</div>'
}

// ── The mechanical screen ────────────────────────────────────────────────────
//
// Runs in the page so it can read pixels off a canvas.
//
// FRAME: look for the KEYLINE, not for a clean margin. The first attempt tested
// whether the outer rows were a uniform colour, and it failed against every one
// of the seven known-bad panels — the model draws ink splatter across the white
// margin, which is exactly what breaks uniformity. What a printed border always
// is instead is a single nearly-solid dark line spanning most of the width or
// height, sitting a few percent in from the edge, with lighter rows either side.
// That is what this looks for, and it is checked against the bad panels below.
//
// COLOUR: the art direction is greyscale plus a restrained cinnabar accent, so a
// red seal is a small saturated blob — but so is 小雨's hair ribbon, and no
// threshold separates them by area alone. This therefore does NOT try to: it
// reports the saturated share for every panel and flags anything with colour at
// all, so a human confirms it is the ribbon. A false positive costs one glance;
// a missed seal ships invented characters.
async function screenPanel(page, url) {
  return page.evaluate(async src => {
    const img = new Image()
    img.src = src
    await img.decode()
    const W = 400
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W))
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, W, H)
    const d = ctx.getImageData(0, 0, W, H).data
    const lum = (x, y) => {
      const o = (y * W + x) * 4
      return 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]
    }
    // Share of a line that is dark. A drawn keyline runs ~solid across the panel.
    const darkShareRow = y => {
      let n = 0
      for (let x = 0; x < W; x += 1) if (lum(x, y) < 110) n += 1
      return n / W
    }
    const darkShareCol = x => {
      let n = 0
      for (let y = 0; y < H; y += 1) if (lum(x, y) < 110) n += 1
      return n / H
    }
    // A border line is dark nearly all the way across AND clearly darker than the
    // band a little further in — that second half is what stops a genuinely dark
    // photograph (a night panel, a silhouette) from reading as a frame.
    // Returns [nearStart, nearEnd] — whether a border line was found at each end.
    // BOTH ends matter: a frame is a rectangle, while a doorframe, a pillar or a
    // hall wall gives exactly one. Requiring both is what took this from ten
    // false positives on shipped art down to zero.
    function findLines(shareAt, span) {
      const scan = Math.max(3, Math.round(span * 0.12))
      const hit = [false, false]
      for (const side of [0, 1]) {
        for (let k = 1; k < scan; k += 1) {
          const i = side === 0 ? k : span - 1 - k
          if (shareAt(i) < 0.9) continue
          const step = Math.round(span * 0.06)
          const inward = side === 0 ? Math.min(span - 1, i + step) : Math.max(0, i - step)
          if (shareAt(i) - shareAt(inward) > 0.35) { hit[side] = true; break }
        }
      }
      return hit
    }
    const h = findLines(darkShareRow, H)
    const v = findLines(darkShareCol, W)
    const hLine = h[0] && h[1]
    const vLine = v[0] && v[1]
    let saturated = 0
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 55) saturated += 1
    }
    return {
      hLine: Boolean(hLine),
      vLine: Boolean(vLine),
      saturatedPct: (saturated / (W * H)) * 100,
    }
  }, url)
}

const outDir = join(ROOT, 'tools', '.contact-sheets')
mkdirSync(outDir, { recursive: true })
const slug = episodePath.split('/').pop().replace('.json', '')
const sheetPath = join(outDir, slug + '.png')

// The sandbox ships one Chromium build under PLAYWRIGHT_BROWSERS_PATH and it is
// not always the revision this @playwright/test pins, so point at the binary
// that is actually there rather than letting the launcher ask for a download it
// has no network to do. Falls back to the managed browser when it is a match.
function chromiumPath() {
  const roots = ['/opt/pw-browsers']
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const dir of readdirSync(root)) {
      const exe = join(root, dir, 'chrome-linux', 'chrome')
      if (existsSync(exe)) return exe
    }
  }
  return undefined
}

// --allow-file-access-from-files: the panels are read back off a <canvas>, and a
// file:// page may not touch a file:// image's pixels without it. The page is a
// local scratch file we just wrote, so there is nothing here to be careful about.
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--allow-file-access-from-files'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })

// Load the sheet FIRST, then screen off it. An image can only be read back
// through a canvas from a page with a compatible origin, and about:blank is not
// one — the panels decode but getImageData throws.
const htmlPath = join(outDir, slug + '.html')
writeFileSync(htmlPath, buildHtml(items))
await page.goto(pathToFileURL(htmlPath).href)
await page.waitForLoadState('networkidle')

const flags = []
for (const i of items) {
  const r = await screenPanel(page, i.url)
  if (r.hLine || r.vLine) {
    flags.push(i.art + ': a drawn border line was found near the '
      + [r.hLine ? 'top/bottom' : null, r.vLine ? 'left/right' : null].filter(Boolean).join(' and ')
      + ' edge. The reader draws its own keyline and gutter; a baked one doubles up, '
      + 'and a bubble at a low `top` lands on the margin instead of the art.')
  }
  if (r.saturatedPct > 0.02) {
    flags.push(i.art + ': ' + r.saturatedPct.toFixed(3) + '% coloured pixels. Confirm on the '
      + "sheet that this is 小雨's ribbon and not a red seal stamp — a seal is invented "
      + 'characters in miniature.')
  }
}

await page.screenshot({ path: sheetPath, fullPage: true })
await browser.close()

console.log('panels: ' + items.length)
console.log('contact sheet: ' + sheetPath)
if (flags.length) {
  console.log('\nFLAGGED (' + flags.length + '):')
  for (const f of flags) console.log('  - ' + f)
  console.log('\nThese are the mechanical checks only. Invented hanzi, an off-model')
  console.log('character and a bubble over a face still need the contact sheet.')
  process.exit(1)
}
console.log('\nNo framing or colour flags. Look at the sheet for the rest.')
