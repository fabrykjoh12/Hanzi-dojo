import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  findContractViolations,
  computeDigest,
  canonicalise,
  covers,
  normalisePath,
  BINDING_FIELDS,
  REQUIRED_BINDING_FIELDS,
  OPTIONAL_BINDING_FIELDS,
  OPTIONAL_FIELDS,
  PROTECTED_CONTROL_PLANE,
  CONTROL_PLANE_GRANTS,
  CONTROL_PLANE_MIN_RISK,
  controlPlaneViolations,
  controlPlaneRoleIn,
  CONTROL_PLANE_ROLE,
  ROLE_MODEL,
  grantedProtectedPaths,
  effectiveAllowedPaths,
  PRODUCTION_EFFECTS,
  WRITE_SIDE_PRODUCTION_EFFECTS,
  RISK_LEVELS,
  pathGrammarError,
  OWNER_ROLES,
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
    owner_role: 'workflow-authority',
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
  for (const field of REQUIRED_BINDING_FIELDS) {
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

describe('owner_role is closed to the canonical role model', () => {
  // The full role-model specs live in role-model.test.mjs. What belongs HERE is
  // only the contract format's side of it: the field is required, and its
  // vocabulary comes from .agent/roles.json rather than from this file.
  it('is required', () => {
    const c = good()
    delete c.owner_role
    expect(violations(c).join()).toMatch(/missing required field: owner_role/)
  })

  it('rejects free text and any role outside the model', () => {
    for (const bad of ['Workflow Engineer', 'DOCS', 'a_b', '  ', 'role!', 'docs', 'ops',
      'workflow-engineer', 'whatever-the-role-layer-picks']) {
      expect(violations(reseal({ ...good(), owner_role: bad })).join(), JSON.stringify(bad))
        .toMatch(/owner_role must be one of/)
    }
  })

  it('accepts every canonical role, and the enum is the one read from roles.json', () => {
    for (const role of OWNER_ROLES) {
      expect(violations(reseal({ ...good(), owner_role: role })), role).toEqual([])
    }
    // Well-formed kebab-case is no longer sufficient — closure is the point.
    expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test('workflow-engineer')).toBe(true)
    expect(OWNER_ROLES).not.toContain('workflow-engineer')
  })

  it('is covered by the digest, so a role cannot be swapped silently', () => {
    const c = good()
    const swapped = { ...c, owner_role: 'privacy-release' }
    expect(swapped.owner_role).not.toBe(c.owner_role)
    expect(violations(swapped).join()).toMatch(/contract_digest does not match/)
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
    // .claude/settings.json now refuses as a PROTECTED path rather than a floor
    // path — the rule that catches it moved, the refusal did not.
    const c = reseal({
      ...good(),
      allowed_paths: ['.claude/settings.json'],
      forbidden_paths: ['.claude/settings.json'],
    })
    expect(violations(c).join()).toMatch(/may not authorise the protected control-plane path/)
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
      owner_role: 'qa',
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
    for (const field of REQUIRED_BINDING_FIELDS) {
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
    owner_role: 'workflow-authority',
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
    // Only the REQUIRED fields. The README lives at .agent/tasks/README.md,
    // which is inside the Tier 0 floor, so no contract may update it to mention
    // an optional field added later — asserting it here would make the schema
    // unextendable for the sake of a doc nobody is allowed to edit.
    for (const field of REQUIRED_BINDING_FIELDS) expect(readme, 'README omits ' + field).toContain(field)
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

// ---------------------------------------------------------------------------
// THE PROTECTED CONTROL PLANE
//
// A second tier between "ordinary" and "never". Tier 0 stays absolute; Tier 1
// is unreachable through allowed_paths and reachable only through a
// digest-covered grant on a workflow-authority contract.
//
// The rule these specs exist to keep honest: a grant widens scope only when the
// WHOLE declaration checks out. Half-understood authority is authority nobody
// reviewed.
// ---------------------------------------------------------------------------

describe('optional binding fields: the schema-evolution rule', () => {
  it('separates required from optional, and binds both', () => {
    expect(REQUIRED_BINDING_FIELDS).not.toContain('control_plane')
    expect(OPTIONAL_BINDING_FIELDS).toEqual(['control_plane'])
    expect(BINDING_FIELDS).toEqual([...REQUIRED_BINDING_FIELDS, ...OPTIONAL_BINDING_FIELDS])
    // Annotation is a different thing entirely and stays outside the digest.
    for (const f of OPTIONAL_BINDING_FIELDS) expect(OPTIONAL_FIELDS).not.toContain(f)
  })

  it('leaves EVERY contract already on disk byte-identical', () => {
    // The compatibility guarantee, against the real registry rather than a
    // fixture. Folding an optional field in unconditionally would re-seal all
    // of these — and repairing that means writing .agent/tasks/**, which is
    // Tier 0 and which no contract may authorise. The schema would have been
    // unextendable.
    const dir = '.agent/tasks'
    const names = readdirSync(dir).filter(n => n.endsWith('.json'))
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) {
      const c = JSON.parse(readFileSync(dir + '/' + n, 'utf8'))
      expect(computeDigest(c), n + ' was re-sealed by adding an optional field').toBe(c.contract_digest)
    }
  })

  it('an absent optional field contributes nothing to the digest', () => {
    const c = good()
    expect('control_plane' in c).toBe(false)
    const explicitlyAbsent = { ...c }
    expect(computeDigest(explicitlyAbsent)).toBe(c.contract_digest)
  })

  it('a PRESENT optional field is bound, including an explicit null', () => {
    // hasOwnProperty, not truthiness: `"control_plane": null` is something
    // someone wrote down, and it must move the digest.
    const c = good()
    expect(computeDigest({ ...c, control_plane: null })).not.toBe(c.contract_digest)
    expect(computeDigest({ ...c, control_plane: undefined })).not.toBe(c.contract_digest)
  })

  it('changing, widening or removing a grant moves the digest', () => {
    const cp = (paths) => ({ grant: 'runtime-policy-maintenance', protected_paths: paths, justification: 'j' })
    const base = good()
    const one = { ...base, control_plane: cp(['.claude/settings.json']) }
    const two = { ...base, control_plane: cp(['.claude/settings.json', '.claude/hooks/**']) }
    const other = { ...base, control_plane: { ...cp(['.claude/settings.json']), justification: 'different' } }
    const digests = [base, one, two, other].map(computeDigest)
    expect(new Set(digests).size, 'each variant must have its own digest').toBe(4)
  })
})

describe('the Tier 1 registry is well-formed', () => {
  it('is exactly the paths the runtime work needs, and no wildcard', () => {
    expect(PROTECTED_CONTROL_PLANE).toEqual(['.claude/settings.json', '.claude/hooks/**'])
    for (const p of PROTECTED_CONTROL_PLANE) {
      expect(pathGrammarError(p), p + ' must obey the decidable grammar').toBeNull()
    }
  })

  it('does NOT yet contain .claude/agents/**, and does not pretend otherwise', () => {
    // Sequencing, not a safety claim. Adding it here would retroactively
    // invalidate fresh-context-reviewer, a contract sealed and merged in PR
    // #229 whose allowed_paths legitimately names an agent definition — and
    // repairing that needs Tier 0 write authority no contract has.
    expect(PROTECTED_CONTROL_PLANE).not.toContain('.claude/agents/**')
    const reviewer = JSON.parse(readFileSync('.agent/tasks/fresh-context-reviewer.json', 'utf8'))
    expect(reviewer.allowed_paths).toContain('.claude/agents/fresh-context-reviewer.md')
    expect(
      findContractViolations(reviewer, { fileName: 'fresh-context-reviewer.json' }),
      'the historical contract must still validate',
    ).toEqual([])
  })

  it('is disjoint from the absolute floor', () => {
    for (const t of PROTECTED_CONTROL_PLANE) {
      for (const f of ALWAYS_FORBIDDEN) {
        expect(covers(f, t) || covers(t, f), t + ' overlaps floor ' + f).toBe(false)
      }
    }
  })

  it('keeps Tier 0 intact — settings.json moved tier, nothing left the floor', () => {
    expect(ALWAYS_FORBIDDEN).toEqual([
      '.agent/tasks/**', '.agent/roles.json', '.claude/settings.local.json', '.git/**',
    ])
    expect(ALWAYS_FORBIDDEN).not.toContain('.claude/settings.json')
    expect(PROTECTED_CONTROL_PLANE).toContain('.claude/settings.json')
  })

  it('maps every grant inside the tier, and NO grant to the whole of it', () => {
    // The property that makes a grant a grant. If one grant reached every path
    // in the tier, "grant" would be a synonym for "the tier", and the
    // grant/path check could never fire — closed in name only.
    expect(Object.keys(CONTROL_PLANE_GRANTS)).toEqual(['runtime-policy-maintenance'])
    for (const [name, paths] of Object.entries(CONTROL_PLANE_GRANTS)) {
      expect(paths.length, name).toBeGreaterThan(0)
      for (const p of paths) expect(PROTECTED_CONTROL_PLANE, name).toContain(p)
      expect(paths.length, name + ' reaches the entire tier').toBeLessThan(PROTECTED_CONTROL_PLANE.length)
    }
  })

  it('leaves a tier path reachable by no grant at all — protected, not authorisable yet', () => {
    // .claude/hooks/** is the case today. That is the difference between the
    // tier and the floor: the floor is unauthorisable in principle; a hooks
    // grant simply does not exist yet, and would arrive as its own change.
    const reachable = new Set(Object.values(CONTROL_PLANE_GRANTS).flat())
    const unreachable = PROTECTED_CONTROL_PLANE.filter(p => !reachable.has(p))
    expect(unreachable).toEqual(['.claude/hooks/**'])
    const c = reseal({
      ...good(), owner_role: 'workflow-authority', risk: 'r3',
      control_plane: {
        grant: 'runtime-policy-maintenance',
        protected_paths: ['.claude/hooks/guard.mjs'],
        justification: 'j',
      },
    })
    expect(violations(c).join()).toMatch(/does not authorise ".claude\/hooks\/guard.mjs"/)
    expect(grantedProtectedPaths(c)).toEqual([])
  })

  it('no grant reaches the floor', () => {
    for (const paths of Object.values(CONTROL_PLANE_GRANTS)) {
      for (const p of paths) {
        for (const f of ALWAYS_FORBIDDEN) expect(covers(f, p)).toBe(false)
      }
    }
  })
})

describe('the grant is the only spelling of control-plane authority', () => {
  const granted = (over = {}) => reseal({
    ...good(),
    owner_role: 'workflow-authority',
    risk: 'r3',
    control_plane: {
      grant: 'runtime-policy-maintenance',
      protected_paths: ['.claude/settings.json'],
      justification: 'installs the runtime path guard',
      ...over,
    },
  })

  it('accepts a well-formed grant', () => {
    expect(violations(granted())).toEqual([])
    expect(grantedProtectedPaths(granted())).toEqual(['.claude/settings.json'])
    expect(effectiveAllowedPaths(granted())).toContain('.claude/settings.json')
  })

  it('rejects the same authority spelled through allowed_paths', () => {
    for (const p of PROTECTED_CONTROL_PLANE) {
      const c = reseal({ ...good(), allowed_paths: [p] })
      expect(violations(c).join(), p).toMatch(/may not authorise the protected control-plane path/)
    }
  })

  it('rejects a parent subtree that would swallow a protected path', () => {
    expect(violations(reseal({ ...good(), allowed_paths: ['.claude/**'] })).join())
      .toMatch(/may not authorise the protected control-plane path/)
  })

  it('rejects declaring the same path in both places', () => {
    const c = reseal({
      ...good(), owner_role: 'workflow-authority', risk: 'r3',
      allowed_paths: ['.claude/settings.json'],
      control_plane: { grant: 'runtime-policy-maintenance', protected_paths: ['.claude/settings.json'], justification: 'j' },
    })
    // Exactly one message, from the allowed_paths side. There is deliberately
    // no second check on this ground inside controlPlaneViolations: it could
    // never be the operative one, and dead validation reads like protection.
    expect(violations(c).join()).toMatch(/may not authorise the protected control-plane path/)
  })

  it('still allows ordinary work under .claude that is not protected', () => {
    expect(violations(reseal({ ...good(), allowed_paths: ['.claude/commands/ship.md'] }))).toEqual([])
    expect(violations(reseal({ ...good(), allowed_paths: ['.claude/agents/x.md'] }))).toEqual([])
  })
})

describe('a grant fails closed on every malformation', () => {
  const withCp = (cp, over = {}) => reseal({
    ...good(), owner_role: 'workflow-authority', risk: 'r3', ...over, control_plane: cp,
  })
  const bad = (cp, over) => violations(withCp(cp, over)).join()
  const ok = { grant: 'runtime-policy-maintenance', protected_paths: ['.claude/settings.json'], justification: 'j' }

  it('rejects a non-object', () => {
    for (const cp of [null, 'x', 42, [], true]) {
      expect(bad(cp), JSON.stringify(cp)).toMatch(/control_plane must be an object/)
    }
  })

  it('rejects an unknown field inside the declaration', () => {
    expect(bad({ ...ok, sneaky: true })).toMatch(/control_plane: unknown field: sneaky/)
  })

  it('rejects an unknown grant', () => {
    for (const g of ['control-plane-all', 'agent-definition-maintenance', '', null, 42, [], {}]) {
      expect(bad({ ...ok, grant: g }), JSON.stringify(g)).toMatch(/control_plane\.grant must be one of/)
    }
  })

  it('rejects a grant inherited from Object.prototype, and does not throw on one', () => {
    // A bare CONTROL_PLANE_GRANTS[grant] lookup resolves "constructor" to a
    // function, walks past the unknown-grant guard, and dies on .some() —
    // taking the validator, the review driver and the CLI down with it. A
    // crash is not a rejection: the vocabulary is closed to written keys only.
    for (const g of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
      expect(() => bad({ ...ok, grant: g }), g).not.toThrow()
      expect(bad({ ...ok, grant: g }), g).toMatch(/control_plane\.grant must be one of/)
      expect(grantedProtectedPaths(withCp({ ...ok, grant: g })), g).toEqual([])
    }
  })

  it('rejects a tier path the grant does not map to, naming the grant', () => {
    // Distinct from the tier check: this path IS inside Tier 1. What it is
    // outside is this grant's own reach.
    const found = bad({ ...ok, protected_paths: ['.claude/hooks/guard.mjs'] })
    expect(found).toMatch(/does not authorise/)
    expect(found).toMatch(/it reaches only/)
    expect(found).not.toMatch(/not inside the protected control plane/)
  })

  it('rejects a granted path the contract also forbids', () => {
    // Dead authority. Mechanical review tests forbidden_paths before scope, so
    // the grant could never take effect — the same contradiction allowed_paths
    // is already checked for, one tier up.
    expect(bad(ok, { forbidden_paths: ['.claude/settings.json'] })).toMatch(/can never take effect/)
    expect(bad(ok, { forbidden_paths: ['.claude/**'] })).toMatch(/can never take effect/)
    expect(grantedProtectedPaths(withCp(ok, { forbidden_paths: ['.claude/settings.json'] }))).toEqual([])
  })

  it('rejects a key that is not one of the three', () => {
    // `activation` was briefly accepted here and read by nothing. A field that
    // is sealed into the digest but never consulted invites an author to
    // believe it constrains the grant; the schema stays closed to what is used.
    for (const key of ['activation', 'expires', 'scope']) {
      expect(bad({ ...ok, [key]: 'x' }), key).toMatch(new RegExp('unknown field: ' + key))
    }
  })

  it('rejects a path the grant does not reach', () => {
    // The grant is not a label that unlocks the tier.
    expect(bad({ ...ok, protected_paths: ['.claude/agents/x.md'] }))
      .toMatch(/not inside the protected control plane/)
  })

  it('rejects any Tier 0 path, whatever the grant says', () => {
    for (const f of ALWAYS_FORBIDDEN) {
      const found = bad({ ...ok, protected_paths: [f] })
      expect(found, f).toMatch(/absolute floor|not inside the protected control plane/)
    }
  })

  it('rejects a path that fails the decidable grammar', () => {
    for (const p of ['.claude/settings.*', '.claude/*', '**', '../escape', '/abs/path']) {
      expect(bad({ ...ok, protected_paths: [p] }), p).not.toEqual('')
    }
  })

  it('rejects a malformed or empty path list', () => {
    for (const paths of [[], 'x', null, undefined, [''], [42]]) {
      expect(bad({ ...ok, protected_paths: paths }), JSON.stringify(paths))
        .toMatch(/protected_paths must be a non-empty array/)
    }
  })

  it('rejects a missing justification', () => {
    expect(bad({ grant: ok.grant, protected_paths: ok.protected_paths })).toMatch(/justification/)
    expect(bad({ ...ok, justification: '   ' })).toMatch(/justification/)
  })

  it('rejects any role but workflow-authority', () => {
    for (const role of ['product-app', 'story-content', 'scheduler-db', 'qa', 'reviewer', 'integrator']) {
      expect(bad(ok, { owner_role: role }), role).toMatch(/requires owner_role "workflow-authority"/)
    }
  })

  it('rejects a risk below the floor, and accepts r3 and r4', () => {
    expect(CONTROL_PLANE_MIN_RISK).toBe('r3')
    for (const risk of ['r0', 'r1', 'r2']) {
      expect(bad(ok, { risk }), risk).toMatch(/requires risk of at least r3/)
    }
    for (const risk of ['r3', 'r4']) {
      expect(violations(withCp(ok, { risk })), risk).toEqual([])
    }
  })

  it('WIDENS NOTHING when the declaration is invalid', () => {
    // The property that matters most: a grant nobody could validate must not
    // quietly extend scope. Fail closed, not fail partial.
    for (const cp of [
      { ...ok, grant: 'control-plane-all' },
      { ...ok, protected_paths: ['.agent/roles.json'] },
      { ...ok, justification: '' },
      null,
    ]) {
      expect(grantedProtectedPaths(withCp(cp)), JSON.stringify(cp)).toEqual([])
      expect(effectiveAllowedPaths(withCp(cp))).toEqual(good().allowed_paths)
    }
    for (const over of [{ owner_role: 'product-app' }, { risk: 'r1' }]) {
      expect(grantedProtectedPaths(withCp(ok, over)), JSON.stringify(over)).toEqual([])
    }
  })

  it('yields nothing at all when there is no declaration', () => {
    expect(controlPlaneViolations(good())).toEqual([])
    expect(grantedProtectedPaths(good())).toEqual([])
    expect(effectiveAllowedPaths(good())).toEqual(good().allowed_paths)
    expect(controlPlaneViolations(null)).toEqual([])
  })
})

describe('the control-plane role is derived from the role model, never restated', () => {
  const role = (id, over = {}) => ({ id, purpose: 'Owns something.', authority: ['A thing'], ...over })

  it('resolves to exactly one role in the real role model', () => {
    expect(CONTROL_PLANE_ROLE).toBe(controlPlaneRoleIn(ROLE_MODEL))
    expect(typeof CONTROL_PLANE_ROLE).toBe('string')
    expect(OWNER_ROLES).toContain(CONTROL_PLANE_ROLE)
  })

  it('reads the claim from purpose or from the authority list', () => {
    expect(controlPlaneRoleIn({ roles: [role('a', { purpose: 'Owns control-plane rules.' }), role('b')] })).toBe('a')
    expect(controlPlaneRoleIn({ roles: [role('a'), role('b', { authority: ['The control plane'] })] })).toBe('b')
  })

  it('REFUSES to guess when the claim is ambiguous or absent', () => {
    // Could not establish is never authorised. A null holder means no contract
    // may carry a grant at all — the safe direction, and loud for anyone who
    // does carry one, because their contract stops validating.
    const two = { roles: [role('a', { purpose: 'control-plane' }), role('b', { purpose: 'control plane' })] }
    expect(controlPlaneRoleIn(two)).toBeNull()
    expect(controlPlaneRoleIn({ roles: [role('a'), role('b')] })).toBeNull()
    for (const junk of [null, undefined, {}, { roles: 'x' }, { roles: [] }]) {
      expect(controlPlaneRoleIn(junk), JSON.stringify(junk)).toBeNull()
    }
    expect(controlPlaneRoleIn({ roles: [{ purpose: 'the control plane' }] }), 'a claim without an id').toBeNull()
  })

  it('rejects a grant held by any role that is not the derived one', () => {
    for (const other of OWNER_ROLES.filter(r => r !== CONTROL_PLANE_ROLE)) {
      const c = reseal({
        ...good(), owner_role: other, risk: 'r3',
        control_plane: { grant: 'runtime-policy-maintenance', protected_paths: ['.claude/settings.json'], justification: 'j' },
      })
      expect(violations(c).join(), other).toMatch(/control_plane requires owner_role/)
      expect(grantedProtectedPaths(c)).toEqual([])
    }
  })
})
