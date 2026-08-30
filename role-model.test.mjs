import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  ROLE_MODEL,
  OWNER_ROLES,
  ROLES_FILE,
  ALWAYS_FORBIDDEN,
  findContractViolations,
  computeDigest,
} from './tools/verify-task-contracts.mjs'

// The canonical role model.
//
// A role is an authority DOMAIN — what kind of work this is and who may own it.
// It is NOT a permission: no role lets a task exceed its own contract.
//
// .agent/roles.json is the ONE canonical source. Nothing here restates the list
// — not even to "pin" it. A second hand-maintained enum in the tests is the
// same drift risk as one in the validator, and worse, because it would make the
// tests agree with themselves while disagreeing with the model. Everything
// below iterates OWNER_ROLES / ROLE_MODEL.roles. Individual role ids appear
// only where a specific boundary is being proved.
//
// This layer defines and validates. It does not enforce: there is no hook, no
// reviewer agent, no dispatch. Nothing selects a role for you and nothing stops
// an agent working outside one.

const EXPECTED_ROLE_COUNT = 8

const VALIDATOR = 'tools/verify-task-contracts.mjs'
const VALIDATOR_SRC = readFileSync(VALIDATOR, 'utf8')
const ROLES_RAW = readFileSync(ROLES_FILE, 'utf8')
const PKG = JSON.parse(readFileSync('package.json', 'utf8'))

const good = () => {
  const c = {
    id: 'example-task',
    goal: 'Do one well-defined thing.',
    owner_role: OWNER_ROLES[0],
    risk: 'r1',
    allowed_paths: ['src/**'],
    forbidden_paths: [],
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
const violations = (c) => findContractViolations(c, { fileName: 'example-task.json', npmScripts: PKG.scripts })
const reseal = (c) => ({ ...c, contract_digest: computeDigest(c) })

describe('the taxonomy this version ships', () => {
  it('has exactly eight roles', () => {
    // The COUNT is pinned, not the list. Adding or removing a role is a
    // deliberate governance change and should have to touch this number.
    expect(OWNER_ROLES.length).toBe(EXPECTED_ROLE_COUNT)
  })

  it('has unique, well-formed ids', () => {
    expect(new Set(OWNER_ROLES).size).toBe(OWNER_ROLES.length)
    for (const id of OWNER_ROLES) {
      expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id), 'malformed role id: ' + id).toBe(true)
    }
  })

  it('accepts every role it declares', () => {
    for (const role of OWNER_ROLES) {
      expect(violations(reseal({ ...good(), owner_role: role })), role).toEqual([])
    }
  })

  it('rejects an invented role', () => {
    for (const bad of ['devops', 'fullstack', 'content', 'security', 'anything-else']) {
      expect(OWNER_ROLES, 'fixture is not actually invented: ' + bad).not.toContain(bad)
      expect(violations(reseal({ ...good(), owner_role: bad })).join(), bad)
        .toMatch(/owner_role must be one of/)
    }
  })

  it('rejects the placeholder this format briefly carried', () => {
    // workflow-engineer was PR4's stand-in while the taxonomy was undecided. A
    // contract still carrying it must fail rather than be silently mapped onto
    // a real role — the migration is a visible, re-sealed change.
    expect(violations(reseal({ ...good(), owner_role: 'workflow-engineer' })).join())
      .toMatch(/owner_role must be one of/)
  })

  it('rejects near-misses in spelling and case', () => {
    // Derived from whatever the first role is, so this cannot rot if ids change.
    const real = OWNER_ROLES[0]
    const nearMisses = [
      real.toUpperCase(),
      real.replace(/-/g, '_'),
      real.replace(/-/g, ''),
      real + ' ',
      ' ' + real,
    ]
    for (const bad of nearMisses) {
      expect(violations(reseal({ ...good(), owner_role: bad })).join(), JSON.stringify(bad))
        .toMatch(/owner_role must be one of/)
    }
  })

  it('rejects a missing or non-string owner_role', () => {
    const c = good()
    delete c.owner_role
    expect(violations(c).join()).toMatch(/missing required field: owner_role/)
    for (const bad of [null, 7, [], {}, '']) {
      expect(violations(reseal({ ...good(), owner_role: bad })).join(), JSON.stringify(bad))
        .toMatch(/owner_role must be one of|missing required field/)
    }
  })
})

