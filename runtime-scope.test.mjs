import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, cpSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

import {
  FLOOR,
  GRANTS,
  PROTECTED_TIER,
  BINDING_ENV,
  WRITE_TOOLS,
  canonicalise as policyCanonicalise,
  computeDigest as policyDigest,
  covers as policyCovers,
  normalisePath as policyNormalise,
  pathGrammarError as policyGrammar,
  parseBinding,
  loadBoundContract,
  effectiveScope,
  resolveWithin,
  contractSecurityViolations,
  decide,
} from './.claude/hooks/task-scope-policy.mjs'

// The canonical validator. Imported HERE, in the test, and nowhere in the
// runtime decision path — that separation is the point, and the first suite
// below asserts it mechanically rather than trusting this comment.
import {
  ALWAYS_FORBIDDEN,
  CONTROL_PLANE_GRANTS,
  PROTECTED_CONTROL_PLANE,
  canonicalise,
  computeDigest,
  covers,
  normalisePath,
  pathGrammarError,
  effectiveAllowedPaths,
} from './tools/verify-task-contracts.mjs'

// THE RUNTIME TASK-SCOPE GUARD.
//
// Two properties carry this file, and they pull in opposite directions.
//
// The guard must not depend on ordinary code, because a task able to edit that
// code could rewrite the rules that bind it. So the policy duplicates a little
// of the validator.
//
// And duplicated security logic rots. So every duplicated semantic is pinned
// against the canonical implementation here: same digest, same containment,
// same grammar, same floor, same grants. Drift fails a test instead of quietly
// producing two answers to the same question.
//
// What is NOT claimed anywhere below: that any of this is active. Nothing
// registers the hook. These are proofs about code that runs when a later,
// separately reviewed change turns it on.

const POLICY = '.claude/hooks/task-scope-policy.mjs'
const GUARD = '.claude/hooks/task-scope-guard.mjs'

describe('the runtime decision path is not reachable from Tier 2', () => {
  // Multiline-aware, and deliberately paranoid about the forms an import can
  // take. The first version of this used [^\n]*? between the keyword and
  // `from`, so a multi-line `import {\n  X,\n} from '../../tools/x.mjs'` — the
  // house style in this very file — matched nothing and passed silently. A
  // boundary spec that misses the most ordinary spelling of the thing it
  // forbids is worse than none, because it reads as coverage.
  const importsIn = (file) => {
    const src = readFileSync(file, 'utf8')
    const found = []
    // static `import ... from 'x'` / `export ... from 'x'`, across lines
    for (const m of src.matchAll(/(?:^|[\s;])(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g)) found.push(m[1])
    // side-effect `import 'x'` — no `from` at all
    for (const m of src.matchAll(/(?:^|[\s;])import\s*['"]([^'"]+)['"]/g)) found.push(m[1])
    // dynamic import with a literal specifier
    for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1])
    // require(), in case anyone reaches for CJS
    for (const m of src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1])
    return found
  }

  /** Module-loading routes a literal scan cannot follow, forbidden outright. */
  const indirectLoadersIn = (file) => {
    const src = readFileSync(file, 'utf8')
    const hits = []
    // createRequire aliased to any name defeats a /\brequire\(/ scan entirely.
    if (/createRequire/.test(src)) hits.push('createRequire')
    if (/\bprocess\s*\.\s*binding\b/.test(src)) hits.push('process.binding')
    if (/\bModule\s*\.\s*_load\b/.test(src)) hits.push('Module._load')
    if (/\beval\s*\(/.test(src)) hits.push('eval')
    if (/new\s+Function\s*\(/.test(src)) hits.push('new Function')
    return hits
  }

  /** Any import-shaped construct whose specifier this spec could NOT read. */
  const opaqueImportsIn = (file) => {
    const src = readFileSync(file, 'utf8')
    return [...src.matchAll(/\bimport\s*\(([^)]*)\)/g)]
      .map(m => m[1].trim())
      .filter(arg => !/^['"][^'"]+['"]$/.test(arg))
  }

  it('imports only Node builtins and other protected hook files', () => {
    // THE structural invariant. A single `../tools/…` here would undo the whole
    // arrangement: the guard would again depend on a file an ordinary task can
    // be authorized to rewrite. Asserted by reading the files, so it holds
    // against whatever is actually on disk rather than what anyone intended.
    for (const file of [POLICY, GUARD]) {
      const specifiers = importsIn(file)
      expect(specifiers.length, file + ' should import something').toBeGreaterThan(0)
      for (const spec of specifiers) {
        const ok = spec.startsWith('node:') || (spec.startsWith('./') && spec.endsWith('.mjs'))
        expect(ok, file + ' imports "' + spec + '", which is outside node: and .claude/hooks/').toBe(true)
      }
    }
  })

  it('detects the multi-line and side-effect forms, not just the one-liner', () => {
    // Proves the detector on the shapes that defeated its first version, using
    // this file itself as the multi-line specimen: it imports from tools/ in
    // exactly that style, so if the pattern cannot see that, it cannot see the
    // violation it exists to catch.
    const selfSpecifiers = importsIn('runtime-scope.test.mjs')
    expect(selfSpecifiers, 'the multi-line tools/ import in this file').toContain('./tools/verify-task-contracts.mjs')
    expect(selfSpecifiers).toContain('./.claude/hooks/task-scope-policy.mjs')
    expect(selfSpecifiers).toContain('node:fs')
  })

  it('forbids the indirect module loaders no literal scan can follow', () => {
    // createRequire is the hole: `const req = createRequire(import.meta.url);
    // req('../../tools/x.mjs')` satisfies every specifier check, because the
    // only literal import is 'node:module'. A scan cannot chase an alias, so
    // the construct itself is banned in the protected files.
    for (const file of [POLICY, GUARD]) {
      expect(indirectLoadersIn(file), file + ' uses an indirect module loader').toEqual([])
    }
  })

  it('leaves no import whose specifier it cannot read', () => {
    // A computed specifier — import(base + name) — is invisible to any literal
    // scan. Rather than pretend otherwise, forbid the construct outright in the
    // protected files.
    for (const file of [POLICY, GUARD]) {
      expect(opaqueImportsIn(file), file + ' has a dynamic import with a computed specifier').toEqual([])
    }
  })

  it('reaches no relative path outside .claude/hooks/', () => {
    for (const file of [POLICY, GUARD]) {
      for (const spec of importsIn(file)) {
        if (!spec.startsWith('.')) continue
        const resolved = path.normalize(path.join(path.dirname(file), spec))
        expect(resolved.startsWith('.claude/hooks/'), file + ' -> ' + resolved).toBe(true)
      }
    }
  })

  it('keeps the adapter thin — no authorization vocabulary of its own', () => {
    // The adapter may deny; it may not decide. If terms like allowed_paths or
    // the floor appear here, logic has leaked out of the reviewed module.
    const src = readFileSync(GUARD, 'utf8')
    for (const term of ['allowed_paths', 'control_plane', 'contract_digest', 'ALWAYS_FORBIDDEN', 'forbidden_paths']) {
      expect(src, 'the adapter mentions ' + term).not.toContain(term)
    }
    expect(src).toContain('task-scope-policy.mjs')
  })
})

