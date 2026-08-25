// Download the app's web fonts from Google Fonts into the repo, and generate the
// local @font-face stylesheet the NATIVE build uses instead of the CDN.
//
// WHY THIS EXISTS (FAB-19 F4). index.html carries a Google Fonts <link>, and the
// Capacitor apps ship that same index.html — so every cold launch of the iOS and
// Android app contacted fonts.googleapis.com and fonts.gstatic.com, handing the
// device's IP and user-agent to Google before the learner had done anything. The
// privacy policy described Google Fonts as "font delivery on the web", which was
// simply not true of the apps.
//
// It was also a correctness bug: an offline-first app whose Chinese typeface
// arrives over the network renders no Chinese at all on a cold launch on a
// plane. Bundling fixes the privacy problem and that one together.
//
// The web build is deliberately unchanged and still uses the CDN — see
// nativeFonts.mjs for the split.
//
// RE-RUN THIS when the font list in index.html changes:
//
//   node fetch-webfonts.mjs
//
// It is idempotent: existing files with the right size are left alone, so a
// re-run after adding one weight downloads only what is missing.
//
// LICENSING. All three families are SIL Open Font License 1.1, which permits
// redistribution as long as the licence travels with the binaries. Before this,
// NOTICE.md could say "no font binary is redistributed by this project" — that
// is no longer true, so this script also writes the OFL text next to the fonts
// and NOTICE.md records the change.

import { mkdir, writeFile, stat, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, 'src', 'assets', 'webfonts')
const CSS_OUT = join(HERE, 'src', 'webfonts.css')

// Exactly the families and weights index.html requests. Keep in sync by hand —
// a mismatch is caught by nativeFonts.test.mjs, which parses index.html.
const GOOGLE_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700' +
  '&family=Inter:wght@300;400;500;600' +
  '&family=Poppins:wght@500;600;700' +
  '&display=swap'

// Google serves different formats by user-agent. A modern browser UA gets woff2
// with unicode-range subsetting, which is what we want: 400+ small files, of
// which a device loads only the ranges it actually paints.
const MODERN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Safari/605.1.15'

// Each family's own OFL file, from google/fonts — the canonical source, and the
// one that carries the family's specific copyright line rather than a generic
// copy of the licence body.
const OFL_SOURCES = {
  'Noto Sans SC': 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt',
  'Inter': 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt',
  'Poppins': 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/OFL.txt',
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Turn a gstatic URL into a stable local filename.
//
// Keyed on the URL, NOT on family+weight+index, because Google serves these as
// VARIABLE fonts: one woff2 per unicode-range covers every weight, so the CSS
// lists four @font-face rules (300/400/500/700) that all point at the same
// file. Naming per weight wrote the same bytes four times — 441 files and
// 18.2 MB for 117 distinct fonts, ~4.9 MB of actual payload. Vite deduped it
// away in the bundle, but the repo carried the duplicates.
export function localName(family, url) {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 10)
  return slug(family) + '-' + hash + '.woff2'
}

async function fetchText(url, headers) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error('GET ' + url + ' -> ' + res.status)
  return res.text()
}

async function fetchBinary(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('GET ' + url + ' -> ' + res.status)
  return Buffer.from(await res.arrayBuffer())
}

// Parse the @font-face blocks out of Google's stylesheet. Each carries a family,
// a weight, a style, a unicode-range and one woff2 URL.
export function parseFontFaces(css) {
  const faces = []
  const blocks = css.split('@font-face').slice(1)
  for (const raw of blocks) {
    const body = raw.slice(raw.indexOf('{') + 1, raw.indexOf('}'))
    const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1]
    const weight = (body.match(/font-weight:\s*([^;]+);/) || [])[1]
    const style = (body.match(/font-style:\s*([^;]+);/) || [])[1]
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1]
    const url = (body.match(/url\((https:\/\/[^)]+)\)/) || [])[1]
    if (!family || !url) continue
    faces.push({
      family,
      weight: (weight || '400').trim(),
      style: (style || 'normal').trim(),
      range: range ? range.trim() : null,
      url,
    })
  }
  return faces
}

