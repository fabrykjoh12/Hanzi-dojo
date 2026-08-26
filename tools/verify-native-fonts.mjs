// Prove the NATIVE build makes no Google Fonts request (FAB-19 F4).
//
//   npm run build:native && npm run verify:native-fonts
//
// Two layers, because they answer different questions.
//
// STATIC — what is in the artifact:
//   * index.html carries no <link> to either Google font host
//   * no stylesheet in the bundle references either host
//   * every @font-face src is a local asset
//   * sw.js is absent (it is never registered in the shell, and its
//     font-caching rule names both hosts)
//
// RUNTIME — what the app actually does. This is the claim that matters, and the
// only one a store reviewer or a regulator could check: serve the built native
// bundle, load it in a real browser, and record every request it makes. A dead
// string in a chunk is not a request; a request is.
//
// The runtime pass is why this exists as a script rather than a grep. There IS
// one surviving occurrence of the Google Fonts URL in the JS: fontLoader.js's
// GOOGLE_FONTS_BASE constant, which sits behind a native guard that returns
// null before reaching it (src/fontLoader.js, and the specs that pin it). The
// honest way to show it is dead is to watch the network, not to contort the
// source so a grep comes back clean.

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import process from 'node:process'
import { hasGoogleFontRequest } from '../nativeFonts.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, '..', 'dist', 'client')
const HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const failures = []
const notes = []
function check(ok, what, detail) {
  if (ok) notes.push('  ok    ' + what)
  else failures.push('  FAIL  ' + what + (detail ? ' — ' + detail : ''))
}

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else out.push(full)
  }
  return out
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
}

async function staticChecks() {
  const html = await readFile(join(DIST, 'index.html'), 'utf8')
  check(!hasGoogleFontRequest(html), 'index.html has no Google Fonts tag')

  const files = await walk(DIST)

  const cssHits = []
  for (const f of files.filter(n => n.endsWith('.css'))) {
    const text = await readFile(f, 'utf8')
    if (HOSTS.some(h => text.includes(h))) cssHits.push(f)
  }
  check(cssHits.length === 0, 'no stylesheet references a Google font host', cssHits.join(', '))

  // Every @font-face src must be local: a relative/absolute path or a data URI.
  const remoteSrc = []
  for (const f of files.filter(n => n.endsWith('.css'))) {
    const text = await readFile(f, 'utf8')
    for (const m of text.matchAll(/src:\s*url\(([^)]+)\)/g)) {
      const url = m[1].replace(/["']/g, '').trim()
      if (/^https?:\/\//i.test(url)) remoteSrc.push(url)
    }
  }
  check(remoteSrc.length === 0, 'every @font-face src is a local asset', remoteSrc.slice(0, 3).join(', '))

  let swPresent = true
  try { await stat(join(DIST, 'sw.js')) } catch { swPresent = false }
  check(!swPresent, 'sw.js is not shipped in the native build')

  const woff2 = files.filter(n => n.endsWith('.woff2'))
  check(woff2.length > 0, 'bundled font files are present', 'found ' + woff2.length)
}

// Serve dist/ and load it in Chromium, recording every request the page makes.
async function runtimeCheck() {
  let chromium
  try { ({ chromium } = await import('playwright')) } catch {
    notes.push('  skip  runtime request check (playwright not importable)')
    return
  }

  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0])
    let file = join(DIST, path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    } catch {
      file = join(DIST, 'index.html')   // SPA fallback, same as vercel.json
    }
    try {
      const body = await readFile(file)
      const ext = file.slice(file.lastIndexOf('.'))
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404); res.end('not found')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  // The sandbox ships Chromium at a fixed path that may not match the version
  // this Playwright build expects; prefer it when present, else let Playwright
  // resolve its own. CI has a matching download and takes the else branch.
  const CANDIDATES = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ]
  let executablePath
  for (const candidate of CANDIDATES) {
    try { await stat(candidate); executablePath = candidate; break } catch { /* try next */ }
  }
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  const requested = []
  try {
    const page = await browser.newPage()
    page.on('request', r => requested.push(r.url()))
    // Nothing outside our own origin should resolve; fail loudly rather than
    // letting a real CDN request quietly succeed and look like a pass.
    await page.route('**', route => {
      const url = route.request().url()
      if (url.startsWith('http://127.0.0.1:' + port)) return route.continue()
      return route.abort()
    })
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(1500)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }

  const offending = requested.filter(u => HOSTS.some(h => u.includes(h)))
  check(offending.length === 0,
    'cold launch made no request to a Google font host',
    offending.slice(0, 5).join(', '))
  check(requested.length > 0, 'the page actually loaded and issued requests',
    'saw ' + requested.length)
  notes.push('  info  ' + requested.length + ' requests observed, ' +
    requested.filter(u => u.endsWith('.woff2')).length + ' of them local woff2')
}

async function main() {
  try {
    await stat(DIST)
  } catch {
    process.stderr.write('verify-native-fonts: dist/client is missing — run `npm run build:native` first.\n')
    process.exit(1)
  }

  await staticChecks()
  await runtimeCheck()

  process.stdout.write('verify-native-fonts:\n' + notes.join('\n') + '\n')
  if (failures.length) {
    process.stdout.write(failures.join('\n') + '\n')
    process.stderr.write('\nverify-native-fonts: ' + failures.length + ' check(s) failed.\n')
    process.exit(1)
  }
  process.stdout.write('\nverify-native-fonts: clean — the native build never contacts Google Fonts.\n')
}

main().catch(err => { process.stderr.write(String(err && err.stack || err) + '\n'); process.exit(1) })
