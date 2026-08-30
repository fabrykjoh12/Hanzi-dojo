import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ROLE_MODEL,
  OWNER_ROLES,
  ROLES_FILE,
  findContractViolations,
  computeDigest,
} from './tools/verify-task-contracts.mjs'

// The canonical role model.
//
// A role is an authority DOMAIN — what kind of work this is and who may own it.
// It is NOT a permission: no role lets a task exceed its own contract. The two
// invariants worth the most here are that one, and the separation rule below.
//
// This layer defines and validates. It does not enforce: there is no hook, no
// reviewer agent, no dispatch. Nothing selects a role for you and nothing stops
// an agent working outside one. See .agent/roles.json.

const CANONICAL = [
  'product-app',
  'story-content',
  'scheduler-db',
  'privacy-release',
  'workflow-authority',
  'qa',
  'reviewer',
  'integrator',
]

const VALIDATOR_SRC = readFileSync('tools/verify-task-contracts.mjs', 'utf8')
const ROLES_RAW = readFileSync(ROLES_FILE, 'utf8')
const PKG = JSON.parse(readFileSync('package.json', 'utf8'))

const good = () => {
  const c = {
    id: 'example-task',
    goal: 'Do one well-defined thing.',
    owner_role: 'product-app',
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

describe('the canonical eight', () => {
  it('is exactly the agreed taxonomy, in order', () => {
    expect(OWNER_ROLES).toEqual(CANONICAL)
  })

  it('accepts every canonical role', () => {
    for (const role of CANONICAL) {
      expect(violations(reseal({ ...good(), owner_role: role })), role).toEqual([])
    }
  })

  it('rejects an invented ninth role', () => {
    for (const bad of ['devops', 'fullstack', 'content', 'security', 'anything-else']) {
      expect(violations(reseal({ ...good(), owner_role: bad })).join(), bad)
        .toMatch(/owner_role must be one of/)
    }
  })

  it('rejects the placeholder this format briefly carried', () => {
    // workflow-engineer was PR4's stand-in while the taxonomy was undecided. A
    // contract still carrying it must fail rather than be silently mapped onto
    // workflow-authority — the migration is a visible, re-sealed change.
    expect(violations(reseal({ ...good(), owner_role: 'workflow-engineer' })).join())
      .toMatch(/owner_role must be one of/)
  })

  it('rejects near-misses in spelling and case', () => {
    for (const bad of ['Product-App', 'product_app', 'productapp', 'product-app ', 'QA', 'Reviewer']) {
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

  it('has no duplicate ids', () => {
    expect(new Set(OWNER_ROLES).size).toBe(OWNER_ROLES.length)
  })
})

describe('ONE canonical source, consumed rather than copied', () => {
  it('the validator derives the enum from the role file', () => {
    expect(VALIDATOR_SRC).toContain('ROLE_MODEL.roles.map(r => r.id)')
    expect(VALIDATOR_SRC).toContain(ROLES_FILE)
  })

  it('the validator contains no second literal role list', () => {
    // The failure this prevents: a hand-kept copy beside the real list. The two
    // drift, and the one the validator reads quietly wins over the one people
    // read. A role id may appear in prose; two or more in one array literal is
    // a second enum.
    const arrays = [...VALIDATOR_SRC.matchAll(/\[[^\]]*\]/g)].map(m => m[0])
    for (const arr of arrays) {
      const hits = CANONICAL.filter(r => arr.includes("'" + r + "'") || arr.includes('"' + r + '"'))
      expect(hits.length, 'literal role list in the validator: ' + arr.slice(0, 90)).toBeLessThan(2)
    }
  })

  it('reads the file at module load, so an edit cannot be ignored', () => {
    expect(VALIDATOR_SRC).toMatch(/loadRoleModel\(\)/)
    expect(VALIDATOR_SRC).toMatch(/export const ROLE_MODEL = loadRoleModel\(\)/)
  })

  it('refuses to run against an empty role model', () => {
    expect(VALIDATOR_SRC).toMatch(/refusing to run with an empty role model/)
  })
})

describe('every role is documented well enough to choose between', () => {
  for (const role of CANONICAL) {
    it(role + ' has purpose, authority, non-authority and both example sets', () => {
      const r = ROLE_MODEL.roles.find(x => x.id === role)
      expect(r, 'role missing from ' + ROLES_FILE).toBeTruthy()
      expect(typeof r.purpose === 'string' && r.purpose.length > 40, 'purpose too thin').toBe(true)
      expect(typeof r.mental_model === 'string' && r.mental_model.length > 10).toBe(true)
      expect(Array.isArray(r.authority) && r.authority.length >= 3, 'needs real authority list').toBe(true)
      expect(Array.isArray(r.non_authority) && r.non_authority.length >= 3, 'needs explicit NON-authority').toBe(true)
      expect(Array.isArray(r.owns_examples) && r.owns_examples.length >= 3, 'needs owned examples').toBe(true)
      expect(Array.isArray(r.hand_off_examples) && r.hand_off_examples.length >= 3, 'needs handoff examples').toBe(true)
    })
  }

  it('every handoff example names a real role to hand to', () => {
    // A handoff pointing at a role that does not exist is worse than none: it
    // reads as guidance and resolves to nothing.
    for (const r of ROLE_MODEL.roles) {
      for (const ex of r.hand_off_examples) {
        if (!ex.includes('->')) continue
        const target = ex.split('->').pop()
        const named = CANONICAL.filter(id => target.includes(id))
        // Some handoffs point at a contract shape ("a task with production_effect
        // database") rather than a role; those are allowed, but a handoff that
        // names something role-shaped must name a real one.
        if (/production_effect|the owning role|the task's owner|the implementing role/.test(target)) continue
        expect(named.length, r.id + ' hands off to no known role: ' + ex).toBeGreaterThan(0)
      }
    }
  })

  it("no role claims another role's exclusive authority in its own authority list", () => {
    // Cheap cross-check for the overlap that made this taxonomy hard: story
    // semantics in product-app, CI authority in privacy-release, and so on.
    const forbidden = {
      'product-app': [/fsrs/i, /migration/i, /store release/i, /required-check/i],
      'story-content': [/fsrs/i, /navigation/i, /store release/i, /required-check/i],
      'scheduler-db': [/navigation/i, /store release/i, /required-check/i],
      'privacy-release': [/fsrs/i, /^ci\//i, /required-check/i],
      'workflow-authority': [/fsrs/i, /privacy policy/i, /store metadata/i],
      qa: [/required-check/i],
      reviewer: [/implement/i],
      integrator: [/\bdefine\b/i],
    }
    for (const r of ROLE_MODEL.roles) {
      for (const pattern of forbidden[r.id] || []) {
        for (const line of r.authority) {
          expect(pattern.test(line), r.id + ' claims foreign authority: ' + line).toBe(false)
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

  it('workflow-authority cannot grant itself credentials or widen its contract', () => {
    // The role that owns the control plane is the one most able to escalate.
    const wa = ROLE_MODEL.roles.find(r => r.id === 'workflow-authority')
    expect(wa.non_authority.join(' ')).toMatch(/must not grant itself production credentials/i)
    expect(wa.non_authority.join(' ')).toMatch(/broaden its own task contract/i)
  })

  it('the role choice does not change what risk or production_effect mean', () => {
    // Orthogonality, exercised: the same role spans the range, and the same
    // risk spans roles. If a role implied a risk, one of these would fail.
    expect(violations(reseal({ ...good(), owner_role: 'workflow-authority', risk: 'r0', production_effect: 'none' }))).toEqual([])
    expect(violations(reseal({ ...good(), owner_role: 'workflow-authority', risk: 'r3', production_effect: 'none' }))).toEqual([])
    expect(violations(reseal({ ...good(), owner_role: 'product-app', risk: 'r0', production_effect: 'deploy-on-merge' }))).toEqual([])
    expect(violations(reseal({ ...good(), owner_role: 'scheduler-db', risk: 'r4', production_effect: 'database' }))).toEqual([])
    expect(violations(reseal({ ...good(), owner_role: 'qa', risk: 'r1', production_effect: 'read-only' }))).toEqual([])
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
