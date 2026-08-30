import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  findContractViolations,
  computeDigest,
  canonicalise,
  covers,
  normalisePath,
  BINDING_FIELDS,
  OPTIONAL_FIELDS,
  PRODUCTION_EFFECTS,
  WRITE_SIDE_PRODUCTION_EFFECTS,
  RISK_LEVELS,
  pathGrammarError,
  TOKEN,
  ALWAYS_FORBIDDEN,
  TASKS_DIR,
} from './tools/verify-task-contracts.mjs'

// The task-contract format's own contract.
//
// The invariant worth the most here: an implementing agent must not be able to
// silently rewrite its own acceptance criteria or widen its own scope. Two
// mechanisms carry it, and both are driven through their failure paths below —
// the digest (rewrites cannot be silent) and the always-forbidden floor (a
// contract cannot grant authority over contracts or harness permissions).
//
// What is NOT claimed: that an agent is physically prevented from editing
// files. Nothing here is a hook. See .agent/tasks/README.md.

const PKG = JSON.parse(readFileSync('package.json', 'utf8'))

/** A contract that passes every rule, as a base for one-field mutations. */
const good = () => {
  const c = {
    id: 'example-task',
    goal: 'Do one well-defined thing.',
    owner_role: 'workflow-engineer',
    risk: 'r1',
    allowed_paths: ['src/**', 'docs/EXAMPLE.md'],
    forbidden_paths: ['src/secret/**'],
    non_goals: ['Anything to do with Gate 3'],
    acceptance_criteria: ['The thing is done and a test proves it'],
    verification: ['npm run verify:pr'],
    production_effect: 'none',
    dependencies: [],
    stop_conditions: ['The change would touch production data'],
  }
  c.contract_digest = computeDigest(c)
  return c
}

const violations = (c, opts) => findContractViolations(c, { fileName: 'example-task.json', ...opts })
const reseal = (c) => ({ ...c, contract_digest: computeDigest(c) })

describe('a well-formed contract passes', () => {
  it('the synthetic baseline has no violations', () => {
    expect(violations(good())).toEqual([])
  })

  it('a forbidden carve-out INSIDE an allowed path is normal, not a contradiction', () => {
    // allowed src/**, forbidden src/secret/** — the everyday shape. If this
    // were rejected the format would be unusable.
    const c = good()
    expect(violations(c).filter(v => /contradict|never take effect|both allowed/.test(v))).toEqual([])
  })
})

describe('required fields fail closed', () => {
  for (const field of BINDING_FIELDS) {
    it('rejects a contract missing ' + field, () => {
      const c = good()
      delete c[field]
      // Deleting a bound field also invalidates the digest; both are failures,
      // and the missing-field one must be reported by name.
      expect(violations(c).join()).toMatch(new RegExp('missing required field: ' + field))
    })
  }

  it('rejects an unknown field', () => {
    const c = reseal({ ...good(), sneaky_extra: true })
    expect(violations(c).join()).toMatch(/unknown field: sneaky_extra/)
  })

  it('allows annotation fields without re-sealing', () => {
    // notes/links are deliberately outside the digest: a contract nobody can
    // annotate without re-sealing is a contract nobody annotates.
    const c = good()
    const annotated = { ...c, notes: 'context added later', links: ['https://example.invalid'] }
    expect(annotated.contract_digest).toBe(c.contract_digest)
    expect(violations(annotated)).toEqual([])
    expect(OPTIONAL_FIELDS).toEqual(expect.arrayContaining(['notes', 'links']))
  })

  it('rejects a non-object', () => {
    expect(findContractViolations(null).join()).toMatch(/must be a JSON object/)
    expect(findContractViolations([]).join()).toMatch(/must be a JSON object/)
  })
})

