import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guards a macOS-only failure that every Linux check misses.
//
// src/ is flat and the convention is Foo.jsx for a component, fooThing.js for
// its logic — which puts pairs like FillBlank.jsx and fillBlank.js in one
// directory. On Linux those are two names. On macOS, where the filesystem is
// case-insensitive, they are one, and the resolver tries .js before .jsx.
//
// So the two directions are not equally safe:
//
//   import './fillBlank'   → fillBlank.js on both platforms. Fine.
//   import './FillBlank'   → FillBlank.jsx on Linux, fillBlank.js on macOS.
//
// The second is the bug, and it has happened twice. Loudly: the iOS build died
// on `"default" is not exported by "src/CharacterTaste.js"` while lint, 3,175
// unit tests and Playwright were green on ubuntu. Silently: `lazy(() =>
// import('./FillBlank'))` is dynamic, so nothing resolved it at build time —
// it shipped, and would only have failed when someone opened the fill-blank
// drill inside the app.
//
// Writing the extension (./FillBlank.jsx) or naming the pair distinctly
// (tasteSteps.js beside CharacterTaste.jsx) both fix it.

const SRC = fileURLToPath(new URL('.', import.meta.url))
const SELF = 'moduleNames.test.js'

const sources = readdirSync(SRC).filter(f => /\.(js|jsx)$/.test(f))
const exists = new Set(sources)
const lowerToFiles = new Map()
for (const f of sources) {
  const key = f.toLowerCase()
  if (!lowerToFiles.has(key)) lowerToFiles.set(key, [])
  lowerToFiles.get(key).push(f)
}

// What an extensionless `./name` actually resolves to, per platform.
function resolvesDifferently(name) {
  // An exact-case .js wins everywhere — no ambiguity to have.
  if (exists.has(name + '.js')) return null
  if (!exists.has(name + '.jsx')) return null
  // Linux takes the .jsx. macOS tries .js first and will match any casing.
  const macTarget = (lowerToFiles.get((name + '.js').toLowerCase()) || [])[0]
  return macTarget ? { linux: name + '.jsx', mac: macTarget } : null
}

describe('module names vs a case-insensitive filesystem', () => {
  it('never leaves an extensionless import to resolve differently on macOS', () => {
    const offenders = []
    const importRe = /(?:from|import)\s*\(?\s*['"]\.\/([A-Za-z0-9_-]+)['"]/g

    for (const file of sources) {
      if (file === SELF) continue   // its own prose names the bad forms
      for (const match of readFileSync(join(SRC, file), 'utf8').matchAll(importRe)) {
        const split = resolvesDifferently(match[1])
        if (split) {
          offenders.push(
            file + ": './" + match[1] + "' is " + split.linux +
            ' on Linux but ' + split.mac + ' on macOS — write the extension or rename the pair'
          )
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('still has pairs to watch, so the check above is not passing for free', () => {
    // Grouped by stem, not by filename: FillBlank.jsx and fillBlank.js differ
    // in extension as well as case, and it is the shared stem that makes them
    // one name to a Mac.
    const byStem = new Map()
    for (const f of sources) {
      const stem = f.replace(/\.(js|jsx)$/, '').toLowerCase()
      byStem.set(stem, (byStem.get(stem) || 0) + 1)
    }
    const collisions = [...byStem.values()].filter(n => n > 1)
    expect(collisions.length).toBeGreaterThan(0)
  })

  it('recognises the two forms that actually broke', () => {
    // FillBlank.jsx + fillBlank.js is a real pair in this directory, so the
    // dangerous direction must be detected and the safe one must not be.
    expect(resolvesDifferently('FillBlank')).toEqual({ linux: 'FillBlank.jsx', mac: 'fillBlank.js' })
    expect(resolvesDifferently('fillBlank')).toBe(null)
  })
})
