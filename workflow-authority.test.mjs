import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

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