describe('risk is closed to the canonical control-plane levels', () => {
  it('is exactly r0..r4, in order', () => {
    expect(RISK_LEVELS).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'])
  })

  it('accepts every canonical level', () => {
    for (const r of RISK_LEVELS) expect(violations(reseal({ ...good(), risk: r })), r).toEqual([])
  })

  it('rejects the invented values this format briefly carried', () => {
    // low/medium/high were guessed here before the real model was available.
    // A contract still carrying one must fail rather than be silently mapped.
    for (const bad of ['low', 'medium', 'high']) {
      expect(violations(reseal({ ...good(), risk: bad })).join(), bad)
        .toMatch(/risk must be one of r0, r1, r2, r3, r4/)
    }
  })

  it('rejects near-misses and out-of-range levels', () => {
    for (const bad of ['r5', 'r-1', 'R2', 'r', 'r10', 'tier-one', 'r2 ', '2', 'rr2']) {
      expect(violations(reseal({ ...good(), risk: bad })).join(), JSON.stringify(bad))
        .toMatch(/risk must be one of/)
    }
  })

  it('rejects a missing or non-string risk', () => {
    const c = good()
    delete c.risk
    expect(violations(c).join()).toMatch(/missing required field: risk/)
    for (const bad of [null, 2, [], {}]) {
      expect(violations(reseal({ ...good(), risk: bad })).join(), JSON.stringify(bad))
        .toMatch(/risk must be one of/)
    }
  })

  it('states the take-the-highest rule where someone choosing a level will read it', () => {
    // The rule only works if it is visible at the point of failure and in the
    // format doc — a level chosen from the bulk of a change rather than its
    // worst reach is the predictable mistake.
    expect(violations(reseal({ ...good(), risk: 'nope' })).join())
      .toMatch(/When several levels apply, take the highest/)
    const readme = readFileSync(TASKS_DIR + '/README.md', 'utf8')
    expect(readme).toMatch(/highest/i)
    for (const level of RISK_LEVELS) expect(readme, 'README omits ' + level).toContain('`' + level + '`')
  })

  it('stays orthogonal to production_effect', () => {
    // Different questions: risk is the authority the WORK carries,
    // production_effect the maximum effect it is PERMITTED to cause. Migration
    // code written but not applied is r3 / none — high-impact semantics, but
    // writing it touches nothing live. A docs typo on main is r0 /
    // deploy-on-merge.
    expect(violations(reseal({ ...good(), risk: 'r3', production_effect: 'none' }))).toEqual([])
    expect(violations(reseal({ ...good(), risk: 'r0', production_effect: 'deploy-on-merge' }))).toEqual([])
    expect(violations(reseal({ ...good(), risk: 'r4', production_effect: 'database' }))).toEqual([])
  })
})

describe('owner_role is constrained but NOT yet frozen', () => {
  // The role-enforcement PR defines and enforces the real taxonomy. A second
  // competing model invented here would have to be migrated away when it lands.
  it('is required', () => {
    const c = good()
    delete c.owner_role
    expect(violations(c).join()).toMatch(/missing required field: owner_role/)
  })

  it('requires a kebab-case token, rejecting free text', () => {
    for (const bad of ['Workflow Engineer', 'DOCS', 'a_b', '  ', 'role!']) {
      expect(violations(reseal({ ...good(), owner_role: bad })).join(), JSON.stringify(bad))
        .toMatch(/owner_role must be a lowercase kebab-case token/)
    }
  })

  it('accepts any well-formed token until the role layer closes it', () => {
    for (const v of ['workflow-engineer', 'docs', 'ops', 'whatever-the-role-layer-picks']) {
      expect(violations(reseal({ ...good(), owner_role: v })), v).toEqual([])
    }
    expect(TOKEN.test('workflow-engineer')).toBe(true)
  })

})

