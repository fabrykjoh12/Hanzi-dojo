// Pull generated manhua panel art into the repo.
//
// Why a script and a workflow rather than a download in the session: panel art
// is generated through the interactive Higgsfield MCP, which returns CDN URLs,
// and the agent sandbox has no route to that CDN. A GitHub runner does. So the
// session writes a manifest of (file ← url) pairs, this script fetches them,
// and .github/workflows/manhua-art.yml commits the result to the branch — the
// same split generate-story-images.mjs already uses for story covers, with one
// difference: episode art is COMMITTED rather than uploaded to the `audio`
// bucket.
//
// Committed, because manhua art is not interchangeable content the way a cover
// is. A panel is part of the episode's layout — it is chosen for its aspect
// ratio and for the empty corner a speech bubble sits in — so it belongs to the
// same review, the same diff and the same rollback as the panel metadata that
// places bubbles over it. It also means the reader has no runtime dependency on
// a storage bucket for its most visible asset.
//
// Manifest shape (data/manhua/<episode>.art.json):
//   { "dir": "public/stories/inkbound/hsk1/ep01",
//     "assets": [ { "file": "panel-01-arrival.webp", "url": "https://…" } ] }
//
// Run with:
//   node fetch-manhua-art.mjs data/manhua/inkbound-hsk1-ep01.art.json
//   node fetch-manhua-art.mjs <manifest> --force    (re-fetch files already present)

import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const manifestPath = args.find(a => !a.startsWith('--'))
const force = args.includes('--force')

if (!manifestPath) {
  console.error('Usage: node fetch-manhua-art.mjs <manifest.json> [--force]')
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (err) {
  console.error('Cannot read ' + manifestPath + ': ' + err.message)
  process.exit(1)
}

const dir = manifest.dir
const assets = Array.isArray(manifest.assets) ? manifest.assets : []
if (!dir || assets.length === 0) {
  console.error('Manifest needs a "dir" and a non-empty "assets" array.')
  process.exit(1)
}

mkdirSync(dir, { recursive: true })

let fetched = 0
let skipped = 0
let failed = 0

for (const asset of assets) {
  const { file, url } = asset
  if (!file || !url) { console.error('  ✗ entry missing file or url: ' + JSON.stringify(asset)); failed += 1; continue }
  const target = join(dir, file)
  if (existsSync(target) && !force) {
    console.log('  · ' + file + ' (already present, ' + Math.round(statSync(target).size / 1024) + ' KB)')
    skipped += 1
    continue
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buf = Buffer.from(await res.arrayBuffer())
    // A CDN that answers an expired link with an HTML error page would otherwise
    // be committed as a "webp" nobody can open until it reaches a browser — and
    // an error page can easily be bigger than any size threshold, so check the
    // container's own signature: 'RIFF' at 0, 'WEBP' at 8.
    if (buf.length < 12
      || buf.subarray(0, 4).toString('ascii') !== 'RIFF'
      || buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
      throw new Error('not a WebP container (' + buf.length + ' bytes) — expired link, or an error page?')
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, buf)
    console.log('  ✓ ' + file + ' (' + Math.round(buf.length / 1024) + ' KB)')
    fetched += 1
  } catch (err) {
    console.error('  ✗ ' + file + ': ' + err.message)
    failed += 1
  }
}

console.log('\n' + fetched + ' fetched, ' + skipped + ' already present, ' + failed + ' failed.')
process.exit(failed > 0 ? 1 : 0)
