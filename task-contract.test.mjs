import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import {
  findContractViolations,
  computeDigest,
  canonicalise,
  covers,
  normalisePath,
  BINDING_FIELDS,
  OPTIONAL_FIELDS,
  OWNER_ROLES,
  RISK_LEVELS,
  PRODUCTION_EFFECTS,
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
    risk: 'low',
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

describe('enums are closed', () => {
  it('rejects an owner_role nobody defined', () => {
    expect(violations(reseal({ ...good(), owner_role: 'wizard' })).join()).toMatch(/owner_role must be one of/)
  })
  it('rejects an unknown risk level', () => {
    expect(violations(reseal({ ...good(), risk: 'catastrophic' })).join()).toMatch(/risk must be one of/)
  })
  it('rejects an unknown production_effect', () => {
    expect(violations(reseal({ ...good(), production_effect: 'probably-fine' })).join())
      .toMatch(/production_effect must be one of/)
  })
  it('accepts every declared enum value', () => {
    for (const role of OWNER_ROLES) expect(violations(reseal({ ...good(), owner_role: role }))).toEqual([])
    for (const risk of RISK_LEVELS) expect(violations(reseal({ ...good(), risk }))).toEqual([])
    for (const fx of PRODUCTION_EFFECTS) expect(violations(reseal({ ...good(), production_effect: fx }))).toEqual([])
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

  it('refuses a broad glob that would swallow the task contracts', () => {
    // The realistic escalation: not naming .agent/tasks/** outright, but
    // claiming `**` or `.agent/**` and inheriting it.
    for (const broad of ['**', '.agent/**']) {
      expect(violations(reseal({ ...good(), allowed_paths: [broad] })).join(), broad)
        .toMatch(/may never authorise/)
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
      .toMatch(/must be repository-relative/)
    expect(violations(reseal({ ...good(), allowed_paths: ['../other-repo/**'] })).join())
      .toMatch(/must not escape the repository/)
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

  it('has a verify:tasks script that points at the validator', () => {
    expect(PKG.scripts['verify:tasks']).toBe('node tools/verify-task-contracts.mjs')
  })
})