describe('production_effect is the MAXIMUM effect the task may cause', () => {
  // Definition: the maximum direct production effect this task is permitted to
  // cause, whether during execution or as an automatic consequence of merge.
  //
  // The earlier definition — "what merging does" — contradicted its own example
  // (an unapplied migration marked "database"). Writing migration code causes
  // no production effect until someone applies it.

  it('is exactly the six canonical values, including read-only', () => {
    expect(PRODUCTION_EFFECTS).toEqual([
      'none', 'read-only', 'deploy-on-merge', 'database', 'store-release', 'external-service',
    ])
  })

  it('accepts read-only', () => {
    // The value that was missing: a production audit that inspects live state
    // and mutates nothing had no honest way to say so — "none" understated the
    // access, every other value overstated it.
    expect(violations(reseal({ ...good(), production_effect: 'read-only' }))).toEqual([])
  })

  it('accepts every canonical value', () => {
    for (const fx of PRODUCTION_EFFECTS) {
      expect(violations(reseal({ ...good(), production_effect: fx })), fx).toEqual([])
    }
  })

  it('rejects arbitrary values', () => {
    for (const bad of ['probably-fine', 'readonly', 'read_only', 'READ-ONLY', 'write', 'db', 'prod', '', 'none ']) {
      expect(violations(reseal({ ...good(), production_effect: bad })).join(), JSON.stringify(bad))
        .toMatch(/production_effect must be one of/)
    }
  })

  it('rejects a missing or non-string value', () => {
    const c = good()
    delete c.production_effect
    expect(violations(c).join()).toMatch(/missing required field: production_effect/)
    for (const bad of [null, 3, [], {}]) {
      expect(violations(reseal({ ...good(), production_effect: bad })).join(), JSON.stringify(bad))
        .toMatch(/production_effect must be one of/)
    }
  })

  it('names the write-side values, so "split it" has something to point at', () => {
    expect(WRITE_SIDE_PRODUCTION_EFFECTS).toEqual(['database', 'store-release', 'external-service'])
    for (const fx of WRITE_SIDE_PRODUCTION_EFFECTS) expect(PRODUCTION_EFFECTS).toContain(fx)
    expect(WRITE_SIDE_PRODUCTION_EFFECTS).not.toContain('read-only')
    expect(WRITE_SIDE_PRODUCTION_EFFECTS).not.toContain('none')
  })

  it('the README documents the definition and every worked case', () => {
    const readme = readFileSync(TASKS_DIR + '/README.md', 'utf8')
    expect(readme).toMatch(/maximum direct production effect/i)
    expect(readme).toMatch(/during execution or as an automatic consequence of merge/i)
    for (const fx of PRODUCTION_EFFECTS) expect(readme, 'README omits ' + fx).toContain('`' + fx + '`')
    expect(readme).toMatch(/read-only production audit/i)
    expect(readme).toMatch(/Apply task/i)
    expect(readme).toMatch(/split/i)
  })

  it('the README no longer claims an unapplied migration is "database"', () => {
    // THE CONTRADICTION. It must be stated as none, and the only remaining
    // mentions of the old claim must be the correction itself.
    const readme = readFileSync(TASKS_DIR + '/README.md', 'utf8')
    expect(readme).toMatch(/Migration code only, explicitly not applied.*`none`/)
    expect(readme).not.toMatch(/written but not applied is `r3` with\s*`production_effect: "database"`/)
    expect(readme).not.toMatch(/unapplied migration.*→.*`database`/)
  })
})

describe('empty values that would mean "no constraint" are rejected', () => {
  it('rejects empty acceptance_criteria', () => {
    // "Anything counts as done" is not a default worth having.
    expect(violations(reseal({ ...good(), acceptance_criteria: [] })).join())
      .toMatch(/acceptance_criteria must not be empty/)
  })
  it('rejects empty allowed_paths', () => {
    expect(violations(reseal({ ...good(), allowed_paths: [] })).join())
      .toMatch(/allowed_paths must not be empty/)
  })
  it('rejects empty non_goals, verification and stop_conditions', () => {
    for (const f of ['non_goals', 'verification', 'stop_conditions']) {
      expect(violations(reseal({ ...good(), [f]: [] })).join()).toMatch(new RegExp(f + ' must not be empty'))
    }
  })
  it('allows forbidden_paths and dependencies to be empty, since empty is a statement', () => {
    expect(violations(reseal({ ...good(), forbidden_paths: [], dependencies: [] }))).toEqual([])
  })
  it('rejects a whitespace-only string in an array', () => {
    expect(violations(reseal({ ...good(), non_goals: ['   '] })).join()).toMatch(/non_goals must be an array/)
  })
})