// The local stylesheet: identical rules, local URLs. Kept byte-stable across
// runs (sorted, no timestamp) so re-running produces no spurious diff.
export function buildLocalCss(faces) {
  const header = [
    '/* GENERATED by fetch-webfonts.mjs — do not edit by hand.',
    ' *',
    ' * The bundled web fonts for the NATIVE build (FAB-19 F4). Imported only when',
    ' * __DOJO_NATIVE_BUILD__ is true (src/main.jsx), so the web build still uses',
    ' * the Google Fonts CDN and does not carry these bytes.',
    ' *',
    ' * Rules mirror what Google Fonts serves, unicode-range included, so a device',
    ' * still only decodes the ranges it paints. Fonts are SIL OFL 1.1; each',
    ' * family ships its own licence beside them as OFL-<family>.txt.',
    ' */',
    '',
  ].join('\n')

  const rules = faces.map(f => {
    const lines = [
      '@font-face {',
      "  font-family: '" + f.family + "';",
      '  font-style: ' + f.style + ';',
      '  font-weight: ' + f.weight + ';',
      '  font-display: swap;',
      "  src: url('./assets/webfonts/" + f.local + "') format('woff2');",
    ]
    if (f.range) lines.push('  unicode-range: ' + f.range + ';')
    lines.push('}')
    return lines.join('\n')
  })

  return header + rules.join('\n\n') + '\n'
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  process.stdout.write('Fetching the Google Fonts stylesheet…\n')
  const css = await fetchText(GOOGLE_CSS_URL, { 'User-Agent': MODERN_UA })
  const faces = parseFontFaces(css)
  if (faces.length === 0) throw new Error('No @font-face blocks parsed — did the API change?')

  // One local file per distinct source URL; every rule that shares that URL
  // shares the file.
  for (const f of faces) f.local = localName(f.family, f.url)
  const uniqueByUrl = new Map()
  for (const f of faces) if (!uniqueByUrl.has(f.url)) uniqueByUrl.set(f.url, f)

  const byFamily = {}
  for (const f of faces) byFamily[f.family] = (byFamily[f.family] || 0) + 1
  for (const [fam, n] of Object.entries(byFamily)) {
    process.stdout.write('  ' + fam + ': ' + n + ' faces\n')
  }

  let downloaded = 0
  let skipped = 0
  let bytes = 0
  const CONCURRENCY = 12
  const queue = [...uniqueByUrl.values()]

  async function worker() {
    for (;;) {
      const face = queue.shift()
      if (!face) return
      const dest = join(OUT_DIR, face.local)
      try {
        const st = await stat(dest)
        if (st.size > 0) { skipped += 1; bytes += st.size; continue }
      } catch { /* not there yet */ }
      const buf = await fetchBinary(face.url)
      await writeFile(dest, buf)
      downloaded += 1
      bytes += buf.length
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  await writeFile(CSS_OUT, buildLocalCss(faces))

  // The licence has to travel with the binaries — one file per family, each
  // carrying that family's own copyright line.
  for (const [family, url] of Object.entries(OFL_SOURCES)) {
    const dest = join(OUT_DIR, 'OFL-' + slug(family) + '.txt')
    try {
      await stat(dest)
    } catch {
      await writeFile(dest, await fetchText(url, { 'User-Agent': MODERN_UA }))
    }
  }

  // Sweep any file no longer referenced, so re-running after a font change
  // never leaves an orphan behind.
  const wanted = new Set([...uniqueByUrl.values()].map(f => f.local))
  let removed = 0
  for (const name of await readdir(OUT_DIR)) {
    if (name.endsWith('.woff2') && !wanted.has(name)) {
      await rm(join(OUT_DIR, name), { force: true })
      removed += 1
    }
  }

  const files = (await readdir(OUT_DIR)).filter(n => n.endsWith('.woff2'))
  process.stdout.write(
    '\n' + faces.length + ' faces resolve to ' + uniqueByUrl.size + ' distinct fonts ' +
    '(Google serves these as variable fonts, one file per unicode-range)\n' +
    downloaded + ' downloaded, ' + skipped + ' already present, ' + removed + ' orphans removed\n' +
    files.length + ' woff2 files, ' + (bytes / 1048576).toFixed(2) + ' MB\n' +
    'Wrote ' + CSS_OUT + '\n',
  )
}

// Only run when invoked directly, so the pure helpers above stay importable
// from the spec.
if (process.argv[1] && process.argv[1].endsWith('fetch-webfonts.mjs')) {
  main().catch(err => { process.stderr.write(String(err && err.stack || err) + '\n'); process.exit(1) })
}

export { GOOGLE_CSS_URL }
