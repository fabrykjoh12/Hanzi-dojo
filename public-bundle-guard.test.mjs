import { describe, it, expect } from 'vitest'
import { findViolations, RULES } from './tools/verify-public-bundle.mjs'

// The rules that keep internal tooling out of the store bundle. The build-side
// half (Vite's __DOJO_INTERNAL_BUILD__ define dropping the DojoHQ import) is
// asserted by CI running the verifier against a real `build:public`; this pins
// the rules themselves, including the two things that must NOT trip them.

const clean = [
  { path: 'index.html', text: '<div id="root"></div>' },
  { path: 'assets/main-abc123.js', text: 'const support = "support@hanzi-dojo.com"' },
  { path: 'assets/vendor-supabase-def456.js', text: 'const local = "http://127.0.0.1:54321"' },
  { path: 'assets/logo-xyz.woff2', text: null },
]

describe('public bundle guard', () => {
  it('passes a bundle with nothing internal in it', () => {
    expect(findViolations(clean)).toEqual([])
  })

  it('catches the DojoHQ chunk', () => {
    const found = findViolations([...clean, { path: 'assets/DojoHQ-DC7iEGyg.js', text: 'hq' }])
    expect(found.map(v => v.rule)).toContain('dojohq-chunk')
  })

  it('catches the standalone HQ entry point', () => {
    expect(findViolations([{ path: 'hq.html', text: '' }]).map(v => v.rule)).toContain('dojohq-chunk')
  })

  it('catches the copied cloud bridge script', () => {
    const found = findViolations([{ path: 'dojo-cloud-bridge.mjs', text: 'x' }])
    expect(found.map(v => v.rule)).toContain('cloud-bridge-script')
  })

  it('catches the localhost Claude bridge URL wherever it is inlined', () => {
    const found = findViolations([{ path: 'assets/main-abc123.js', text: 'fetch("http://127.0.0.1:43127/x")' }])
    expect(found.map(v => v.rule)).toContain('claude-bridge-url')
  })

  it('does not fire on the loopback address the Supabase SDK carries', () => {
    expect(findViolations([clean[2]])).toEqual([])
  })

  it('catches a personal identifier but allows the published support address', () => {
    expect(findViolations([clean[1]])).toEqual([])
    const found = findViolations([{ path: 'assets/main-abc123.js', text: 'fabrykjoh12@gmail.com' }])
    expect(found.map(v => v.rule)).toContain('personal-identifier')
  })

  it('reports every rule it breaks, not just the first', () => {
    const found = findViolations([{ path: 'assets/DojoHQ-1.js', text: 'http://127.0.0.1:43127 fabrykjoh' }])
    expect(new Set(found.map(v => v.rule)).size).toBe(3)
    expect(RULES.length).toBe(4)
  })
})