describe('THE SCOPE FLOOR: a contract cannot widen its own authority', () => {
  for (const floor of ALWAYS_FORBIDDEN) {
    it('refuses allowed_paths naming ' + floor, () => {
      const c = reseal({ ...good(), allowed_paths: [floor] })
      expect(violations(c).join()).toMatch(/may never authorise/)
    })
  }

  it('refuses a parent subtree that would swallow the task contracts', () => {
    // .agent/** is valid grammar and must be caught by the FLOOR.
    expect(violations(reseal({ ...good(), allowed_paths: ['.agent/**'] })).join())
      .toMatch(/may never authorise/)
  })

  it('refuses the wildcard forms that used to slip past containment', () => {
    // THE ESCAPE HATCH. `.agent/tasks/*` and `.agent/*` both reach task
    // contracts, and neither is decidable by prefix logic that only knows
    // `/**` — so under a permissive grammar they were accepted and then
    // silently not analysed. The grammar now refuses them outright, which is
    // what makes the floor complete rather than best-effort.
    for (const evasion of ['.agent/tasks/*', '.agent/*', '.agent/tasks/*.json', '**/*.json', '**']) {
      const found = violations(reseal({ ...good(), allowed_paths: [evasion] })).join()
      expect(found, 'not rejected: ' + evasion).toMatch(/unsupported glob syntax|bare "\*\*"/)
    }
  })

  it('refuses even when the contract also forbids the same path', () => {
    // Belt-and-braces is not a reconciliation: naming it in allowed_paths at
    // all is the mistake, and adding it to forbidden_paths does not cure it.
    const c = reseal({
      ...good(),
      allowed_paths: ['.claude/settings.json'],
      forbidden_paths: ['.claude/settings.json'],
    })
    expect(violations(c).join()).toMatch(/may never authorise/)
  })

  it('still allows ordinary work under .claude that is not the permission file', () => {
    expect(violations(reseal({ ...good(), allowed_paths: ['.claude/commands/ship.md'] }))).toEqual([])
  })
})

describe('contradictory path permissions are rejected', () => {
  it('rejects a path that is both allowed and forbidden', () => {
    const c = reseal({ ...good(), allowed_paths: ['src/thing.js'], forbidden_paths: ['src/thing.js'] })
    expect(violations(c).join()).toMatch(/both allowed and forbidden/)
  })

  it('rejects an allowance entirely inside a forbidden path', () => {
    // allowed src/deep/**, forbidden src/** — the allowance can never fire.
    const c = reseal({ ...good(), allowed_paths: ['src/deep/**'], forbidden_paths: ['src/**'] })
    expect(violations(c).join()).toMatch(/can never take effect/)
  })

  it('rejects absolute paths and parent-directory escapes', () => {
    expect(violations(reseal({ ...good(), allowed_paths: ['/etc/passwd'] })).join())
      .toMatch(/is absolute/)
    expect(violations(reseal({ ...good(), allowed_paths: ['../other-repo/**'] })).join())
      .toMatch(/escapes the repository/)
  })

  it('accepts exactly two path forms and nothing else', () => {
    expect(pathGrammarError('src/App.jsx')).toBeNull()
    expect(pathGrammarError('src/**')).toBeNull()
    expect(pathGrammarError('docs/a/b/c.md')).toBeNull()
    for (const bad of ['*.js', 'a?b', 'x[0].js', 'a{b,c}', 'a\\b', 'C:/x', '**', 'src//a', ' src/a', './a', 'src/../etc']) {
      expect(pathGrammarError(bad), 'accepted: ' + bad).not.toBeNull()
    }
  })

  it('the floor is COMPLETE over the accepted grammar', () => {
    // Every accepted expression matches either exactly one path or exactly one
    // subtree, so containment against a floor entry is decidable in both
    // directions — there is no accepted form the floor can fail to see.
    for (const floor of ALWAYS_FORBIDDEN) {
      expect(pathGrammarError(floor), 'floor entry is not itself valid grammar: ' + floor).toBeNull()

      // Every expression that could reach this floor entry: the entry itself,
      // and each ANCESTOR DIRECTORY as a subtree. For a file entry the
      // directories are its parents only — ".claude/settings.json/**" is a
      // subtree under a regular file and can never match anything, so it is not
      // a route to the floor and not something the floor must catch.
      const isSubtree = floor.endsWith('/**')
      const body = isSubtree ? floor.slice(0, -3) : floor
      const segs = body.split('/')
      const dirDepth = isSubtree ? segs.length : segs.length - 1
      const routes = [floor]
      for (let i = 1; i <= dirDepth; i++) routes.push(segs.slice(0, i).join('/') + '/**')

      for (const p of routes) {
        expect(violations(reseal({ ...good(), allowed_paths: [p] })).join(), p)
          .toMatch(/may never authorise/)
      }
    }
  })

  it('covers() is directional', () => {
    expect(covers('src/**', 'src/deep/thing.js')).toBe(true)
    expect(covers('src/deep/thing.js', 'src/**')).toBe(false)
    expect(covers('**', 'anything/at/all')).toBe(true)
    expect(normalisePath('./src//a')).toBe('src/a')
  })
})