describe('parity with the canonical validator', () => {
  it('computes the same digest for every contract on disk', () => {
    // The strongest parity check available: the real contracts, not fixtures.
    const dir = '.agent/tasks'
    const names = readdirSync(dir).filter(n => n.endsWith('.json'))
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) {
      const c = JSON.parse(readFileSync(dir + '/' + n, 'utf8'))
      expect(policyDigest(c), n).toBe(computeDigest(c))
      expect(policyDigest(c), n + ' seal').toBe(c.contract_digest)
    }
  })

  it('canonicalises the same, including the shapes that decide the digest', () => {
    const cases = [
      null, undefined, 0, '', 'x', true, [], {}, [1, [2, [3]]],
      { b: 1, a: 2 }, { a: { d: 4, c: 3 } }, { a: undefined }, { a: null },
      { control_plane: { protected_paths: ['x'], grant: 'g' } },
    ]
    for (const v of cases) expect(policyCanonicalise(v), JSON.stringify(v) ?? 'undefined').toBe(canonicalise(v))
  })

  it('binds an optional field only when the key is present, exactly as the validator does', () => {
    const base = JSON.parse(readFileSync('.agent/tasks/runtime-task-scope-guard.json', 'utf8'))
    const stripped = { ...base }
    delete stripped.control_plane
    for (const variant of [base, stripped, { ...stripped, control_plane: null }]) {
      expect(policyDigest(variant)).toBe(computeDigest(variant))
    }
    expect(policyDigest(stripped)).not.toBe(policyDigest(base))
  })

  it('agrees on containment over generated path pairs', () => {
    const patterns = [
      '.git/**', '.agent/tasks/**', '.agent/roles.json', '.claude/settings.json',
      '.claude/hooks/**', '.claude/hooks/task-scope-policy.mjs', 'src/**', 'a/b/**',
      'a/b.js', '**', './src/**', 'src//deep/**',
    ]
    const probes = [
      '.git/config', '.gitignore', '.agent/tasks/x.json', '.agent/tasks', '.agent/roles.json',
      '.claude/settings.json', '.claude/settings.local.json', '.claude/hooks/x.mjs',
      '.claude/hooks/a/b/x.mjs', '.claude/hooksmith.mjs', 'src/x.js', 'src/a/b/x.js',
      'srcx/x.js', 'a/b.js', 'a/b.jsx', './src/x.js',
    ]
    for (const o of patterns) {
      for (const i of probes) {
        expect(policyCovers(o, i), 'covers(' + o + ', ' + i + ')').toBe(covers(o, i))
      }
    }
  })

  it('agrees on normalisation and on the path grammar', () => {
    const spellings = [
      'a/b', './a/b', 'a//b', 'a/**', './a/**', '**', '', ' a', 'a ', '/abs', '..', 'a/../b',
      'a/./b', 'C:/x', 'a\\b', 'a/*', 'a/*.js', '.claude/hooks/**', '.agent/tasks/x.json',
    ]
    for (const s of spellings) {
      expect(policyNormalise(s), 'normalise ' + JSON.stringify(s)).toBe(normalisePath(s))
      const a = policyGrammar(s)
      const b = pathGrammarError(s)
      expect(a === null, 'grammar verdict for ' + JSON.stringify(s)).toBe(b === null)
    }
  })

  it('holds the protected floor and grant copies equal to the canonical ones', () => {
    expect(FLOOR).toEqual(ALWAYS_FORBIDDEN)
    expect(GRANTS).toEqual(CONTROL_PLANE_GRANTS)
  })

  it('derives the same effective scope as the validator, for contracts on disk', () => {
    const dir = '.agent/tasks'
    for (const n of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const c = JSON.parse(readFileSync(dir + '/' + n, 'utf8'))
      expect(effectiveScope(c), n).toEqual(effectiveAllowedPaths(c))
    }
  })

  it('drops allowed_paths spellings the grammar rejects, rather than honouring them', () => {
    // Asserted directly, because the containment sweep below cannot see it: it
    // passes whether or not the filter exists. A bare "**" reaching the runtime
    // would authorise everything below Tier 0 while the validator refuses the
    // contract outright.
    const base = { allowed_paths: ['**'], forbidden_paths: [] }
    expect(effectiveScope(base)).toEqual([])
    expect(effectiveScope({ allowed_paths: ['../escape', 'src/**'], forbidden_paths: [] })).toEqual(['src/**'])
    expect(effectiveScope({ allowed_paths: ['src/*.js', 'a/./b', 'src/**'], forbidden_paths: [] })).toEqual(['src/**'])
    // And end to end: a '**' contract authorises nothing.
    const c = writeContract(contract({ allowed_paths: ['**'] }))
    const d = run(call('outside/secret.txt'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(false)
    writeContract(contract())
  })

  it('keeps every grant mapped inside the protected tier', () => {
    // The runtime checks tier containment as well as grant reach; the two are
    // equivalent only while every grant maps inside the tier, and nothing made
    // that stay true. Pinned in both directions.
    expect(PROTECTED_TIER).toEqual(PROTECTED_CONTROL_PLANE)
    for (const [name, paths] of Object.entries(GRANTS)) {
      for (const p of paths) {
        expect(PROTECTED_TIER.some(t => policyCovers(t, p)), name + ' maps ' + p + ' outside the tier').toBe(true)
      }
    }
  })

  it('derives the same effective scope for contracts the validator REJECTS', () => {
    // The half that matters, and the half the on-disk sweep structurally cannot
    // reach: every contract in .agent/tasks already validates, so a runtime
    // path that is more permissive for INVALID contracts agrees on every input
    // that spec will ever see. These are the shapes where the two could drift
    // apart unnoticed — most sharply, a low-risk contract from an unrelated
    // domain claiming authority over the guard's own decision logic.
    const base = {
      id: 'probe', goal: 'g', owner_role: 'workflow-authority', risk: 'r3',
      allowed_paths: ['src/**'], forbidden_paths: [], non_goals: ['n'],
      acceptance_criteria: ['a'], verification: ['npm run verify:pr'],
      production_effect: 'none', dependencies: [], stop_conditions: ['s'],
    }
    const grant = {
      grant: 'runtime-hook-maintenance',
      protected_paths: ['.claude/hooks/task-scope-policy.mjs'],
      justification: 'j',
    }
    const variants = [
      { ...base, control_plane: grant },                                   // valid
      { ...base, owner_role: 'story-content', control_plane: grant },      // wrong role
      { ...base, owner_role: 'product-app', control_plane: grant },        // wrong role
      { ...base, risk: 'r1', control_plane: grant },                       // below the floor
      { ...base, risk: 'r0', control_plane: grant },
      { ...base, risk: 'nonsense', control_plane: grant },
      { ...base, control_plane: { ...grant, sneaky: true } },              // unknown key
      { ...base, control_plane: { ...grant, justification: '' } },
      { ...base, control_plane: { ...grant, grant: 'runtime-policy-maintenance' } },
      { ...base, control_plane: { ...grant, protected_paths: ['.agent/roles.json'] } },
      { ...base, control_plane: { ...grant, protected_paths: ['.claude/hooks/*.mjs'] } },
      { ...base, control_plane: { ...grant, grant: 'constructor' } },
      { ...base, control_plane: null },
      { ...base, allowed_paths: ['**'] },                                  // grammar-invalid
      { ...base, allowed_paths: ['../escape', 'src/**'] },
      { ...base, forbidden_paths: ['.claude/hooks/**'], control_plane: grant },
      // Spellings the canonical validator drops from forbidden_paths because
      // they fail the grammar. The runtime must drop them too, or it refuses a
      // grant the validator honours — stricter, but still a divergence.
      { ...base, forbidden_paths: ['./.claude/hooks/**'], control_plane: grant },
      { ...base, forbidden_paths: ['**'], control_plane: grant },
      { ...base, forbidden_paths: ['.claude/hooks/../hooks/**'], control_plane: grant },
    ]
    for (const c of variants) {
      const label = JSON.stringify(c.control_plane) + ' / ' + c.owner_role + ' / ' + c.risk
      const runtime = effectiveScope(c)
      const canonical = effectiveAllowedPaths(c)
      // THE INVARIANT, stated as containment rather than equality: the runtime
      // may be stricter than the validator, never more permissive. It is
      // deliberately stricter in one place — it drops allowed_paths entries the
      // grammar rejects, because the validator refuses such a contract outright
      // and the guard has no equivalent "refuse the whole contract" step. What
      // must never happen is the other direction: a path the runtime authorises
      // that the validator would not.
      for (const p of runtime) {
        expect(canonical, label + ' — runtime authorises "' + p + '" that the validator does not').toContain(p)
      }
      // And for the grant specifically, the two agree exactly: a grant the
      // validator refuses grants nothing at runtime either.
      const grantedRuntime = runtime.filter(x => !c.allowed_paths.includes(x))
      const grantedCanonical = canonical.filter(x => !c.allowed_paths.includes(x))
      expect(grantedRuntime, label).toEqual(grantedCanonical)
    }
  })
})

// ---------------------------------------------------------------------------
// A disposable repository, because the guard's decisions are about real paths:
// realpath resolution and symlink behaviour cannot be faked with string
// fixtures, and the one escape a cold probe proved live was a real symlink.
// ---------------------------------------------------------------------------

let ROOT
const seal = (c) => ({ ...c, contract_digest: policyDigest(c) })

const contract = (over = {}) => seal({
  id: 'demo-task',
  goal: 'Do one well-defined thing.',
  owner_role: 'workflow-authority',
  risk: 'r3',
  allowed_paths: ['src/**', 'docs/thing.md'],
  forbidden_paths: [],
  non_goals: ['Anything else'],
  acceptance_criteria: ['It works'],
  verification: ['npm run verify:pr'],
  production_effect: 'none',
  dependencies: [],
  stop_conditions: ['It would touch production'],
  ...over,
})

const writeContract = (c, name = c.id) => {
  writeFileSync(path.join(ROOT, '.agent/tasks', name + '.json'), JSON.stringify(c, null, 2))
  return c
}

const bindingFor = (c, over = {}) => JSON.stringify({
  contract_id: c.id,
  contract_digest: c.contract_digest,
  contract_path: '.agent/tasks/' + c.id + '.json',
  ...over,
})

const call = (file, over = {}) => ({
  tool_name: 'Write',
  agent_type: 'task-producer',
  tool_input: { file_path: file },
  ...over,
})

const run = (event, env) => decide(event, { root: ROOT, env })

beforeAll(() => {
  ROOT = mkdtempSync(path.join(tmpdir(), 'scope-'))
  for (const d of ['.agent/tasks', '.agent', 'src/deep', 'docs', 'outside', '.git', '.claude/hooks']) {
    mkdirSync(path.join(ROOT, d), { recursive: true })
  }
  writeFileSync(path.join(ROOT, 'src/existing.js'), 'x')
  writeFileSync(path.join(ROOT, 'outside/secret.txt'), 'x')
  // The real role model, because the policy derives the control-plane role from
  // it exactly as the validator does. A stub would make every grant fail for
  // the wrong reason and hide whether the grant path works at all.
  writeFileSync(path.join(ROOT, '.agent/roles.json'), readFileSync('.agent/roles.json', 'utf8'))
  // The escape the probe proved: an in-scope directory entry that is really a
  // door out of scope.
  symlinkSync(path.join(ROOT, 'outside'), path.join(ROOT, 'src/door'))
})

afterAll(() => { if (ROOT) rmSync(ROOT, { recursive: true, force: true }) })

describe('the guard allows what the contract actually authorises', () => {
  it('allows an in-scope write, so this is not deny-all', () => {
    const c = writeContract(contract())
    const d = run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(true)
  })

  it('allows a NEW file whose parent resolves inside scope', () => {
    const c = writeContract(contract())
    const d = run(call(path.join(ROOT, 'src/deep/brand-new.js')), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(true)
  })

  it('allows an exact allowed path as well as a subtree', () => {
    const c = writeContract(contract())
    expect(run(call('docs/thing.md'), { [BINDING_ENV]: bindingFor(c) }).allow).toBe(true)
  })

  it('allows a granted protected path when the whole grant validates', () => {
    const c = writeContract(contract({
      allowed_paths: ['src/**'],
      control_plane: {
        grant: 'runtime-hook-maintenance',
        protected_paths: ['.claude/hooks/guard.mjs'],
        justification: 'installs the guard',
      },
    }))
    const d = run(call('.claude/hooks/guard.mjs'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(true)
  })

  it('leaves non-write tools and trusted driver calls alone', () => {
    const c = writeContract(contract())
    const env = { [BINDING_ENV]: bindingFor(c) }
    expect(run(call('outside/secret.txt', { tool_name: 'Read' }), env).allow).toBe(true)
    expect(run(call('outside/secret.txt', { tool_name: 'Bash' }), env).allow).toBe(true)
    // No agent_type is the driver. It holds Bash and git by design; claiming to
    // police it would be a claim this mechanism cannot support.
    expect(run(call('outside/secret.txt', { agent_type: undefined }), env).allow).toBe(true)
    expect(run(call('outside/secret.txt', { agent_type: null }), env).allow).toBe(true)
  })

  it('pins the write-tool list as a literal, not by iterating itself', () => {
    // Iterating WRITE_TOOLS to test WRITE_TOOLS proves nothing: drop Edit from
    // the constant and the loop simply runs one fewer time and passes, while
    // every producer Edit call silently becomes "not a write tool".
    expect(WRITE_TOOLS).toEqual(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
    // And it must cover every write-capable tool the producer actually holds.
    const producerTools = (readFileSync('.claude/agents/task-producer.md', 'utf8')
      .split('---')[1].match(/^tools:\s*(.*)$/m)?.[1] || '').split(',').map(t => t.trim())
    for (const t of producerTools) {
      if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(t)) expect(WRITE_TOOLS).toContain(t)
    }
  })

  it('covers every write tool, not just Write', () => {
    const c = writeContract(contract())
    const env = { [BINDING_ENV]: bindingFor(c) }
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      const ev = tool === 'NotebookEdit'
        ? { tool_name: tool, agent_type: 'task-producer', tool_input: { notebook_path: 'outside/x.ipynb' } }
        : call('outside/x.txt', { tool_name: tool })
      expect(run(ev, env).allow, tool).toBe(false)
    }
  })
})

describe('the guard fails closed on every invalid state', () => {
  it('denies a Tier 0 path — before the binding is even parsed', () => {
    // No binding at all in the environment: the floor still holds. It is the
    // one rule that needs nothing established to apply.
    for (const p of ['.agent/tasks/demo-task.json', '.agent/roles.json', '.claude/settings.local.json', '.git/config']) {
      const d = run(call(p), {})
      expect(d.allow, p).toBe(false)
      expect(d.reason, p).toMatch(/Tier 0/)
    }
  })

  it('denies Tier 0 even when the bound contract tries to authorise it', () => {
    const c = writeContract(contract({ allowed_paths: ['.agent/**', 'src/**'] }))
    const d = run(call('.agent/roles.json'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/Tier 0/)
  })

  it('denies a missing or malformed binding', () => {
    writeContract(contract())
    for (const raw of [undefined, '', '   ', 'not json', '[]', '"x"', '{}', '42']) {
      const d = run(call('src/thing.js'), raw === undefined ? {} : { [BINDING_ENV]: raw })
      expect(d.allow, JSON.stringify(raw)).toBe(false)
    }
  })

  it('denies a binding missing any required field', () => {
    const c = writeContract(contract())
    const full = JSON.parse(bindingFor(c))
    for (const f of ['contract_id', 'contract_digest', 'contract_path']) {
      const partial = { ...full }
      delete partial[f]
      const d = run(call('src/thing.js'), { [BINDING_ENV]: JSON.stringify(partial) })
      expect(d.allow, f).toBe(false)
      expect(d.reason, f).toContain(f)
    }
  })

  it('denies a contract path that is not exactly .agent/tasks/<id>.json', () => {
    const c = writeContract(contract())
    for (const p of [
      '.agent/tasks/other.json', 'tasks/demo-task.json', '.agent/tasks/demo-task.JSON',
      '/abs/.agent/tasks/demo-task.json', '.agent/tasks/../tasks/demo-task.json', 'demo-task.json',
    ]) {
      const d = run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(c, { contract_path: p }) })
      expect(d.allow, p).toBe(false)
      expect(d.reason, p).toMatch(/contract_path must be exactly/)
    }
  })

  it('denies an id that is not a bare contract id', () => {
    const c = writeContract(contract())
    for (const id of ['../escape', 'a/b', 'demo-task.json', 'demo task', '']) {
      const d = run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(c, { contract_id: id }) })
      expect(d.allow, JSON.stringify(id)).toBe(false)
    }
  })

  it('denies an unknown contract — no discovery, no fallback', () => {
    const missing = contract({ id: 'never-written' })
    const d = run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(missing) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/could not be read/)
  })

  it('denies a malformed or unsealed contract', () => {
    writeFileSync(path.join(ROOT, '.agent/tasks/broken.json'), '{ not json')
    const broken = { id: 'broken', contract_digest: 'a'.repeat(64) }
    expect(run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(broken) }).allow).toBe(false)

    const unsealed = contract({ id: 'unsealed' })
    delete unsealed.contract_digest
    writeContract(unsealed, 'unsealed')
    const d = run(call('src/thing.js'), {
      [BINDING_ENV]: JSON.stringify({
        contract_id: 'unsealed', contract_digest: 'b'.repeat(64),
        contract_path: '.agent/tasks/unsealed.json',
      }),
    })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/unsealed/)
  })

  it('denies a contract whose id does not match the file it was bound as', () => {
    const c = contract({ id: 'demo-task' })
    writeContract(c, 'mismatched')
    const d = run(call('src/thing.js'), {
      [BINDING_ENV]: JSON.stringify({
        contract_id: 'mismatched', contract_digest: c.contract_digest,
        contract_path: '.agent/tasks/mismatched.json',
      }),
    })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/does not match the binding id/)
  })

  it('denies a stale seal — fields edited without re-sealing', () => {
    const c = contract()
    const tampered = { ...c, allowed_paths: ['**'] }   // digest left behind
    writeContract(tampered, 'demo-task')
    const d = run(call('outside/secret.txt'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/stale seal/)
    writeContract(contract())
  })

  it('denies a digest the launcher did not bind', () => {
    // The contract is internally consistent; it is simply not the one the
    // session was bound to. Re-read and re-verified on every call, so swapping
    // the file mid-session cannot move the terms under the verdict.
    const other = writeContract(contract({ id: 'demo-task', allowed_paths: ['**'] }))
    const d = run(call('outside/secret.txt'), {
      [BINDING_ENV]: JSON.stringify({
        contract_id: 'demo-task', contract_digest: 'c'.repeat(64),
        contract_path: '.agent/tasks/demo-task.json',
      }),
    })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/does not match the launcher-bound digest/)
    expect(other.allowed_paths).toEqual(['**'])
    writeContract(contract())
  })

  it('denies a path outside the effective scope', () => {
    const c = writeContract(contract())
    const d = run(call('outside/secret.txt'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/outside the scope/)
  })

  it('denies a forbidden path even when allowed_paths would cover it', () => {
    const c = writeContract(contract({ allowed_paths: ['src/**'], forbidden_paths: ['src/deep/**'] }))
    const d = run(call('src/deep/x.js'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/forbidden/)
  })

  it('denies a write with no file path at all', () => {
    const c = writeContract(contract())
    const d = run({ tool_name: 'Write', agent_type: 'task-producer', tool_input: {} },
      { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
  })

  it('WIDENS NOTHING when the grant is invalid', () => {
    // Fail closed, not fail partial: every one of these is a different way for
    // the declaration to be wrong, and each leaves the protected path exactly
    // as out of scope as no grant at all.
    const bad = [
      { grant: 'no-such-grant', protected_paths: ['.claude/hooks/guard.mjs'], justification: 'j' },
      { grant: 'runtime-policy-maintenance', protected_paths: ['.claude/hooks/guard.mjs'], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: ['.agent/roles.json'], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: ['.claude/hooks/*.mjs'], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: [], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: ['.claude/hooks/guard.mjs'] },
      { grant: 'constructor', protected_paths: ['.claude/hooks/guard.mjs'], justification: 'j' },
      null,
    ]
    for (const cp of bad) {
      const c = writeContract(contract({ allowed_paths: ['src/**'], control_plane: cp }))
      const d = run(call('.claude/hooks/guard.mjs'), { [BINDING_ENV]: bindingFor(c) })
      expect(d.allow, JSON.stringify(cp)).toBe(false)
      expect(effectiveScope(c)).toEqual(['src/**'])
    }
    writeContract(contract())
  })
})

describe('the symlink escape is closed', () => {
  it('DENIES a write through an in-scope symlink that lands outside scope', () => {
    // The escape a cold probe proved live on 2.1.257 and again on 2.1.258: the
    // runtime hands the hook the path the model asked for, unresolved. A
    // textual prefix check sees src/… and allows; the bytes land in outside/.
    // Nothing but realpath resolution closes this.
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const d = run(call('src/door/escaped.txt'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(false)
    expect(d.reason).toMatch(/outside the scope/)
    // And the reason names where it really resolved, not where it was spelled.
    expect(d.reason).toMatch(/outside/)
  })

  it('denies a symlinked path even when the link itself is spelled in scope', () => {
    const c = writeContract(contract({ allowed_paths: ['src/door/**'] }))
    const d = run(call('src/door/escaped.txt'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(false)
  })

  it('denies a symlink reaching Tier 0', () => {
    symlinkSync(path.join(ROOT, '.git'), path.join(ROOT, 'src/gitdoor'))
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const d = run(call('src/gitdoor/config'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(false)
    expect(d.reason).toMatch(/Tier 0/)
  })

  it('DENIES a symlink whose target does not exist', () => {
    // The regression test that should have shipped with the fix, and did not.
    //
    // realpath throws ENOENT for two different things: a file that does not
    // exist yet, which must resolve through its parent and be allowed, and a
    // symlink whose TARGET does not exist. Resolving the second through its
    // parent hands back the LINK's own in-scope path — so the guard reasons
    // about src/link while the write follows the link to wherever it points.
    //
    // Reproduced as an ALLOW before the fix. lstat is what separates the two
    // cases, because it does not follow the link.
    symlinkSync('/definitely/not/a/real/target', path.join(ROOT, 'src/dangling'))
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const d = run(call('src/dangling'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(false)
    expect(d.reason).toMatch(/symlink whose target cannot be resolved/)
  })

  it('DENIES a dangling symlink aimed at Tier 0, which both floor checks would miss', () => {
    // The laundering case. Neither Tier-0 pass can see it: the lexical check
    // sees the spelling "src/gitdangler", and the resolved check would see the
    // same string if the parent-resolution fallback had run. Only refusing to
    // resolve a dangling link at all closes it.
    symlinkSync(path.join(ROOT, '.git/hooks/pre-commit'), path.join(ROOT, 'src/gitdangler'))
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const d = run(call('src/gitdangler'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(false)
  })

  it('still allows a genuinely new file, so the fix did not become deny-all', () => {
    // The other half of the same branch: an ordinary not-yet-existing file must
    // keep resolving through its parent. A fix that denied both would pass the
    // two specs above and break the guard's usefulness entirely.
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const d = run(call('src/deep/not-yet-written.js'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow, d.reason).toBe(true)
  })

  it('denies when nothing can be resolved', () => {
    const c = writeContract(contract())
    const d = run(call('src/no/such/dir/x.js'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/nor its parent directory could be resolved/)
  })

  it('denies an absolute path that resolves outside the repository', () => {
    // allowed_paths deliberately as wide as the grammar permits, so the deny
    // comes from resolution rather than from scope.
    const c = writeContract(contract({ allowed_paths: ['src/**', 'etc/**'] }))
    const d = run(call('/etc/hosts'), { [BINDING_ENV]: bindingFor(c) })
    expect(d.allow).toBe(false)
    expect(d.reason).toMatch(/outside the repository/)
  })

  it('resolves an unreadable root to a deny rather than a guess', () => {
    const d = resolveWithin('/definitely/not/a/root', 'src/x.js')
    expect(d.error).toMatch(/root could not be resolved/)
  })
})

describe('traversal and normalisation spellings', () => {
  it('denies traversal out of scope however it is spelled', () => {
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const env = { [BINDING_ENV]: bindingFor(c) }
    for (const p of ['src/../outside/secret.txt', 'src/deep/../../outside/secret.txt', './src/../outside/secret.txt']) {
      expect(run(call(p), env).allow, p).toBe(false)
    }
  })

  it('accepts equivalent in-scope spellings', () => {
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const env = { [BINDING_ENV]: bindingFor(c) }
    for (const p of ['src/existing.js', './src/existing.js', 'src/deep/../existing.js', path.join(ROOT, 'src/existing.js')]) {
      expect(run(call(p), env).allow, p).toBe(true)
    }
  })
})

describe('the producer definition', () => {
  const src = readFileSync('.claude/agents/task-producer.md', 'utf8')
  const frontmatter = src.split('---')[1] || ''
  const tools = (frontmatter.match(/^tools:\s*(.*)$/m)?.[1] || '')
    .split(',').map(t => t.trim()).filter(Boolean)

  it('declares a closed minimal tool set', () => {
    expect(tools.length).toBeGreaterThan(0)
    expect(tools).toEqual(['Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep'])
  })

  it('locks the shell out twice — denylist as well as allowlist', () => {
    // disallowedTools is applied FIRST and the allowlist resolves against what
    // remains, so someone who later adds Bash to tools: still does not get it.
    // The sibling reviewer definition pairs the two for exactly this reason,
    // and the producer — whose Bash-lessness is what gives the guard meaning —
    // has more need of the second lock than anything else in the repository.
    const denied = (frontmatter.match(/^disallowedTools:\s*(.*)$/m)?.[1] || '')
      .split(',').map(t => t.trim()).filter(Boolean)
    expect(denied.length, 'no disallowedTools line').toBeGreaterThan(0)
    for (const t of ['Bash', 'BashOutput', 'KillShell', 'Agent', 'Task']) {
      expect(denied, 'disallowedTools omits ' + t).toContain(t)
    }
    // The two lists must not contradict each other.
    for (const t of tools) expect(denied, 'tools and disallowedTools both name ' + t).not.toContain(t)
  })

  it('has no shell, no process tool and no way to spawn an agent', () => {
    // The load-bearing one. Deny rules cover Claude's own file tools and the
    // Bash commands it recognises — they do NOT cover a subprocess that opens
    // files itself. Bash-lessness is what makes the guard meaningful, and the
    // platform enforces this list.
    for (const forbidden of ['Bash', 'BashOutput', 'KillShell', 'Task', 'Agent', 'Execute', 'Shell']) {
      expect(tools, 'producer holds ' + forbidden).not.toContain(forbidden)
    }
  })

  it('says plainly that it is not itself protected', () => {
    // .claude/agents/** is Tier 2. Claiming otherwise would be the kind of
    // half-true security statement this whole workstream exists to avoid.
    expect(src).toMatch(/Tier 2/)
    expect(src).toMatch(/not sealed|not protected/)
  })
})

describe('what this change does NOT claim', () => {
  it('registers nothing — the hook is inert at this commit', () => {
    // The honesty check, asserted rather than asserted-in-prose: if a later
    // change wires the guard into settings, this fails and someone has to
    // decide whether the claims elsewhere are still true.
    const settings = readFileSync('.claude/settings.json', 'utf8')
    expect(settings).not.toContain('task-scope-guard')
    expect(settings).not.toContain('task-scope-policy')
  })

  it('leaves the existing session-start hook untouched', () => {
    const contractFile = JSON.parse(readFileSync('.agent/tasks/runtime-task-scope-guard.json', 'utf8'))
    expect(contractFile.control_plane.protected_paths).toEqual([
      '.claude/hooks/task-scope-policy.mjs',
      '.claude/hooks/task-scope-guard.mjs',
    ])
    // The grant reaches the whole subtree; this contract deliberately does not.
    expect(contractFile.control_plane.protected_paths).not.toContain('.claude/hooks/**')
  })

  it('documents the residuals rather than claiming they are closed', () => {
    const doc = readFileSync('docs/AUTOMATION-AUTHORITY.md', 'utf8')
    expect(doc).toMatch(/disableAllHooks/)
    expect(doc).toMatch(/inert/)
  })
})

// A digest computed the long way round, as an independent check that the
// policy's copy is the real sha256 of the canonical form rather than agreeing
// with the validator because both are wrong in the same way.
describe('the seal is a real sha256 of the canonical form', () => {
  it('matches an independently computed hash', () => {
    const c = contract()
    const fields = [
      'id', 'goal', 'owner_role', 'risk', 'allowed_paths', 'forbidden_paths',
      'non_goals', 'acceptance_criteria', 'verification', 'production_effect',
      'dependencies', 'stop_conditions',
    ]
    const bound = {}
    for (const f of fields) bound[f] = c[f]
    const expected = createHash('sha256').update(canonicalise(bound)).digest('hex')
    expect(policyDigest(c)).toBe(expected)
  })
})


// ---------------------------------------------------------------------------
// THE ADAPTER, EXECUTED.
//
// Everything above tests the policy as a module. None of it proves the file
// Claude Code will actually run does the right thing — and the adapter is where
// a mistake is quietest, because Claude Code ignores hook JSON it does not
// recognise. A typo in `permissionDecision` would ship green and become an
// ALLOW the moment the hook is registered.
//
// So these specs spawn the real adapter, feed it real stdin, and read what it
// writes. Inspection is not a substitute.
// ---------------------------------------------------------------------------

describe('the adapter, actually run', () => {
  let ADAPTER_ROOT
  let contractDigest

  const runGuard = (event, { env = {}, root = ADAPTER_ROOT, guard } = {}) => {
    const r = spawnSync(process.execPath, [guard || path.join(root, '.claude/hooks/task-scope-guard.mjs')], {
      input: typeof event === 'string' ? event : JSON.stringify(event),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    })
    let parsed = null
    if (r.stdout && r.stdout.trim()) { try { parsed = JSON.parse(r.stdout) } catch { parsed = 'UNPARSEABLE' } }
    return { status: r.status, stdout: r.stdout, parsed }
  }

  const binding = () => JSON.stringify({
    contract_id: 'adapter-demo',
    contract_digest: contractDigest,
    contract_path: '.agent/tasks/adapter-demo.json',
  })

  beforeAll(() => {
    ADAPTER_ROOT = mkdtempSync(path.join(tmpdir(), 'adapter-'))
    for (const d of ['.agent/tasks', '.claude/hooks', 'src']) {
      mkdirSync(path.join(ADAPTER_ROOT, d), { recursive: true })
    }
    // The REAL protected files, copied verbatim — this suite must exercise what
    // ships, not a rewritten stand-in.
    cpSync('.claude/hooks/task-scope-guard.mjs', path.join(ADAPTER_ROOT, '.claude/hooks/task-scope-guard.mjs'))
    cpSync('.claude/hooks/task-scope-policy.mjs', path.join(ADAPTER_ROOT, '.claude/hooks/task-scope-policy.mjs'))
    cpSync('.agent/roles.json', path.join(ADAPTER_ROOT, '.agent/roles.json'))
    const c = seal({
      id: 'adapter-demo', goal: 'g', owner_role: 'workflow-authority', risk: 'r3',
      allowed_paths: ['src/**'], forbidden_paths: [], non_goals: ['n'],
      acceptance_criteria: ['a'], verification: ['npm run verify:pr'],
      production_effect: 'none', dependencies: [], stop_conditions: ['s'],
    })
    contractDigest = c.contract_digest
    writeFileSync(path.join(ADAPTER_ROOT, '.agent/tasks/adapter-demo.json'), JSON.stringify(c, null, 2))
  })

  afterAll(() => { if (ADAPTER_ROOT) rmSync(ADAPTER_ROOT, { recursive: true, force: true }) })

  it('emits EXACTLY the PreToolUse deny shape Claude Code recognises', () => {
    // Field names verbatim. Claude Code ignores hook output it cannot parse, so
    // a misspelling here is silently an allow — which is why this asserts the
    // literal keys rather than "something deny-ish".
    const { parsed, status } = runGuard(
      { tool_name: 'Write', agent_type: 'task-producer', tool_input: { file_path: 'outside/x.txt' } },
      { env: { HANZI_TASK_BINDING: binding() } })
    expect(status).toBe(0)
    expect(parsed).not.toBe('UNPARSEABLE')
    expect(Object.keys(parsed)).toEqual(['hookSpecificOutput'])
    expect(Object.keys(parsed.hookSpecificOutput).sort())
      .toEqual(['hookEventName', 'permissionDecision', 'permissionDecisionReason'])
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(typeof parsed.hookSpecificOutput.permissionDecisionReason).toBe('string')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/^task-scope-guard: /)
  })

  it('emits NOTHING for an allow, so the normal permission flow proceeds', () => {
    const r = runGuard({ tool_name: 'Write', agent_type: 'task-producer', tool_input: { file_path: 'src/ok.js' } },
      { env: { HANZI_TASK_BINDING: binding() } })
    expect(r.status).toBe(0)
    expect(r.stdout.trim(), 'an allow must write no decision at all').toBe('')
  })

  it('denies malformed stdin and a malformed event', () => {
    for (const input of ['', 'not json', '{"unclosed":', '[]', 'null', '42']) {
      const { parsed } = runGuard(input, { env: { HANZI_TASK_BINDING: binding() } })
      expect(parsed, JSON.stringify(input)).not.toBeNull()
      expect(parsed.hookSpecificOutput.permissionDecision, JSON.stringify(input)).toBe('deny')
    }
  })

  it('denies when the policy THROWS', () => {
    // A policy that loads but explodes. The adapter must catch it, not inherit
    // the crash — an uncaught throw exits non-zero, and only exit 2 blocks.
    const root = mkdtempSync(path.join(tmpdir(), 'throwing-'))
    mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
    cpSync('.claude/hooks/task-scope-guard.mjs', path.join(root, '.claude/hooks/task-scope-guard.mjs'))
    writeFileSync(path.join(root, '.claude/hooks/task-scope-policy.mjs'),
      'export function decide () { throw new Error("boom") }\n')
    const { parsed } = runGuard({ tool_name: 'Write', agent_type: 'p', tool_input: { file_path: 'x' } }, { root })
    expect(parsed).not.toBeNull()
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/threw while deciding|boom/)
    rmSync(root, { recursive: true, force: true })
  })

  it('denies when the policy module CANNOT BE LOADED', () => {
    // The case a top-level static import could not have caught: the throw
    // happens before any of the adapter's code exists, Node exits non-zero, and
    // a non-2 exit is non-blocking — the write proceeds. Two shapes: missing,
    // and present but syntactically broken.
    for (const [label, write] of [
      ['missing policy', null],
      ['unparseable policy', 'export function decide( {{{ syntax error\n'],
      ['policy with no decide()', 'export const nothing = 1\n'],
    ]) {
      const root = mkdtempSync(path.join(tmpdir(), 'noload-'))
      mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
      cpSync('.claude/hooks/task-scope-guard.mjs', path.join(root, '.claude/hooks/task-scope-guard.mjs'))
      if (write !== null) writeFileSync(path.join(root, '.claude/hooks/task-scope-policy.mjs'), write)
      const { parsed } = runGuard({ tool_name: 'Write', agent_type: 'p', tool_input: { file_path: 'x' } }, { root })
      expect(parsed, label + ': no decision emitted').not.toBeNull()
      expect(parsed, label).not.toBe('UNPARSEABLE')
      expect(parsed.hookSpecificOutput.permissionDecision, label).toBe('deny')
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('denies Tier 0 and a dangling symlink through the real adapter', () => {
    symlinkSync('/nowhere/at/all', path.join(ADAPTER_ROOT, 'src/dangling'))
    for (const [p, label] of [['.git/config', 'Tier 0'], ['src/dangling', 'dangling symlink']]) {
      const { parsed } = runGuard(
        { tool_name: 'Write', agent_type: 'task-producer', tool_input: { file_path: p } },
        { env: { HANZI_TASK_BINDING: binding() } })
      expect(parsed, label).not.toBeNull()
      expect(parsed.hookSpecificOutput.permissionDecision, label).toBe('deny')
    }
  })

  it('denies with no binding at all', () => {
    const { parsed } = runGuard({ tool_name: 'Write', agent_type: 'task-producer', tool_input: { file_path: 'src/ok.js' } })
    expect(parsed).not.toBeNull()
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })
})

describe('an invalid bound contract authorises NOTHING', () => {
  // Not "loses the grant and carries on". A contract the canonical validator
  // would reject is one whose meaning nobody established, and the most dangerous
  // shape — settings.json sitting in ordinary allowed_paths — would otherwise
  // have handed a producer the control plane with no grant at all.
  const invalid = (over) => {
    const c = writeContract(contract({ id: 'demo-task', ...over }))
    return run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(c) })
  }

  it('denies when .claude/settings.json is directly in allowed_paths', () => {
    const d = invalid({ allowed_paths: ['src/**', '.claude/settings.json'] })
    expect(d.allow, d.reason).toBe(false)
    expect(d.reason).toMatch(/protected control plane/)
    // Even the ordinary in-scope write is refused: the contract is void, not narrowed.
    expect(d.reason).toMatch(/authorises nothing/)
  })

  it('denies when allowed_paths reaches the Tier 0 floor', () => {
    for (const p of ['.agent/tasks/**', '.agent/roles.json', '.git/**', '.agent/**', '.claude/**']) {
      const d = invalid({ allowed_paths: ['src/**', p] })
      expect(d.allow, p).toBe(false)
      expect(d.reason, p).toMatch(/Tier 0 floor|protected control plane/)
    }
  })

  it('denies an otherwise-valid src/** contract when the GRANT is invalid', () => {
    for (const cp of [
      { grant: 'no-such-grant', protected_paths: ['.claude/hooks/x.mjs'], justification: 'j' },
      { grant: 'runtime-policy-maintenance', protected_paths: ['.claude/hooks/x.mjs'], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: ['.agent/roles.json'], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: ['src/x.js'], justification: 'j' },
      { grant: 'runtime-hook-maintenance', protected_paths: ['.claude/hooks/x.mjs'] },
      { grant: 'runtime-hook-maintenance', protected_paths: ['.claude/hooks/x.mjs'], justification: 'j', extra: 1 },
      { grant: 'constructor', protected_paths: ['.claude/hooks/x.mjs'], justification: 'j' },
      'not an object',
    ]) {
      const d = invalid({ owner_role: 'workflow-authority', risk: 'r3', control_plane: cp })
      expect(d.allow, JSON.stringify(cp)).toBe(false)
      expect(d.reason, JSON.stringify(cp)).toMatch(/authorises nothing/)
    }
  })

  it('denies an otherwise-valid src/** contract when the ROLE or RISK is wrong', () => {
    const grant = { grant: 'runtime-hook-maintenance', protected_paths: ['.claude/hooks/x.mjs'], justification: 'j' }
    for (const over of [
      { owner_role: 'story-content', risk: 'r3' },
      { owner_role: 'product-app', risk: 'r3' },
      { owner_role: 'workflow-authority', risk: 'r1' },
      { owner_role: 'workflow-authority', risk: 'r0' },
      { owner_role: 'workflow-authority', risk: 'nonsense' },
    ]) {
      const d = invalid({ ...over, control_plane: grant })
      expect(d.allow, JSON.stringify(over)).toBe(false)
      expect(d.reason, JSON.stringify(over)).toMatch(/owner_role|risk of at least/)
    }
  })

  it('denies when allowed_paths or forbidden_paths has invalid shape or grammar', () => {
    for (const over of [
      { allowed_paths: ['**'] },
      { allowed_paths: ['../escape'] },
      { allowed_paths: ['src/*.js'] },
      { allowed_paths: 'src/**' },
      { allowed_paths: [42] },
      { forbidden_paths: ['**'] },
      { forbidden_paths: ['a/./b'] },
      { forbidden_paths: 'x' },
    ]) {
      const d = invalid(over)
      expect(d.allow, JSON.stringify(over)).toBe(false)
      expect(d.reason, JSON.stringify(over)).toMatch(/authorises nothing/)
    }
  })

  it('still allows the same write once the contract is valid again', () => {
    // The control: these denials must come from the contract being invalid, not
    // from the guard having become deny-all.
    const c = writeContract(contract())
    expect(run(call('src/thing.js'), { [BINDING_ENV]: bindingFor(c) }).allow).toBe(true)
  })
})

describe('where a relative file_path is anchored', () => {
  it('never arises in practice: the runtime hands the hook an absolute path', () => {
    // Pinned from a probe on Claude Code 2.1.258. A producer that passes
    // "relhere.txt" or "sub/relsub.txt" produces an ABSOLUTE, canonicalised
    // file_path in the hook event — the runtime resolves before the hook sees
    // it. This spec records the assumption so that if it ever stops holding,
    // the reason a later change starts failing is written down here.
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const env = { [BINDING_ENV]: bindingFor(c) }
    expect(run(call(path.join(ROOT, 'src/existing.js')), env).allow).toBe(true)
  })

  it('anchors a relative path to the event cwd, not blindly to the root', () => {
    // Defence in depth for the assumption above. If a relative path ever did
    // arrive, anchoring it to the root while the runtime anchored it to the cwd
    // would mean reasoning about a different file than the one written — and
    // that error's direction is an allow.
    const c = writeContract(contract({ allowed_paths: ['src/deep/**'] }))
    const env = { [BINDING_ENV]: bindingFor(c) }
    // "existing.js" from src/deep/ is src/deep/existing.js — in scope.
    writeFileSync(path.join(ROOT, 'src/deep/existing.js'), 'x')
    expect(run(call('existing.js', { cwd: path.join(ROOT, 'src/deep') }), env).allow).toBe(true)
    // The same spelling from the root is src/existing.js — NOT in scope.
    expect(run(call('existing.js', { cwd: ROOT }), env).allow).toBe(false)
  })

  it('denies a relative path whose cwd cannot be proved inside the repository', () => {
    const c = writeContract(contract({ allowed_paths: ['src/**'] }))
    const env = { [BINDING_ENV]: bindingFor(c) }
    for (const cwd of ['/tmp', '/definitely/not/here', path.join(ROOT, '..')]) {
      const d = run(call('existing.js', { cwd }), env)
      expect(d.allow, String(cwd)).toBe(false)
      expect(d.reason, String(cwd)).toMatch(/cwd/)
    }
  })
})
