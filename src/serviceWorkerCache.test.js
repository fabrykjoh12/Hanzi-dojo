import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// public/sw.js is served verbatim to the browser — no bundler, no imports. So it
// is loaded as text here and its predicate evaluated, rather than duplicating
// the rule in the test (which would let the two drift and prove nothing).
const SW = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

function loadIsShellHtml() {
  const start = SW.indexOf('function isShellHtml')
  expect(start, 'isShellHtml missing from public/sw.js').toBeGreaterThan(-1)
  const end = SW.indexOf('\n}', start) + 2
  return new Function(SW.slice(start, end) + '; return isShellHtml')()
}

const resp = (contentType) => ({ headers: { get: () => contentType } })

describe('service worker: never cache the SPA shell under an asset URL', () => {
  const isShellHtml = loadIsShellHtml()

  it('recognises the shell', () => {
    // vercel.json rewrites every unmatched path to /index.html, so an asset that
    // has not shipped yet answers 200 with this. Caching it under the asset's
    // URL is what left the manga panels blank long after the art deployed.
    expect(isShellHtml(resp('text/html; charset=utf-8'))).toBe(true)
    expect(isShellHtml(resp('text/html'))).toBe(true)
  })

  it('leaves real assets cacheable', () => {
    for (const type of ['image/webp', 'image/png', 'text/css', 'application/javascript', 'audio/mpeg', 'font/woff2']) {
      expect(isShellHtml(resp(type)), type).toBe(false)
    }
  })

  it('does not choke on a response with no content-type', () => {
    expect(isShellHtml(resp(null))).toBe(false)
    expect(isShellHtml({ headers: null })).toBe(false)
    expect(isShellHtml(null)).toBe(false)
  })

  it('is actually wired into cacheFirst, both directions', () => {
    // The predicate is worthless if cacheFirst does not consult it — on the way
    // in (do not store) and on the way out (drop a poisoned hit).
    const cacheFirst = SW.slice(SW.indexOf('function cacheFirst'), SW.indexOf('self.addEventListener(\'fetch\''))
    expect(cacheFirst).toContain('isShellHtml(hit)')
    expect(cacheFirst).toContain('!isShellHtml(resp)')
  })

  it('bumps the cache version, so already-poisoned caches are dropped', () => {
    // activate() deletes every cache not in KEEP, so a version bump is what
    // heals clients that cached the shell under an asset URL.
    const version = SW.slice(SW.indexOf("var VERSION = '") + 15)
    expect(version.slice(0, version.indexOf("'"))).not.toBe('v6')
  })
})