describe('verification and dependencies must resolve', () => {
  it('rejects an npm script that does not exist', () => {
    const c = reseal({ ...good(), verification: ['npm run verify:imaginary'] })
    expect(violations(c, { npmScripts: PKG.scripts }).join())
      .toMatch(/names an npm script that does not exist/)
  })

  it('accepts the real scripts', () => {
    const c = reseal({ ...good(), verification: ['npm run verify:pr', 'npm run verify:native'] })
    expect(violations(c, { npmScripts: PKG.scripts })).toEqual([])
  })

  it('rejects a dangling dependency', () => {
    const c = reseal({ ...good(), dependencies: ['no-such-task'] })
    expect(violations(c, { knownIds: ['example-task'] }).join())
      .toMatch(/dependency does not resolve/)
  })

  it('rejects a self-dependency', () => {
    const c = reseal({ ...good(), dependencies: ['example-task'] })
    expect(violations(c, { knownIds: ['example-task'] }).join()).toMatch(/cannot depend on itself/)
  })
})

describe('THE SEAL: rewrites cannot be silent', () => {
  it('rejects a contract with no digest', () => {
    const c = good()
    delete c.contract_digest
    expect(violations(c).join()).toMatch(/missing contract_digest/)
  })

  it('rejects a malformed digest', () => {
    expect(violations({ ...good(), contract_digest: 'nope' }).join())
      .toMatch(/must be a 64-character sha256/)
  })

  it('catches acceptance_criteria rewritten without re-sealing', () => {
    // The headline case: an agent quietly relaxing what "done" means.
    const c = good()
    c.acceptance_criteria = ['it compiles']
    expect(violations(c).join()).toMatch(/contract_digest does not match/)
  })

  it('catches allowed_paths widened without re-sealing', () => {
    const c = good()
    c.allowed_paths = ['src/**', 'docs/EXAMPLE.md', 'supabase/migrations/**']
    expect(violations(c).join()).toMatch(/contract_digest does not match/)
  })

  it('catches a change to EVERY binding field', () => {
    // If any bound field were left out of the digest, that field could be
    // rewritten silently — which is the whole failure this prevents.
    const mutate = {
      id: 'other-task',
      goal: 'something else',
      owner_role: 'docs',
      risk: 'high',
      allowed_paths: ['other/**'],
      forbidden_paths: [],
      non_goals: ['different'],
      acceptance_criteria: ['different'],
      verification: ['npm test'],
      production_effect: 'database',
      dependencies: ['x'],
      stop_conditions: ['different'],
    }
    for (const field of BINDING_FIELDS) {
      const c = { ...good(), [field]: mutate[field] }
      expect(violations(c).join(), 'digest does not cover ' + field)
        .toMatch(/contract_digest does not match/)
    }
  })

  it('accepts a deliberate edit that was re-sealed', () => {
    // Re-sealing is allowed — it is not a hidden act. The digest line changes
    // in the diff beside the changed terms, which is the point.
    const c = good()
    const edited = reseal({ ...c, acceptance_criteria: ['a new, explicit criterion'] })
    expect(violations(edited)).toEqual([])
    expect(edited.contract_digest).not.toBe(c.contract_digest)
  })

  it('is stable across key order — the digest tracks content, not formatting', () => {
    const c = good()
    const reordered = {}
    for (const k of Object.keys(c).sort().reverse()) reordered[k] = c[k]
    expect(computeDigest(reordered)).toBe(computeDigest(c))
    expect(violations(reordered)).toEqual([])
  })

  it('canonicalise sorts keys and ignores whitespace', () => {
    expect(canonicalise({ b: 1, a: [2, 3] })).toBe('{"a":[2,3],"b":1}')
  })
})

