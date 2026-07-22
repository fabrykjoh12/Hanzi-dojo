import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

// The security boundary, enforced instead of documented.
//
// Two properties must hold, and both are the kind that quietly stop holding
// during a refactor:
//   1. No browser-reachable module may import a server-only TTS module. Those
//      modules use node builtins and take service credentials; pulling one into
//      the client bundle is how a key leaks.
//   2. Nothing under src/ may read process.env for a credential. Configuration
//      is passed IN, from the CLI, which is the only place allowed to read it.

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')

// Safe for the browser: pure constants and path building, no node builtins.
const CLIENT_SAFE = ['constants.js', 'storagePath.js']

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...walk(full)); continue }
    out.push(full)
  }
  return out
}

const allFiles = walk(SRC)

function relPath(file) {
  return relative(SRC, file).split('\\').join('/')
}

// Everything the browser can reach: src/*.js(x) outside src/tts, minus tests.
const clientFiles = allFiles.filter(f => {
  const rel = relPath(f)
  if (rel.indexOf('tts/') === 0) return false
  if (rel.indexOf('.test.') !== -1) return false
  return rel.endsWith('.js') || rel.endsWith('.jsx')
})

const ttsFiles = allFiles.filter(f => {
  const rel = relPath(f)
  return rel.indexOf('tts/') === 0 && rel.indexOf('.test.') === -1
})

function read(file) {
  return readFileSync(file, 'utf8')
}

// Which src/tts/* modules a file imports, by file name.
function ttsImportsOf(source) {
  const found = []
  for (const part of source.split("'")) {
    if (part.indexOf('./') !== 0 && part.indexOf('../') !== 0) continue
    const at = part.indexOf('tts/')
    if (at === -1) continue
    found.push(part.slice(at + 'tts/'.length))
  }
  return found
}

describe('client/server boundary', () => {
  it('finds the files it is supposed to be checking', () => {
    expect(clientFiles.length).toBeGreaterThan(30)
    expect(ttsFiles.length).toBeGreaterThan(10)
  })

  it('never lets browser code import a server-only TTS module', () => {
    const violations = []
    for (const file of clientFiles) {
      for (const imported of ttsImportsOf(read(file))) {
        if (CLIENT_SAFE.indexOf(imported) === -1) {
          violations.push(relPath(file) + ' imports tts/' + imported)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps node builtins out of every browser-reachable file', () => {
    const violations = []
    for (const file of clientFiles) {
      if (read(file).indexOf("'node:") !== -1) violations.push(relPath(file))
    }
    expect(violations).toEqual([])
  })

  it('keeps node builtins out of the client-safe TTS modules too', () => {
    for (const name of CLIENT_SAFE) {
      expect(read(join(SRC, 'tts', name)).indexOf("'node:")).toBe(-1)
    }
  })

  it('never reads a credential from the environment inside src/', () => {
    const violations = []
    for (const file of clientFiles.concat(ttsFiles)) {
      // import.meta.env is Vite's public build-time config and is fine; what
      // must not appear is process.env, which is where the service credentials
      // live. Configuration reaches src/ as a function argument.
      if (read(file).indexOf('process.env') !== -1) violations.push(relPath(file))
    }
    expect(violations).toEqual([])
  })

  it('never names a credential environment variable inside src/', () => {
    const secretNames = ['AZURE_SPEECH_KEY', 'SUPABASE_SERVICE_KEY', 'VAPID_PRIVATE_KEY']
    const violations = []
    for (const file of clientFiles.concat(ttsFiles)) {
      const source = read(file)
      for (const name of secretNames) {
        // config.js names the variables in its validation errors, which is the
        // whole point of such an error - it reveals no value.
        if (source.indexOf(name) !== -1 && relPath(file).indexOf('tts/config.js') === -1) {
          violations.push(relPath(file) + ' mentions ' + name)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

describe('server-only modules are marked as such', () => {
  it('warns readers at the top of contentHash.js', () => {
    expect(read(join(SRC, 'tts', 'contentHash.js')).indexOf('SERVER-ONLY')).toBeGreaterThan(-1)
  })
})
