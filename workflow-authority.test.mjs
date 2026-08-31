import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
// The required contexts, from the integration protocol rather than restated here.
import { REQUIRED_CHECKS } from './tools/integration-protocol.mjs'

// Repository-wide authority contract: WHAT MAY EACH WORKFLOW MUTATE.
//
// The invariant, in one line: stale code may exist; stale authority may not.
// docs/AUTOMATION-AUTHORITY.md is the long version.
//
// GitHub runs a workflow from the tree of the ref that was pushed, not from
// main. So a branch cut before a workflow fix keeps running the old version
// forever, and there is no way to reach back and change that. An audit found 75
// of 90 branches still carrying a version of roadmap-live-sync.yml that pushes
// straight to main; PR #222 fixed main's copy, and a stale branch reverted PR
// #222's own docs within the hour, then twice more.
//
// The response was to close the capability at the RESOURCE rather than at the
// caller: canonical Discord state is reachable only with an environment secret
// scoped to main, and canonical main is reachable only through a pull request.
// Neither depends on the 75 branches ever being updated.
//
// These specs are what keeps a future edit from quietly reopening either one.
// They read the workflow text directly — there is no YAML parser in this repo,
// and "this string must not appear in any workflow" is exactly the assertion.

const DIR = '.github/workflows'
const NAMES = readdirSync(DIR).filter(n => n.endsWith('.yml') || n.endsWith('.yaml'))
const WORKFLOWS = NAMES.map(name => ({ name, text: readFileSync(DIR + '/' + name, 'utf8') }))

/** Comments explain the old behaviour at length; only executable YAML is the contract. */
const executable = text => text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')

const ROADMAP = readFileSync(DIR + '/roadmap-live-sync.yml', 'utf8')
const NEEDS_TESTING = readFileSync(DIR + '/needs-testing-sync.yml', 'utf8')

// THE REPOSITORY-CODE INVARIANT — what this file can actually prove.
//
//   No workflow explicitly targets `main` as a push destination, and every
//   workflow whose push target is dynamic (resolved from the dispatched ref) is
//   enumerated here and cannot grow silently.
//
// It is deliberately NOT "no workflow can push main". That stronger statement
// is false today: the four dynamic writers below resolve their target from
// `github.ref_name`, so dispatching one from `main` pushes `main`. Repository
// code alone cannot prevent that.
//
// THE RESOURCE-LEVEL INVARIANT — what actually stops them, once configured:
//
//   The `main` ruleset with an empty bypass list rejects every direct workflow
//   push to `main`, dynamic ones included, at the server.
//
// That one lives in GitHub settings, not in this repository, so nothing here
// can assert it. Keeping the two apart is the point: a test named for a
// guarantee it does not provide is worse than no test.
describe('repository code never explicitly targets main', () => {
  it('finds the workflows to check', () => {
    // A rename or a moved directory must not turn this file into a no-op.
    expect(WORKFLOWS.length).toBeGreaterThan(10)
    expect(NAMES).toContain('roadmap-live-sync.yml')
    expect(NAMES).toContain('needs-testing-sync.yml')
  })

  it('no workflow names main as a push target, in any spelling', () => {
    // needs-testing-sync.yml was the last one that did:
    //   git push origin HEAD:main
    // With that gone, the main ruleset needs no GitHub Actions bypass — and a
    // bypass wide enough for one job is wide enough for every workflow on every
    // branch, including the 75 stale ones.
    //
    // Scope: this catches a LITERAL main target only. Dynamic targets are the
    // separate assertion below.
    const FORMS = [
      /git\s+push[^\n]*\bHEAD:main\b/,
      /git\s+push[^\n]*\bHEAD:refs\/heads\/main\b/,
      /git\s+push[^\n]*:\s*main\b/,
      /git\s+push[^\n]*:refs\/heads\/main\b/,
      /git\s+push\s+origin\s+main\b/,
      /git\s+push\s+(-\S+\s+)*origin\s+main\b/,
    ]
    for (const { name, text } of WORKFLOWS) {
      const body = executable(text)
      for (const form of FORMS) {
        expect(body, name + ' pushes to main: ' + form).not.toMatch(form)
      }
    }
  })

  it('the set of DYNAMIC push targets is exactly the four known writers', () => {
    // The second class, and the reason the describe above is worded the way it
    // is. These push `HEAD:${GITHUB_REF_NAME}` (or a bare `git push`), which
    // resolves to whatever ref the run was dispatched on — and `main` is the
    // default selection in the Actions UI. The word "main" never appears, so
    // the literal patterns above cannot see them.
    //
    // CONSEQUENCE, STATED PLAINLY: dispatched from `main` today, each of these
    // pushes `main`. Repository code does not prevent it. The `main` ruleset
    // with an empty bypass list is what prevents it, server-side, once
    // configured — and after that these four FAIL at push time when dispatched
    // from `main`. That is accepted temporary operational behaviour, not the
    // end state; the follow-up is to make them refuse a `main` dispatch or
    // generate to a branch and open a PR.
    //
    // They are content workflows that commit generated data, so where that data
    // should land is a content-pipeline decision, out of scope for containment.
    //
    // What this assertion buys: the class cannot grow silently. A fifth dynamic
    // writer fails here and gets a deliberate decision instead of arriving
    // unnoticed.
    const REF_RELATIVE = ['content-utils.yml', 'llm-bench.yml', 'story-pilot.yml', 'vocab-complete.yml']
    const found = WORKFLOWS
      .filter(({ text }) => {
        const body = executable(text)
        return /git\s+push[^\n]*(GITHUB_REF_NAME|github\.ref_name|\$BRANCH)/.test(body) ||
               /^\s*git\s+push\s*$/m.test(body)
      })
      .map(w => w.name)
      .sort()
    expect(found).toEqual(REF_RELATIVE.sort())
  })

  it('no workflow force-pushes anything', () => {
    for (const { name, text } of WORKFLOWS) {
      const body = executable(text)
      expect(body, name + ' force-pushes').not.toMatch(/git\s+push[^\n]*(--force|-f\b)/)
    }
  })

  it('every workflow holding contents: write says which refs it may advance', () => {
    // Not a ban — content workflows legitimately write. The requirement is that
    // the write target is stated, so a reviewer can see it without running it.
    const writers = WORKFLOWS.filter(w => executable(w.text).includes('contents: write'))
    expect(writers.length).toBeGreaterThan(0)
    for (const { name, text } of writers) {
      const pushes = [...executable(text).matchAll(/git\s+push\s+\S+\s+(\S+)/g)].map(m => m[1])
      for (const target of pushes) {
        expect(target, name + ' pushes an unexpected ref: ' + target).not.toMatch(/(^|:)main$/)
      }
    }
  })
})

