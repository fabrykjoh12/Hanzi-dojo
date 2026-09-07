import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// The pipeline's structural promises. These are the ones that cannot be tested
// by calling a function: what a script is ABLE to do, and whether it still
// matches the workflows on main that invoke it.
//
// Both matter because the safety argument for this work is capability-based,
// not intention-based: "the generator does not publish" is only worth anything
// if the generator could not publish if it tried.

const RUNNER = 'generate-targeted-stories.mjs'
const DUMPER = 'dump-story-corpus.mjs'
const src = (f) => readFileSync(f, 'utf8')
// Comments explain the rules; they must not be able to satisfy them.
const code = (f) => src(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

describe('the generator cannot reach production', () => {
  it('has no Supabase client, import or key', () => {
    const c = code(RUNNER)
    for (const forbidden of ['supabase', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'createClient']) {
      expect(c.includes(forbidden), RUNNER + ' must not reference ' + forbidden).toBe(false)
    }
  })

  it('performs no write that could reach a database', () => {
    const c = code(RUNNER)
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(c.includes(verb), RUNNER + ' must not call ' + verb).toBe(false)
    }
  })

  it('writes only under data/story-candidates', () => {
    const c = code(RUNNER)
    expect(c).toContain("const OUT_ROOT = 'data/story-candidates'")
    // Every write goes through a path built from outDir.
    const writes = c.match(/writeFileSync\([^)]*/g) || []
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) {
      expect(w.includes('outDir'), 'writeFileSync outside outDir: ' + w).toBe(true)
    }
  })

  it('takes its corpus from a file, not a live query', () => {
    expect(code(RUNNER)).toContain('readFileSync(input')
  })
})

describe('the corpus dump is read-only', () => {
  it('selects and nothing else', () => {
    const c = code(DUMPER)
    expect(c).toContain('.select(')
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(c.includes(verb), DUMPER + ' must not call ' + verb).toBe(false)
    }
  })

  it('is the only script in the pipeline that opens a client', () => {
    expect(code(DUMPER)).toContain('createClient')
    for (const f of [RUNNER, 'storyTargetManifest.mjs', 'storyCandidateValidation.mjs', 'storyBatchState.mjs']) {
      expect(code(f).includes('createClient'), f + ' must not open a database client').toBe(false)
    }
  })
})

describe('the pure modules stay pure', () => {
  const pure = ['storyTargetManifest.mjs', 'storyCandidateValidation.mjs', 'storyBatchState.mjs']
  it('touch no filesystem, network or clock', () => {
    for (const f of pure) {
      const c = code(f)
      for (const forbidden of ['node:fs', 'fetch(', 'Date.now(', 'new Date(']) {
        expect(c.includes(forbidden), f + ' must not use ' + forbidden).toBe(false)
      }
    }
  })
})

describe('there is one definition of a known word, and it is the Reader', () => {
  it('the validator reads the canonical engine and the merged publishability rule', () => {
    const c = code('storyCandidateValidation.mjs')
    expect(c).toContain("from './src/storyReading.js'")
    expect(c).toContain("from './storyVocabAudit.mjs'")
    expect(c).toContain('calculateStoryReadability')
    expect(c).toContain('publishable(')
  })

  it('does not reimplement segmentation or matching', () => {
    const c = code('storyCandidateValidation.mjs')
    for (const own of ['function segmentLine', 'function buildVocabMatcher', 'greedy', 'maxWordLen']) {
      expect(c.includes(own), 'validation must not carry its own matcher (' + own + ')').toBe(false)
    }
  })
})

// The workflows are already on main and invoke this script with a fixed CLI.
// If a flag is renamed here, the pilot breaks in CI with the secrets attached
// and no local way to reproduce it — so the contract is pinned from the
// workflow files themselves rather than from a copy of them.
describe('the CLI still matches the workflows that call it', () => {
  const workflows = ['.github/workflows/story-pilot.yml', '.github/workflows/llm-bench.yml']
    .filter(existsSync)

  it('at least one workflow invokes the generator', () => {
    expect(workflows.length).toBeGreaterThan(0)
    expect(workflows.some(f => src(f).includes('node generate-targeted-stories.mjs'))).toBe(true)
  })

  it('handles every flag the workflows pass', () => {
    const runner = src(RUNNER)
    const seen = new Set()
    for (const f of workflows) {
      const text = src(f)
      // The invocation is a line-continued shell command, so take the flags
      // from the block that follows the script name up to the next statement.
      for (const m of text.matchAll(/generate-targeted-stories\.mjs[\s\S]{0,400}?(?=\n\s*(?:echo|node|fi|\}|$))/g)) {
        for (const f2 of m[0].matchAll(/--([a-z][a-z-]*)/g)) seen.add(f2[1])
      }
    }
    expect(seen.size).toBeGreaterThan(3)
    for (const flag of seen) {
      expect(runner.includes("arg('" + flag + "'") || runner.includes("'--" + flag + "'"),
        RUNNER + ' does not handle --' + flag + ', which a workflow passes').toBe(true)
    }
  })

  it('writes where the workflows look for the results', () => {
    const runner = code(RUNNER)
    expect(runner).toContain('data/story-candidates')
    expect(runner).toContain('batch-report.json')
    for (const f of workflows) {
      if (!src(f).includes('generate-targeted-stories.mjs')) continue
      expect(src(f)).toContain('data/story-candidates')
    }
  })

  it('the dump path the pilot passes is the one the dumper writes', () => {
    const pilot = '.github/workflows/story-pilot.yml'
    if (!existsSync(pilot)) return
    expect(src(pilot)).toContain('node dump-story-corpus.mjs --out reports/story-corpus-dump.json')
    expect(code(DUMPER)).toContain("arg('out', 'reports/story-corpus-dump.json')")
  })
})