describe('THE FLOOR: a contract cannot authorise editing the taxonomy', () => {
  // Same structural principle as .agent/tasks/** and .claude/settings.json, one
  // level up. .agent/roles.json DEFINES authority domains: a task able to edit
  // it could grant itself a role, or delete the non_authority line that bounds
  // the role it already holds. That is self-authorisation by redefining the
  // vocabulary rather than by widening a path, and it is refused at the
  // contract level so the escalation cannot even be written down.
  //
  // Role-taxonomy governance therefore happens outside an ordinary implementing
  // contract, exactly as task-contract definition changes already do.

  it('is on the always-forbidden floor', () => {
    expect(ALWAYS_FORBIDDEN).toContain(ROLES_FILE)
  })

  it('refuses the role file by exact path', () => {
    expect(violations(reseal({ ...good(), allowed_paths: [ROLES_FILE] })).join())
      .toMatch(/may never authorise/)
  })

  it('refuses .agent/** — the parent subtree that would swallow it', () => {
    expect(violations(reseal({ ...good(), allowed_paths: ['.agent/**'] })).join())
      .toMatch(/may never authorise/)
  })

  it('refuses EVERY accepted ancestor subtree of the role file', () => {
    // Exhaustive rather than illustrative: each directory prefix of the path,
    // expressed as a subtree. Under the closed two-form grammar these are the
    // only accepted expressions that can reach the file, so refusing all of
    // them is refusing every route.
    const segs = ROLES_FILE.split('/')
    const ancestors = []
    for (let i = 1; i < segs.length; i++) ancestors.push(segs.slice(0, i).join('/') + '/**')
    expect(ancestors.length, 'no ancestors generated — the fixture is wrong').toBeGreaterThan(0)
    for (const p of ancestors) {
      expect(violations(reseal({ ...good(), allowed_paths: [p] })).join(), p)
        .toMatch(/may never authorise/)
    }
  })

  it('refuses it even when the same contract also forbids it', () => {
    // Naming it in allowed_paths at all is the mistake; a matching
    // forbidden_paths entry is not a reconciliation.
    const c = reseal({
      ...good(),
      allowed_paths: [ROLES_FILE],
      forbidden_paths: [ROLES_FILE],
    })
    expect(violations(c).join()).toMatch(/may never authorise/)
  })

  it('still allows ordinary work elsewhere under .agent', () => {
    expect(violations(reseal({ ...good(), allowed_paths: ['.agent/notes/scratch.md'] }))).toEqual([])
  })
})