// The roadmap workflow's own invariants — main-only trigger, off-main dispatch
// refusal, contents: read, no git write, PATCH-only — live in
// roadmap-sync.test.mjs, including the roadmap-discord environment boundary.
// They are asserted there once, not restated here.

describe('needs-testing keeps canonical content and mutable state apart', () => {
  const body = executable(NEEDS_TESTING)

  it('reads canonical content from main', () => {
    expect(body).toMatch(/ref:\s*main/)
    expect(body).toContain('scripts/needs-testing-discord.mjs')
  })

  it('writes only the automation state branch', () => {
    expect(body).toContain('automation/needs-testing-state')
    const pushes = [...body.matchAll(/git\s+push\s+\S+\s+(\S+)/g)].map(m => m[1])
    expect(pushes.length).toBeGreaterThan(0)
    for (const target of pushes) {
      expect(target).toMatch(/refs\/heads\/\$STATE_BRANCH|automation\//)
    }
  })

  it('builds the state commit from a single blob, so source cannot enter it', () => {
    // Structural, not a policy: `git mktree` is fed exactly one entry, so the
    // resulting tree has exactly one file in it whatever else is checked out.
    expect(body).toContain('git mktree')
    expect(body).toContain('git commit-tree')
    expect(body).toMatch(/printf '100644 blob %s\\t%s\\n'/)
  })

  it('compare-and-swaps instead of overwriting', () => {
    // Two runs can both create threads for different new items. A blind
    // overwrite loses one side's ids and orphans live Discord threads that
    // testers may already have replied to.
    //
    // The assertion names the REMOTE map on purpose. An earlier version just
    // looked for "needs-testing-state.mjs merge", which the bootstrap call
    // (merge /dev/null ...) satisfies on its own — so replacing the retry-path
    // merge with `cp` left the contract green while the CAS was gone.
    expect(body).toMatch(/for attempt in/)
    expect(body).toMatch(/needs-testing-state\.mjs merge \/tmp\/remote\.json/)
    expect(body).toMatch(/git show "\$parent:\$STATE_FILE" > \/tmp\/remote\.json/)
    expect(body).not.toMatch(/git\s+push[^\n]*--force/)
  })

  it('is serialised, so the retry is the second line of defence and not the first', () => {
    expect(body).toMatch(/concurrency:[\s\S]*?group: needs-testing-sync/)
    expect(body).toMatch(/concurrency:[\s\S]*?cancel-in-progress: false/)
  })

  it('bootstraps from the frozen seed rather than starting empty', () => {
    // Starting empty would re-post a thread for all 18 existing items.
    expect(body).toContain('.github/needs-testing.ids.json')
  })
})

// ---------------------------------------------------------------------------
// REQUIRED-CHECK IDENTITY — one job, one required context, no collisions.
//
// A required status check is identified by its CONTEXT NAME plus the producing
// integration, never by the workflow file it came from. So two jobs with the
// same effective name, both run by GitHub Actions, are indistinguishable to the
// ruleset — and to anything reading check runs back, which cannot tell which of
// the two a green result belongs to.
//
// That was live here: ios-signing-check.yml defined a job id `check`, colliding
// with ci.yml's canonical required `check`. Both come from App 15368, so App
// identity could not separate them; a manual dispatch of the diagnostic against
// a branch would have put a second `check` run on the commit. The integration
// gate fails closed on the ambiguity, which is correct and is not a substitute
// for the collision not existing.
//
// The EFFECTIVE name matters, not the id. GitHub reports a job's `name:`
// override where one is present and the job id otherwise, and two workflows
// here use overrides — so an id-only check would miss a future `name: check`.

describe('required check names identify exactly one job each', () => {
  /**
   * Every job in a workflow, as { id, effectiveName }.
   *
   * Deliberately a small parser rather than a YAML dependency: this repository
   * has none, and the shape being read is two levels of fixed indentation.
   * Comments are stripped first — only executable YAML is the contract.
   */
  /**
   * A YAML scalar as a job key or a `name:` value: bare, single-quoted or
   * double-quoted, with an optional trailing comment.
   *
   * Returns the string, or null when the text is not a form this parser can
   * classify. Null is never "no name" — every caller turns it into a refusal.
   */
  const scalar = (raw) => {
    const text = raw.trim()
    if (text === '') return null
    const quoted = text.match(/^'([^']*)'\s*(?:#.*)?$/) || text.match(/^"([^"]*)"\s*(?:#.*)?$/)
    if (quoted) return quoted[1]
    if (/^['"]/.test(text)) return null            // opened a quote and never closed it
    // Bare scalar. YAML starts a comment at ` #`, not at a bare `#`, so
    // `name: a#b` is the three-character value and `name: a # b` is one.
    const bare = text.replace(/\s+#.*$/, '').trim()
    if (bare === '' || /[:{}[\]&*!|>%@`]/.test(bare)) return null
    return bare
  }

  /**
   * A mapping entry at a GIVEN indentation: { key, rawValue }, or null when the
   * line is not a mapping key this parser can classify there.
   *
   * The KEY is parsed separately from the value, because YAML spells the same
   * property several ways and GitHub honours all of them:
   *
   *   name: check          "name": check          'name' : 'check' # required
   *   name : check         'name': check
   *
   * The indentation is a PARAMETER, not a literal. YAML gives no meaning to
   * "four spaces" — it requires only that a child be indented further than its
   * parent and that siblings share a level. An earlier version hardcoded 2 for
   * job keys and 4 for job properties, so a job body written at 3 or 6 spaces
   * was skipped in silence and its `name: check` never seen.
   */
  const mappingEntry = (line, indent) => {
    if (line.length < indent || line.slice(0, indent).trim() !== '') return null
    const rest = line.slice(indent)
    if (rest === '' || /^\s/.test(rest)) return null      // deeper than this level
    const m = rest.match(/^(?:'([^']*)'|"([^"]*)"|([^:#\s'"][^:#]*?))\s*:(\s.*)?$/)
    if (!m) return null
    // A BARE key must look like a property name. Without this, `- name: x`
    // parses as a key called "- name" and is quietly treated as some other
    // property — a malformed mapping read as a well-formed one. A QUOTED key is
    // explicit about where it begins and ends, so it needs no such rule.
    if (m[3] !== undefined && !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(m[3])) return null
    const key = m[1] ?? m[2] ?? m[3]
    if (key === undefined) return null
    // The key is used VERBATIM. A quoted scalar preserves the whitespace inside
    // it, so `' name '` is the key " name " and not `name` — GitHub does not
    // treat it as the name property, and neither may this. Bare keys cannot
    // carry whitespace at all, by the shape rule above.
    return { key, rawValue: (m[4] ?? '').trim() }
  }

  const indentOf = (line) => line.match(/^ */)[0].length

  /**
   * Every job in one workflow, as { id, effectiveName }.
   *
   * A hand parser rather than a YAML dependency — this repository has none, and
   * package.json is outside this task's contract. What makes that safe is not
   * knowing YAML, it is REFUSING WHAT IT CANNOT CLASSIFY. Silently skipping an
   * unrecognised line is the defect this parser has been corrected for three
   * times: `  "check":` was skipped, then `"name": check` was skipped, then a
   * job body at any indentation but four was skipped. Each is valid YAML that
   * GitHub honours, and each let a required-context collision sit in the tree
   * while this proof stayed green.
   *
   * So indentation is DERIVED rather than assumed, at both levels:
   *
   *   the first child of `jobs:` establishes the JOB KEY level;
   *   the first child of each job establishes THAT JOB's property level.
   *
   * Deeper than the property level is nested content — `steps:` and its
   * `- name:` items live there, and a step name is not a job name. Anything
   * between the two levels is inconsistent indentation that could hide
   * job-level structure, and it throws, named by file and line.
   */
  const parseJobs = (text, workflow) => {
    const refuse = (line, i, why) => {
      throw new Error(workflow + ':' + (i + 1) + ' ' + why + ' — ' + JSON.stringify(line) +
        '. This parser refuses what it cannot classify rather than skipping it: a job it ' +
        'cannot see is a required-context collision it cannot rule out.')
    }

    const lines = executable(text).split('\n')
    const start = lines.findIndex(l => /^jobs:\s*(?:#.*)?$/.test(l))
    if (start < 0) return []

    // The job-key level, from the first child of `jobs:`.
    let keyIndent = null
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue
      if (indentOf(lines[i]) === 0) break                  // left the block with no jobs
      keyIndent = indentOf(lines[i])
      break
    }
    if (keyIndent === null) return []                      // declares jobs: but has none

    const out = []
    let i = start + 1
    while (i < lines.length) {
      const line = lines[i]
      if (line.trim() === '') { i++; continue }
      const ind = indentOf(line)
      if (ind === 0) break                                 // left the jobs: block
      if (ind !== keyIndent) {
        refuse(line, i, 'is indented ' + ind + ' where sibling jobs are indented ' + keyIndent)
      }

      const key = mappingEntry(line, keyIndent)
      if (!key) refuse(line, i, 'is at job-key indentation but is not a job mapping key')
      // A job key carries no inline value; a trailing comment is not a value.
      if (key.rawValue !== '' && !key.rawValue.startsWith('#')) {
        refuse(line, i, 'has a value on the job key line')
      }
      const id = key.key
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) {
        refuse(line, i, 'has a job key this parser cannot classify as a job id')
      }

      // The property level for THIS job, from its own first child.
      let bodyIndent = null
      let effectiveName = id
      let namedAt = null
      let j = i + 1
      for (; j < lines.length; j++) {
        const body = lines[j]
        if (body.trim() === '') continue
        const bi = indentOf(body)
        if (bi <= keyIndent) break                         // next job, or out of the block
        if (bodyIndent === null) bodyIndent = bi           // first child sets the level
        if (bi < bodyIndent) {
          refuse(body, j, 'is indented ' + bi + ' where sibling job properties are indented ' +
            bodyIndent + ', which makes the job-level structure ambiguous')
        }
        if (bi > bodyIndent) continue                      // nested content, not job-level

        // Every job-level property is classified, not just the one being looked
        // for: skipping a line because its spelling is unfamiliar is how a
        // `name` override hides.
        const prop = mappingEntry(body, bodyIndent)
        if (!prop) refuse(body, j, 'is at job-property indentation but is not a mapping key')
        if (prop.key !== 'name') continue

        // Two `name` keys in one mapping is invalid YAML, and which one a
        // reader takes is exactly the kind of thing this parser must not
        // decide: picking either could report a name GitHub does not use.
        if (namedAt !== null) {
          refuse(body, j, 'declares a job name more than once (already at line ' + (namedAt + 1) + ')')
        }
        const value = scalar(prop.rawValue)
        if (value === null) refuse(body, j, 'has a job name this parser cannot classify')
        namedAt = j
        effectiveName = value
        // The scan continues rather than breaking, so the rest of the body is
        // still checked for the inconsistent indentation that could hide another.
      }
      out.push({ id, effectiveName, workflow })
      i = j
    }
    return out
  }

  /** Which jobs produce each required context. The shape the real proof asserts. */
  const producerMap = (jobs) => Object.fromEntries(REQUIRED_CHECKS.map(context =>
    [context, jobs.filter(j => j.effectiveName === context).map(p => p.workflow + ':' + p.id)]))

  // Parsed once, lazily, so a refusal surfaces inside the spec that needed the
  // jobs rather than as a bare collection error.
  let parsed = null
  const allJobs = () => (parsed ||= WORKFLOWS.flatMap(w => parseJobs(w.text, w.name)))

  /**
   * Workflows that declare a `jobs:` mapping but yield no jobs to the parser —
   * by filename, which is the whole point of the guard.
   *
   * A repository-wide `ALL_JOBS.length > 15` was the earlier version, and it
   * could not fail: the tree has 23 jobs, so an entire workflow could drop out
   * of parser coverage and still clear the threshold. "Across all workflows"
   * has to mean each of them, named.
   */
  const workflowsMissingJobs = (workflows) => workflows
    .filter(w => /^jobs:\s*(?:#.*)?$/m.test(executable(w.text)))
    .filter(w => parseJobs(w.text, w.name).length === 0)
    .map(w => w.name)

  it('yields jobs from EVERY workflow that declares them, named by file', () => {
    expect(WORKFLOWS.filter(w => /^jobs:\s*(?:#.*)?$/m.test(executable(w.text))).length)
      .toBe(WORKFLOWS.length)
    expect(workflowsMissingJobs(WORKFLOWS), 'these workflows declare jobs: but yielded none')
      .toEqual([])
  })

  it('resolves the name overrides that make id-only matching insufficient', () => {
    const overridden = allJobs().filter(j => j.id !== j.effectiveName)
    expect(overridden.map(j => j.workflow).sort())
      .toEqual(['gate3-apply.yml', 'gate3-prepare.yml'])
  })

  it('produces each required context from exactly one job, in the workflow that owns it', () => {
    // ONE assertion over the whole map, not a loop.
    //
    // A `for (const context of REQUIRED_CHECKS)` reads fine and has a hole:
    // narrowing the list it iterates — to a hardcoded pair, say — silently
    // stops checking a context while every assertion inside still passes. A
    // mutation doing exactly that survived until this became a map. Here the
    // KEYS are part of what is asserted, so dropping one fails.
    //
    // REQUIRED_CHECKS is imported rather than restated, so the ruleset, the
    // integration protocol and this spec cannot drift apart.
    expect(producerMap(allJobs())).toEqual({
      'check': ['ci.yml:check'],
      'playwright': ['e2e.yml:playwright'],
      'native-gate': ['native.yml:native-gate'],
    })
  })

  it('gives the iOS signing diagnostic an identity of its own', () => {
    // The regression this suite exists for. Its job must not be named after any
    // required context, by id or by override.
    const ios = allJobs().filter(j => j.workflow === 'ios-signing-check.yml')
    expect(ios).toHaveLength(1)
    expect(ios[0].id).toBe('ios-signing-check')
    for (const context of REQUIRED_CHECKS) {
      expect(ios[0].effectiveName).not.toBe(context)
    }
  })

  it('keeps the iOS signing diagnostic dispatch-only and otherwise unchanged', () => {
    // A rename must not become a behaviour change. These pin what the job still
    // is: manually triggered, read-only, running the same script with the same
    // three secrets and no added permissions.
    const ios = executable(readFileSync(DIR + '/ios-signing-check.yml', 'utf8'))
    const triggers = ios.slice(ios.indexOf('on:'), ios.indexOf('jobs:'))
    expect(triggers).toContain('workflow_dispatch:')
    expect(triggers).not.toMatch(/\b(push|pull_request|schedule|release|workflow_call):/)
    expect(ios).toContain('node .github/scripts/asc-signing-check.mjs')
    for (const secret of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY']) {
      expect(ios).toContain('secrets.' + secret)
    }
    expect(ios).not.toMatch(/permissions:/)
    expect(ios).not.toMatch(/git\s+push/)
  })

  // -------------------------------------------------------------------------
  // The parser, against forms it has to survive.
  //
  // Every fixture below is VALID YAML that the earlier parser matched with
  // nothing and skipped in silence — which is how a real collision could have
  // sat in the tree while the "across all workflows" proof stayed green. Each
  // one is fed through the same producerMap the real proof uses, so what is
  // demonstrated is a collision surfacing, not a regex matching.
  // -------------------------------------------------------------------------

  const wrap = (jobKey, body = '    runs-on: ubuntu-latest\n') =>
    'name: Evil\non:\n  workflow_dispatch:\n\njobs:\n' + jobKey + '\n' + body

  /** The required-context producers once this fixture is added to the real tree. */
  const withFixture = (text) => producerMap([...allJobs(), ...parseJobs(text, 'evil.yml')])

  it('catches a double-quoted job id colliding with a required context', () => {
    expect(withFixture(wrap('  "check":')).check)
      .toEqual(['ci.yml:check', 'evil.yml:check'])
  })

  it('catches a single-quoted job id colliding with a required context', () => {
    expect(withFixture(wrap("  'check':")).check)
      .toEqual(['ci.yml:check', 'evil.yml:check'])
  })

  it('catches a job id followed by a trailing comment', () => {
    expect(withFixture(wrap('  check: # required check')).check)
      .toEqual(['ci.yml:check', 'evil.yml:check'])
  })

  it('catches a double-quoted name override', () => {
    const jobs = parseJobs(wrap('  diagnostic:', '    name: "check"\n    runs-on: ubuntu-latest\n'), 'evil.yml')
    expect(jobs).toEqual([{ id: 'diagnostic', effectiveName: 'check', workflow: 'evil.yml' }])
    expect(withFixture(wrap('  diagnostic:', '    name: "check"\n')).check)
      .toEqual(['ci.yml:check', 'evil.yml:diagnostic'])
  })

  it('catches a single-quoted name override with a trailing comment', () => {
    expect(withFixture(wrap('  diagnostic:', "    name: 'check' # the required one\n")).check)
      .toEqual(['ci.yml:check', 'evil.yml:diagnostic'])
  })

  it('catches a bare name override with a trailing comment', () => {
    expect(withFixture(wrap('  diagnostic:', '    name: check # required\n')).check)
      .toEqual(['ci.yml:check', 'evil.yml:diagnostic'])
  })

  it('reads a bare scalar that merely contains a hash as its whole value', () => {
    // YAML starts a comment at ` #`, not at a bare `#`. Getting this wrong in
    // the safe direction would truncate a name; in the unsafe direction it
    // would let `name: check #x` read as something other than `check`.
    const jobs = parseJobs(wrap('  a:', '    name: build#2\n'), 'evil.yml')
    expect(jobs[0].effectiveName).toBe('build#2')
  })

  it('accepts the ordinary forms unchanged', () => {
    expect(parseJobs(wrap('  plain:'), 'evil.yml'))
      .toEqual([{ id: 'plain', effectiveName: 'plain', workflow: 'evil.yml' }])
    expect(parseJobs('jobs: # the jobs\n  plain:\n    runs-on: x\n', 'evil.yml'))
      .toEqual([{ id: 'plain', effectiveName: 'plain', workflow: 'evil.yml' }])
  })

  // -------------------------------------------------------------------------
  // Indentation is derived, not assumed.
  //
  // YAML gives no meaning to "four spaces": a child need only be indented
  // further than its parent, and siblings share a level. Every fixture below is
  // a valid workflow that the previous parser skipped in silence.
  // -------------------------------------------------------------------------

  /** A workflow whose job body sits at an arbitrary indentation. */
  const atIndent = (bodyIndent, props, keyIndent = 2) =>
    'name: Evil\non:\n  workflow_dispatch:\n\njobs:\n' +
    ' '.repeat(keyIndent) + 'diagnostic:\n' +
    props.map(l => ' '.repeat(bodyIndent) + l).join('\n') + '\n'

  it('catches a job-level name at ANY body indentation, not just four', () => {
    for (const width of [3, 4, 5, 6, 8]) {
      const text = atIndent(width, ['name: check', 'runs-on: ubuntu-latest'])
      expect(parseJobs(text, 'evil.yml'), 'body indent ' + width)
        .toEqual([{ id: 'diagnostic', effectiveName: 'check', workflow: 'evil.yml' }])
      expect(producerMap([...allJobs(), ...parseJobs(text, 'evil.yml')]).check, 'body indent ' + width)
        .toEqual(['ci.yml:check', 'evil.yml:diagnostic'])
    }
  })

  it('catches every KEY spelling at those other indentations too', () => {
    for (const width of [3, 6]) {
      for (const spelling of ['name : check', '"name": check', "'name' : 'check' # required"]) {
        const text = atIndent(width, [spelling, 'runs-on: ubuntu-latest'])
        expect(parseJobs(text, 'evil.yml')[0].effectiveName, width + ' / ' + spelling).toBe('check')
      }
    }
  })

  it('derives the job-key level too, not only the property level', () => {
    // Jobs indented at something other than two spaces are still jobs.
    for (const keyIndent of [1, 3, 4]) {
      const text = atIndent(keyIndent + 2, ['name: check', 'runs-on: ubuntu-latest'], keyIndent)
      expect(parseJobs(text, 'evil.yml'), 'key indent ' + keyIndent)
        .toEqual([{ id: 'diagnostic', effectiveName: 'check', workflow: 'evil.yml' }])
    }
  })

  it('does NOT read a step name as the job name', () => {
    // `steps:` sits at the property level and its items are nested deeper, so a
    // step called `check` is not the job's check-run name. This is the reason
    // "anything deeper is nested content" is a rule and not an oversight.
    for (const width of [3, 4, 6]) {
      const text = atIndent(width, [
        'runs-on: ubuntu-latest',
        'steps:',
        ' '.repeat(2) + '- name: check',
        ' '.repeat(4) + 'run: echo hi',
      ])
      expect(parseJobs(text, 'evil.yml'), 'body indent ' + width)
        .toEqual([{ id: 'diagnostic', effectiveName: 'diagnostic', workflow: 'evil.yml' }])
      expect(producerMap([...allJobs(), ...parseJobs(text, 'evil.yml')]).check, 'body indent ' + width)
        .toEqual(['ci.yml:check'])
    }
  })

  it('ignores nested mappings deeper than the property level', () => {
    const text = atIndent(4, [
      'runs-on: ubuntu-latest',
      'strategy:',
      '  matrix:',
      '    name: check',          // deeper still — matrix data, not a job name
      'env:',
      '  name: check',            // an env var called name, also not a job name
    ])
    expect(parseJobs(text, 'evil.yml'))
      .toEqual([{ id: 'diagnostic', effectiveName: 'diagnostic', workflow: 'evil.yml' }])
  })

  it('REFUSES inconsistent sibling indentation rather than guessing', () => {
    // A property less indented than the established level, but still inside the
    // job, makes the job-level structure ambiguous — and ambiguity is exactly
    // where a `name` can hide.
    const ragged = 'name: Evil\non:\n  workflow_dispatch:\n\njobs:\n  diagnostic:\n' +
      '      runs-on: ubuntu-latest\n' +
      '    name: check\n'                       // 4 where siblings are 6
    expect(() => parseJobs(ragged, 'evil.yml')).toThrow(/evil\.yml:\d+/)
    expect(() => parseJobs(ragged, 'evil.yml')).toThrow(/ambiguous/)

    // And the same one level up: a job key out of line with its siblings.
    const raggedJobs = 'jobs:\n  first:\n    runs-on: x\n   second:\n    runs-on: x\n'
    expect(() => parseJobs(raggedJobs, 'evil.yml')).toThrow(/evil\.yml:\d+/)
  })

  it('REFUSES a job key out of line with its siblings', () => {
    // Reaches the JOB-KEY level check specifically: the first job establishes
    // the level, the second sits outside it, and the body scan has already
    // ended — so nothing else can catch this one.
    const ragged = 'jobs:\n    first:\n      runs-on: x\n  second:\n      runs-on: x\n'
    expect(() => parseJobs(ragged, 'evil.yml')).toThrow(/evil\.yml:\d+/)
    expect(() => parseJobs(ragged, 'evil.yml')).toThrow(/sibling jobs are indented/)

    // The well-formed version of the same shape parses, so the rule is about
    // consistency and not about the number 2.
    expect(parseJobs('jobs:\n    first:\n      runs-on: x\n    second:\n      runs-on: x\n', 'ok.yml'))
      .toEqual([
        { id: 'first', effectiveName: 'first', workflow: 'ok.yml' },
        { id: 'second', effectiveName: 'second', workflow: 'ok.yml' },
      ])
  })

  it('REFUSES a job that declares `name` twice', () => {
    // Invalid YAML, and which one a reader takes is exactly what this parser
    // must not decide — either choice could report a name GitHub does not use.
    const twice = atIndent(4, ['name: check', 'name: something-else', 'runs-on: x'])
    expect(() => parseJobs(twice, 'evil.yml')).toThrow(/more than once/)

    // Including when the two spellings differ, which is how it would slip past
    // a check that only compared identical lines.
    const mixed = atIndent(4, ['name: check', '"name": other', 'runs-on: x'])
    expect(() => parseJobs(mixed, 'evil.yml')).toThrow(/more than once/)

    // A step named `name` deeper in the body is not a second job name.
    expect(parseJobs(atIndent(4, ['name: check', 'steps:', '  - name: a step']), 'ok.yml'))
      .toEqual([{ id: 'diagnostic', effectiveName: 'check', workflow: 'ok.yml' }])
  })

  it('does not let a less-indented property silently alter identity', () => {
    // The dangerous reading of a ragged line is "this belongs to some outer
    // scope, ignore it". It must refuse instead — never quietly return the id.
    const ragged = 'name: Evil\non:\n  workflow_dispatch:\n\njobs:\n  diagnostic:\n' +
      '      runs-on: ubuntu-latest\n' +
      '    name: check\n'
    let threw = false
    try { parseJobs(ragged, 'evil.yml') } catch { threw = true }
    expect(threw, 'a ragged job body must not resolve to any effective name').toBe(true)
  })

  it('catches a name override however the KEY is spelled', () => {
    // Each of these is valid YAML that GitHub honours as a name override, and
    // each was silently skipped before: the job would report a check run called
    // `check` while this proof believed its effective name was `diagnostic`.
    const spellings = [
      '    name: check',
      '    name : check',
      '    "name": check',
      "    'name': check",
      '    "name" : "check" # required',
      "    'name' : 'check' # required",
      '    name :   "check"',
    ]
    for (const line of spellings) {
      const jobs = parseJobs(wrap('  diagnostic:', line + '\n'), 'evil.yml')
      expect(jobs, JSON.stringify(line))
        .toEqual([{ id: 'diagnostic', effectiveName: 'check', workflow: 'evil.yml' }])
      expect(withFixture(wrap('  diagnostic:', line + '\n')).check, JSON.stringify(line))
        .toEqual(['ci.yml:check', 'evil.yml:diagnostic'])
    }
  })

  it('resolves the quoted and spaced spellings to the same key identity', () => {
    // The property is key IDENTITY, not one spelling of it: every form above
    // must reach the same `name` key, and a different key must not.
    for (const line of ['    name: x', '    "name": x', "    'name' : x", '    name : x']) {
      expect(mappingEntry(line, 4), line).toEqual({ key: 'name', rawValue: 'x' })
    }
    for (const line of ['    runs-on: ubuntu-latest', '    "names": x', '    named: x']) {
      expect(mappingEntry(line, 4).key, line).not.toBe('name')
    }
    // A property with no value on the line is a key like any other.
    expect(mappingEntry('    steps:', 4)).toEqual({ key: 'steps', rawValue: '' })
    // And the level is a parameter: the same line read at the wrong level is
    // not a key there at all.
    expect(mappingEntry('    name: x', 6)).toBeNull()
    expect(mappingEntry('    name: x', 2)).toBeNull()
    expect(mappingEntry('      name: x', 6)).toEqual({ key: 'name', rawValue: 'x' })
  })

  it('treats a padded quoted key as a different key, not as `name`', () => {
    // YAML preserves whitespace inside quotes, so `' name '` is the key
    // " name ". GitHub does not read it as the name property, so neither may
    // this — inventing an override the workflow does not have would report a
    // collision that is not there.
    expect(mappingEntry("    ' name ': check", 4)).toEqual({ key: ' name ', rawValue: 'check' })
    expect(parseJobs(wrap('  diagnostic:', "    ' name ': check\n"), 'evil.yml'))
      .toEqual([{ id: 'diagnostic', effectiveName: 'diagnostic', workflow: 'evil.yml' }])
    expect(withFixture(wrap('  diagnostic:', "    ' name ': check\n")).check)
      .toEqual(['ci.yml:check'])
  })

  it('REFUSES an unclassifiable job property rather than reverting to the job id', () => {
    // Reverting to the id is the fail-OPEN outcome: it is exactly what the old
    // parser did, and it reports a name the job does not have.
    const unclassifiable = [
      '    "name: check',            // opened a quote and never closed it
      "    'name: check",            // the same, single-quoted
      '    ?? name check',           // no colon at all
      '    - name: check',           // a sequence item where a mapping belongs
    ]
    for (const line of unclassifiable) {
      expect(() => parseJobs(wrap('  diagnostic:', line + '\n'), 'evil.yml'), JSON.stringify(line))
        .toThrow(/evil\.yml:\d+/)
    }
    // And an empty or unclassifiable VALUE under a well-formed name key.
    for (const line of ['    name:', '    "name": "unterminated', "    name : 'unterminated"]) {
      expect(() => parseJobs(wrap('  diagnostic:', line + '\n'), 'evil.yml'), JSON.stringify(line))
        .toThrow(/evil\.yml:\d+/)
    }
  })

  it('leaves ordinary job properties alone', () => {
    // The refusal must not fire on the shapes real workflows are made of, or it
    // would be a different kind of unsound: loud, but useless.
    const body = [
      '    needs: [changes, verify]',
      '    if: needs.changes.outputs.native == \'true\'',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 10',
      '    env:',
      '      KEY: value',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: a step name, not a job name',
      '        run: echo hello',
    ].join('\n') + '\n'
    expect(parseJobs(wrap('  plain:', body), 'evil.yml'))
      .toEqual([{ id: 'plain', effectiveName: 'plain', workflow: 'evil.yml' }])
  })

  it('REFUSES anything at job-key indentation it cannot classify', () => {
    // Fail closed, by file and line. Skipping these is what the earlier parser
    // did, and it is the whole defect.
    const unclassifiable = [
      '  ??weird',                       // no colon at all
      '  check: some-value',             // a scalar value where a mapping belongs
      '  "check:',                       // opened a quote and never closed it
      "  'check:",                       // the same, single-quoted
      '  - check:',                      // a sequence item
      '  : lonely',                      // an empty key
    ]
    for (const line of unclassifiable) {
      expect(() => parseJobs(wrap(line), 'evil.yml'), JSON.stringify(line)).toThrow(/evil\.yml:\d+/)
    }
  })

  it('REFUSES a name override it cannot classify', () => {
    for (const name of ['    name: "unterminated', "    name: 'unterminated", '    name:']) {
      expect(() => parseJobs(wrap('  a:', name + '\n'), 'evil.yml'), name)
        .toThrow(/evil\.yml:\d+/)
    }
  })

  it('names a workflow that declares jobs: but yields none, and only that one', () => {
    // The per-file guard's failure mode, demonstrated against the REAL workflow
    // set rather than a lone fixture. Asserting the result is EXACTLY
    // ['ghost.yml'] proves both halves at once: the ghost is caught, and no
    // real workflow is silently missing. That redundancy is deliberate — the
    // primary guard above cannot catch its own deletion, so the property is
    // enforced from a second place that a mutation would have to find too.
    const ghost = { name: 'ghost.yml', text: 'name: Ghost\non:\n  workflow_dispatch:\n\njobs:\n' }
    expect(parseJobs(ghost.text, ghost.name)).toEqual([])
    expect(workflowsMissingJobs([...WORKFLOWS, ghost])).toEqual(['ghost.yml'])
  })

  it('does not object to duplicate job ids that are not required contexts', () => {
    // build, run and sync are each defined by two workflows. None of them gates
    // a merge, so none of them is this spec's business — and saying so keeps the
    // rule about required-check identity rather than about tidiness.
    const counts = new Map()
    for (const j of allJobs()) counts.set(j.effectiveName, (counts.get(j.effectiveName) || 0) + 1)
    const duplicated = [...counts].filter(([, n]) => n > 1).map(([name]) => name).sort()
    expect(duplicated).toEqual(['build', 'run', 'sync'])
    for (const name of duplicated) expect(REQUIRED_CHECKS).not.toContain(name)
  })
})