describe('--seal can never bless an invalid contract (end to end)', () => {
  // The one operation that WRITES is the one that must not launder a broken
  // contract into an apparently-valid one. A digest over a contract that
  // authorises .agent/tasks/** would make it pass every later check — the seal
  // would be certifying the escalation it exists to prevent.
  //
  // Real subprocess, real files: the pre-flight/refuse/re-validate ordering is
  // a property of the CLI, not of any pure function.
  const EVIL = TASKS_DIR + '/seal-guard-probe.json'
  const evilContract = (extra = {}) => JSON.stringify({
    id: 'seal-guard-probe',
    goal: 'Attempt to widen my own authority.',
    owner_role: 'workflow-engineer',
    risk: 'r1',
    allowed_paths: ['.agent/tasks/**'],
    forbidden_paths: [],
    non_goals: ['nothing'],
    acceptance_criteria: ['it worked'],
    verification: ['npm test'],
    production_effect: 'none',
    dependencies: [],
    stop_conditions: ['never'],
    ...extra,
  }, null, 2) + '\n'

  const seal = () => spawnSync('node', ['tools/verify-task-contracts.mjs', '--seal'], { encoding: 'utf8' })
  const cleanup = () => { try { rmSync(EVIL) } catch { /* already gone */ } }

  it('refuses to seal a self-authorising contract, and leaves it byte-for-byte unchanged', () => {
    const before = evilContract()
    writeFileSync(EVIL, before)
    try {
      const r = seal()
      expect(r.status, 'seal should have failed').toBe(1)
      expect(r.stderr).toMatch(/may never authorise/)
      expect(r.stderr).toMatch(/refusing to seal — no files were modified/)
      expect(readFileSync(EVIL, 'utf8'), 'the file was modified').toBe(before)
    } finally { cleanup() }
  })

  it('leaves OTHER, valid contracts untouched when one is invalid — sealing is all or nothing', () => {
    const committed = readdirSync(TASKS_DIR).filter(n => n.endsWith('.json') && !n.startsWith('seal-guard'))
    const snapshot = committed.map(n => [n, readFileSync(TASKS_DIR + '/' + n, 'utf8')])
    writeFileSync(EVIL, evilContract())
    try {
      expect(seal().status).toBe(1)
      for (const [n, text] of snapshot) {
        expect(readFileSync(TASKS_DIR + '/' + n, 'utf8'), n + ' was modified').toBe(text)
      }
    } finally { cleanup() }
  })

  it('refuses on any semantic violation, not only the floor', () => {
    for (const broken of [
      { allowed_paths: ['src/**'], acceptance_criteria: [] },
      { allowed_paths: ['*.js'] },
      { allowed_paths: ['src/**'], verification: ['npm run verify:imaginary'] },
      { allowed_paths: ['src/**'], dependencies: ['no-such-task'] },
      { allowed_paths: ['src/deep/**'], forbidden_paths: ['src/**'] },
      { allowed_paths: ['src/**'], risk: 'NOT A TOKEN' },
    ]) {
      const before = evilContract(broken)
      writeFileSync(EVIL, before)
      try {
        expect(seal().status, JSON.stringify(broken)).toBe(1)
        expect(readFileSync(EVIL, 'utf8'), JSON.stringify(broken)).toBe(before)
      } finally { cleanup() }
    }
  })

  it('DOES seal a contract that is valid apart from its digest', () => {
    // The legitimate use, which must keep working — otherwise the refusal above
    // is just a broken feature rather than a guard.
    const valid = evilContract({ allowed_paths: ['src/**'] })
    writeFileSync(EVIL, valid)
    try {
      const r = seal()
      expect(r.status, r.stderr).toBe(0)
      const after = JSON.parse(readFileSync(EVIL, 'utf8'))
      expect(after.contract_digest).toMatch(/^[0-9a-f]{64}$/)
      expect(findContractViolations(after, { fileName: 'seal-guard-probe.json', npmScripts: PKG.scripts })).toEqual([])
    } finally { cleanup() }
  })

  it('re-validates the written result before reporting success', () => {
    // STRUCTURAL, not behavioural, and deliberately so: this branch is only
    // reachable if the seal-writing itself is buggy, which no fixture can
    // produce without introducing the bug. A mutation check confirmed the
    // behavioural specs do NOT cover its removal — so it is asserted here
    // against the source rather than left silently unprotected.
    const src = readFileSync('tools/verify-task-contracts.mjs', 'utf8')
    const sealBlock = src.slice(src.indexOf('const preflight = await loadAndCheck'))
    const writeAt = sealBlock.indexOf('await writeFile(')
    const recheckAt = sealBlock.indexOf('loadAndCheck({ skipDigest: false })')
    expect(writeAt, 'seal does not write').toBeGreaterThan(-1)
    expect(recheckAt, 'seal does not re-validate after writing').toBeGreaterThan(-1)
    expect(recheckAt, 're-validation must come AFTER the write').toBeGreaterThan(writeAt)
    const tail = sealBlock.slice(recheckAt)
    expect(tail, 're-validation result must gate success').toMatch(/after\.problems\.length/)
    expect(tail).toMatch(/process\.exitCode = 1/)
  })

  it('plain validation still passes once the probe is gone', () => {
    const r = spawnSync('node', ['tools/verify-task-contracts.mjs'], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
  })
})

describe('the contracts committed to this repository', () => {
  const dir = TASKS_DIR
  const files = existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.json')) : []

  it('the directory exists and holds at least one contract', () => {
    expect(existsSync(dir)).toBe(true)
    expect(files.length).toBeGreaterThan(0)
  })

  it('every committed contract is valid, sealed and consistent', () => {
    const parsed = files.map(n => ({ n, c: JSON.parse(readFileSync(dir + '/' + n, 'utf8')) }))
    const knownIds = parsed.map(p => p.c.id)
    const problems = parsed.flatMap(p =>
      findContractViolations(p.c, { fileName: p.n, knownIds, npmScripts: PKG.scripts }))
    expect(problems, problems.join('; ')).toEqual([])
  })

  it('is documented', () => {
    expect(existsSync(dir + '/README.md')).toBe(true)
    const readme = readFileSync(dir + '/README.md', 'utf8')
    // The README must not overclaim what this layer provides.
    expect(readme).toMatch(/tamper-EVIDENCE, not tamper-proofing/)
    for (const field of BINDING_FIELDS) expect(readme, 'README omits ' + field).toContain(field)
  })

  it('every committed contract carries a canonical risk level', () => {
    for (const n of files) {
      const c = JSON.parse(readFileSync(dir + '/' + n, 'utf8'))
      expect(RISK_LEVELS, n + ' has risk ' + c.risk).toContain(c.risk)
    }
  })

  it('every committed contract carries a canonical production_effect', () => {
    for (const n of files) {
      const c = JSON.parse(readFileSync(dir + '/' + n, 'utf8'))
      expect(PRODUCTION_EFFECTS, n + ' has production_effect ' + c.production_effect)
        .toContain(c.production_effect)
    }
  })

  it('dynamic-ref-writers is r3, because it changes workflow authority', () => {
    // CI/workflow authority is r3 by the model, even though merging the task
    // itself has no production effect — the two fields answer different
    // questions and this contract is the worked example of that.
    const c = JSON.parse(readFileSync(dir + '/dynamic-ref-writers.json', 'utf8'))
    expect(c.risk).toBe('r3')
    // none, and it stays none under the corrected definition: the task neither
    // runs against production nor deploys learner-facing code on merge.
    expect(c.production_effect).toBe('none')
  })

  it('has a verify:tasks script that points at the validator', () => {
    expect(PKG.scripts['verify:tasks']).toBe('node tools/verify-task-contracts.mjs')
  })
})