describe('ONE canonical source, consumed rather than copied', () => {
  // Discovery, not a hand-kept list: every .mjs in the repo root and in tools/.
  // A new control-plane file is covered the moment it exists, which is the
  // point — a hand-listed scan misses exactly the file someone just added.
  const controlPlaneSources = () => {
    const files = []
    for (const dir of ['.', 'tools']) {
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.mjs')) files.push(dir === '.' ? name : dir + '/' + name)
      }
    }
    return files.sort()
  }

  // Bracketed literals with no nesting — enough to see an array or object
  // literal that spells out role ids.
  const literalsIn = (src) => [...src.matchAll(/\[[^[\]]*\]|\{[^{}]*\}/g)].map(m => m[0])
  const rolesNamedIn = (literal) =>
    OWNER_ROLES.filter(r => literal.includes("'" + r + "'") || literal.includes('"' + r + '"'))

  it('scans the files it claims to scan', () => {
    const files = controlPlaneSources()
    for (const expected of [VALIDATOR, 'role-model.test.mjs', 'task-contract.test.mjs']) {
      expect(files, 'discovery missed ' + expected).toContain(expected)
    }
  })

  it('no control-plane file restates the whole taxonomy', () => {
    // THE failure this prevents: a second complete enum that drifts from the
    // real one. Individual ids may appear where a specific boundary is being
    // proved; the complete set in one literal is a copy of the source.
    // This file is scanned too — the rule binds the tests, not just the tool.
    for (const file of controlPlaneSources()) {
      for (const literal of literalsIn(readFileSync(file, 'utf8'))) {
        const named = rolesNamedIn(literal)
        expect(named.length, 'complete role list restated in ' + file + ': ' + literal.slice(0, 120))
          .toBeLessThan(OWNER_ROLES.length)
      }
    }
  })

  it('the validator names no role at all', () => {
    // Stricter than the repo-wide rule, and it can afford to be: the validator
    // derives its enum, so it has no legitimate reason to name even one role.
    for (const literal of literalsIn(VALIDATOR_SRC)) {
      expect(rolesNamedIn(literal), 'literal role id in the validator: ' + literal.slice(0, 120))
        .toEqual([])
    }
  })

  it('the validator derives the enum from the role file', () => {
    expect(VALIDATOR_SRC).toContain('ROLE_MODEL.roles.map(r => r.id)')
    expect(VALIDATOR_SRC).toContain(ROLES_FILE)
  })

  it('reads the file at module load, so an edit cannot be ignored', () => {
    expect(VALIDATOR_SRC).toMatch(/loadRoleModel\(\)/)
    expect(VALIDATOR_SRC).toMatch(/export const ROLE_MODEL = loadRoleModel\(\)/)
  })
})

describe('every role is documented well enough to choose between', () => {
  for (const role of ROLE_MODEL.roles) {
    it(role.id + ' has purpose, authority, non-authority and both example sets', () => {
      expect(typeof role.purpose === 'string' && role.purpose.length > 40, 'purpose too thin').toBe(true)
      expect(typeof role.mental_model === 'string' && role.mental_model.length > 10).toBe(true)
      expect(Array.isArray(role.authority) && role.authority.length >= 3, 'needs real authority list').toBe(true)
      expect(Array.isArray(role.non_authority) && role.non_authority.length >= 3, 'needs explicit NON-authority').toBe(true)
      expect(Array.isArray(role.owns_examples) && role.owns_examples.length >= 3, 'needs owned examples').toBe(true)
      expect(Array.isArray(role.hand_off_examples) && role.hand_off_examples.length >= 3, 'needs handoff examples').toBe(true)
    })
  }

  it('every handoff example names a real role to hand to', () => {
    // A handoff pointing at a role that does not exist is worse than none: it
    // reads as guidance and resolves to nothing.
    for (const r of ROLE_MODEL.roles) {
      for (const ex of r.hand_off_examples) {
        if (!ex.includes('->')) continue
        const target = ex.split('->').pop()
        // Some handoffs point at a contract SHAPE ("a task with
        // production_effect database") rather than a role; those are allowed.
        if (/production_effect|the owning role|the task's owner|the implementing role/.test(target)) continue
        const named = OWNER_ROLES.filter(id => target.includes(id))
        expect(named.length, r.id + ' hands off to no known role: ' + ex).toBeGreaterThan(0)
      }
    }
  })

  it("no role claims a domain another role owns exclusively", () => {
    // Cheap cross-check on the overlaps that actually made this taxonomy hard.
    // Each marker names ONE owner — this is not a second enum, and the
    // assertion below keeps it from becoming one: the collision-prone domains
    // are a minority of the roles, and the day they are all of them, the map
    // has turned into a copy of the source.
    const markers = [
      { pattern: /fsrs|scheduling|card and review state/i, owner: 'scheduler-db' },
      { pattern: /\bstor(y|ies)\b|vocabulary|reader and matcher/i, owner: 'story-content' },
      { pattern: /required-check|workflow definitions|branch-protection/i, owner: 'workflow-authority' },
      { pattern: /privacy policy|store metadata|signing/i, owner: 'privacy-release' },
      { pattern: /navigation, routing|app shell/i, owner: 'product-app' },
    ]
    const owners = new Set(markers.map(m => m.owner))
    expect(owners.size, 'the marker map now covers every role — it has become a second enum')
      .toBeLessThan(OWNER_ROLES.length)
    for (const m of markers) {
      expect(OWNER_ROLES, 'marker names an unknown role: ' + m.owner).toContain(m.owner)
    }

    for (const r of ROLE_MODEL.roles) {
      for (const line of r.authority) {
        for (const m of markers) {
          if (m.owner === r.id) continue
          expect(m.pattern.test(line), r.id + ' claims ' + m.owner + "'s domain: " + line).toBe(false)
        }
      }
    }
  })
})

describe('THE SEPARATION RULE: an implementer is not its own reviewer', () => {
  it('is recorded in the canonical source', () => {
    expect(ROLE_MODEL.separation).toBeTruthy()
    const rule = ROLE_MODEL.separation.implementer_is_not_reviewer
    expect(typeof rule).toBe('string')
    expect(rule).toMatch(/cannot also serve as its independent fresh-context reviewer/i)
  })

  it('says WHY, so it cannot be dismissed as ceremony', () => {
    // A rule with no stated reason gets waived the first time it is
    // inconvenient. The reason is that independence is the entire value.
    expect(ROLE_MODEL.separation.implementer_is_not_reviewer)
      .toMatch(/blind spots|independence is the whole value|same reading of the contract/i)
  })

  it('is honest that nothing enforces it yet', () => {
    expect(ROLE_MODEL.separation.implementer_is_not_reviewer)
      .toMatch(/nothing enforces it at runtime|no reviewer agent/i)
  })

  it('the reviewer role forbids implementing the task it reviews', () => {
    const reviewer = ROLE_MODEL.roles.find(r => r.id === 'reviewer')
    expect(reviewer, 'no reviewer role in the model').toBeTruthy()
    expect(reviewer.non_authority.join(' ')).toMatch(/MUST NOT implement the task being reviewed/i)
  })

  it('the reviewer cannot relax the contract to fit what was built', () => {
    // The subtler failure: not implementing, but approving by moving the goal.
    const reviewer = ROLE_MODEL.roles.find(r => r.id === 'reviewer')
    expect(reviewer.non_authority.join(' ')).toMatch(/relax acceptance_criteria|widen allowed_paths|re-seal/i)
  })

  it('is documented where a reader will meet it', () => {
    const readme = readFileSync('.agent/tasks/README.md', 'utf8')
    expect(readme).toMatch(/implementer.*(reviewer|review)/i)
  })
})

describe('a role never overrides the contract', () => {
  it('the rule is stated in the canonical source', () => {
    const rule = ROLE_MODEL.separation.role_never_overrides_contract
    expect(typeof rule).toBe('string')
    for (const field of ['allowed_paths', 'forbidden_paths', 'acceptance_criteria',
      'stop_conditions', 'risk', 'production_effect']) {
      expect(rule, 'rule omits ' + field).toContain(field)
    }
    expect(rule).toMatch(/the contract wins/i)
  })

  it('every role carries an explicit non-authority list, not just a scope', () => {
    // "What it may do" without "what it may not" is an invitation to stretch.
    for (const r of ROLE_MODEL.roles) {
      expect(r.non_authority.length, r.id + ' has no explicit non-authority').toBeGreaterThan(2)
    }
  })

  it('the control-plane role cannot grant itself credentials or widen its contract', () => {
    // The role that owns the control plane is the one most able to escalate.
    const wa = ROLE_MODEL.roles.find(r => r.id === 'workflow-authority')
    expect(wa, 'no workflow-authority role in the model').toBeTruthy()
    expect(wa.non_authority.join(' ')).toMatch(/must not grant itself production credentials/i)
    expect(wa.non_authority.join(' ')).toMatch(/broaden its own task contract/i)
  })

  it('the role choice does not change what risk or production_effect mean', () => {
    // Orthogonality, exercised rather than asserted: the same role spans the
    // range, and the same risk spans roles. If a role implied a risk or an
    // effect, one of these would fail. Roles are taken from the model by
    // position, so this cannot rot into naming a role that no longer exists.
    const [a, b] = [OWNER_ROLES[0], OWNER_ROLES[OWNER_ROLES.length - 1]]
    const combos = [
      { owner_role: a, risk: 'r0', production_effect: 'none' },
      { owner_role: a, risk: 'r4', production_effect: 'database' },
      { owner_role: b, risk: 'r0', production_effect: 'deploy-on-merge' },
      { owner_role: b, risk: 'r3', production_effect: 'read-only' },
    ]
    for (const combo of combos) {
      expect(violations(reseal({ ...good(), ...combo })), JSON.stringify(combo)).toEqual([])
    }
  })
})

describe('the shipped contract', () => {
  const contract = JSON.parse(readFileSync('.agent/tasks/dynamic-ref-writers.json', 'utf8'))

  it('is workflow-authority, classified from what it actually changes', () => {
    // Its allowed_paths are four CONTENT workflows, but the authority it
    // changes is where those workflows may push — not content semantics. A
    // story-content agent re-authoring push authority would be exactly the
    // wrong grant. It also edits workflow-authority.test.mjs and
    // docs/AUTOMATION-AUTHORITY.md, which are pure control-plane artefacts.
    expect(contract.owner_role).toBe('workflow-authority')
  })

  it('keeps its risk and production_effect — the role migration changed neither', () => {
    expect(contract.risk).toBe('r3')
    expect(contract.production_effect).toBe('none')
  })

  it('was re-sealed after the role changed', () => {
    expect(contract.contract_digest).toBe(computeDigest(contract))
  })

  it('carries no placeholder role', () => {
    expect(contract.owner_role).not.toBe('workflow-engineer')
    expect(OWNER_ROLES).toContain(contract.owner_role)
  })
})

describe('THE LOADER FAILS CLOSED: a malformed model stops the tool', () => {
  // Not "a spec catches it later" — that is too late. A spec runs separately,
  // and in the meantime a malformed model would have been handed to every
  // contract check: the derived enum would be short, misspelled or empty, and
  // contracts naming real roles would be rejected while the real fault went
  // unmentioned. So the refusal has to happen at module load, and these tests
  // prove it at the CLI, where it actually matters.
  //
  // Each case runs against an isolated COPY of the validator — the real
  // .agent/roles.json is never touched, so a crashed test cannot leave the repo
  // broken and a parallel test worker cannot observe a half-written file.
  const sandbox = (rolesJson) => {
    const dir = path.join(tmpdir(), 'roles-fail-closed-' + Math.random().toString(36).slice(2))
    mkdirSync(path.join(dir, 'tools'), { recursive: true })
    mkdirSync(path.join(dir, '.agent', 'tasks'), { recursive: true })
    cpSync(VALIDATOR, path.join(dir, VALIDATOR))
    writeFileSync(path.join(dir, ROLES_FILE), rolesJson)
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: PKG.scripts }))
    return dir
  }

  const runWith = (rolesJson) => {
    const dir = sandbox(rolesJson)
    try {
      return spawnSync('node', [VALIDATOR], { cwd: dir, encoding: 'utf8' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const model = () => JSON.parse(ROLES_RAW)
  const mutate = (fn) => { const m = model(); fn(m); return JSON.stringify(m, null, 2) }

  it('the sandbox is faithful — the real model runs clean inside it', () => {
    // Without this, every case below could be passing for the wrong reason.
    const r = runWith(ROLES_RAW)
    expect(r.status, r.stderr).toBe(0)
  })

  const cases = {
    'unparseable JSON': '{ not json',
    'not an object': '[]',
    'a bare array of roles': JSON.stringify(model().roles),
    'a missing version': mutate(m => { delete m.version }),
    'a non-integer version': mutate(m => { m.version = '1' }),
    'a zero version': mutate(m => { m.version = 0 }),
    'no roles key': mutate(m => { delete m.roles }),
    'an empty roles array': mutate(m => { m.roles = [] }),
    'a role that is not an object': mutate(m => { m.roles[0] = 'product-app' }),
    'a missing role id': mutate(m => { delete m.roles[0].id }),
    'an empty role id': mutate(m => { m.roles[0].id = '' }),
    'a non-kebab role id': mutate(m => { m.roles[0].id = 'Product App' }),
    'a duplicate role id': mutate(m => { m.roles[1].id = m.roles[0].id }),
    'a missing purpose': mutate(m => { delete m.roles[0].purpose }),
    'a blank purpose': mutate(m => { m.roles[0].purpose = '   ' }),
    'a missing mental_model': mutate(m => { delete m.roles[0].mental_model }),
    'an empty authority list': mutate(m => { m.roles[0].authority = [] }),
    'an empty non_authority list': mutate(m => { m.roles[0].non_authority = [] }),
    'a missing owns_examples': mutate(m => { delete m.roles[0].owns_examples }),
    'a missing hand_off_examples': mutate(m => { delete m.roles[0].hand_off_examples }),
    'a non-string inside a list': mutate(m => { m.roles[0].authority = [{ x: 1 }] }),
    'a blank string inside a list': mutate(m => { m.roles[0].non_authority = ['  '] }),
    'no separation block': mutate(m => { delete m.separation }),
    'separation as a string': mutate(m => { m.separation = 'trust me' }),
    'a missing implementer/reviewer rule': mutate(m => { delete m.separation.implementer_is_not_reviewer }),
    'a missing never-overrides rule': mutate(m => { delete m.separation.role_never_overrides_contract }),
    'a blank separation rule': mutate(m => { m.separation.implementer_is_not_reviewer = '' }),
  }

  for (const [label, rolesJson] of Object.entries(cases)) {
    it('refuses to run with ' + label, () => {
      const r = runWith(rolesJson)
      expect(r.status, 'exited 0 with ' + label + '\n' + r.stdout).not.toBe(0)
      expect(r.stderr, 'no explanation for ' + label).toMatch(/refusing to run against a malformed role model/)
      expect(r.stderr).toContain(ROLES_FILE)
      // It must die before doing any work — a partial validation pass over
      // contracts using a broken enum is exactly what fail-closed prevents.
      expect(r.stdout, 'validated contracts anyway with ' + label)
        .not.toMatch(/contract\(s\) valid/)
    })
  }

  it('refuses to SEAL with a malformed model too', () => {
    // --seal writes files. If the loader let a broken model through, sealing
    // would stamp digests certified against an enum that is not the taxonomy.
    const dir = sandbox(mutate(m => { m.roles[1].id = m.roles[0].id }))
    try {
      const r = spawnSync('node', [VALIDATOR, '--seal'], { cwd: dir, encoding: 'utf8' })
      expect(r.status).not.toBe(0)
      expect(r.stderr).toMatch(/refusing to run against a malformed role model/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('what this layer does NOT do', () => {
  it('adds no runtime enforcement', () => {
    // Stated as a test so the claim in the docs stays true. Roles are validated
    // on contracts; nothing intercepts a tool call or a file write.
    expect(ROLES_RAW).not.toMatch(/PreToolUse|PostToolUse/)
    expect(VALIDATOR_SRC).not.toMatch(/PreToolUse|PostToolUse/)
  })

  it('selects no role automatically and dispatches nothing', () => {
    expect(VALIDATOR_SRC).not.toMatch(/inferRole|selectRole|assignRole|dispatch/i)
  })
})
