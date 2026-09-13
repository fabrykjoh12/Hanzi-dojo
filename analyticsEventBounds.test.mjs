import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// FAB-26 finding 5 — bounding what an anonymous analytics insert can cost.
//
// READ THIS FIRST: most of what follows is a structural assertion over
// migration text. There is no Postgres in this repository's test environment,
// so nothing here executes the SQL or proves a constraint rejects anything. A
// staging apply is still required.
//
// What these CAN do, and what makes them worth writing: two of them are not
// structural at all. They read the client's own limits out of src/analytics.js
// and compare them against the numbers in the migration, so the bound and the
// thing it is bounding cannot drift apart in silence. That is the failure this
// spec exists to prevent — a bound that was generous when it was written and
// silently refuses a real event two releases later, in a code path that
// swallows every error by design.

const MIGRATION = 'supabase/migrations/20260907020000_bound_analytics_event_rows.sql'
const ANALYTICS = 'src/analytics.js'
const read = (p) => readFileSync(p, 'utf8')

// Negative and ordering assertions run over CODE, not the whole file. The
// migration explains itself at length and its header quotes the very SQL being
// asserted about, so a scan of the raw text would count the explanation as if
// it were the migration.
const codeOf = (p) => read(p)
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n')

// Pull `add constraint <name> check (...)` bodies out of the migration.
function constraintBody(name) {
  const code = codeOf(MIGRATION)
  const at = code.indexOf('add constraint ' + name)
  if (at === -1) return null
  const open = code.indexOf('check (', at)
  if (open === -1) return null
  let depth = 0
  for (let i = code.indexOf('(', open); i < code.length; i += 1) {
    if (code[i] === '(') depth += 1
    else if (code[i] === ')') {
      depth -= 1
      if (depth === 0) return code.slice(open, i + 1)
    }
  }
  return null
}

describe('the row bounds are wide enough for what the client actually sends', () => {
  it('admits every event name in the EVENTS map', () => {
    // The drift guard. Adding a longer event name to src/analytics.js without
    // widening the constraint would make that one event vanish in production
    // with no error anywhere — track() swallows the rejection.
    const src = read(ANALYTICS)
    const map = src.slice(src.indexOf('export const EVENTS'), src.indexOf('// ── Context'))
    const names = [...map.matchAll(/:\s*'([a-z0-9_]+)'/g)].map(m => m[1])
    expect(names.length, 'the EVENTS map should have been found').toBeGreaterThan(20)

    const body = constraintBody('analytics_events_name_bounded')
    expect(body, 'the name bound must exist').toBeTruthy()
    const max = Number(body.match(/between 1 and (\d+)/)[1])

    const longest = names.reduce((a, b) => (b.length > a.length ? b : a))
    expect(longest.length, 'longest event name "' + longest + '" exceeds the bound').toBeLessThanOrEqual(max)
  })

  it('admits a props bag built at the client sanitizer\'s own limits', () => {
    // sanitizeProps() is the only thing that decides what reaches props. It
    // keeps numbers, booleans and strings of at most MAX_STRING characters.
    // The bound has to clear a plausible worst case built to exactly those
    // limits, or the biggest legitimate events are the ones that disappear.
    const src = read(ANALYTICS)
    const maxString = Number(src.match(/const MAX_STRING = (\d+)/)[1])
    expect(maxString).toBeGreaterThan(0)

    const body = constraintBody('analytics_events_props_bounded')
    expect(body, 'the props bound must exist').toBeTruthy()
    const max = Number(body.match(/char_length\(props::text\) <= (\d+)/)[1])

    // Ten keys, each a MAX_STRING-length string — comfortably above the eight
    // keys and 157 characters the live table's largest row actually uses.
    const worst = {}
    for (let i = 0; i < 10; i += 1) worst['a_reasonably_long_prop_key_' + i] = 'x'.repeat(maxString)
    expect(JSON.stringify(worst).length, 'a sanitizer-legal props bag exceeds the bound').toBeLessThan(max)
  })
})

describe('the bounds actually bind', () => {
  it('pins props to an object, not just a size', () => {
    // A top-level array or scalar passes any length bound and then reads as
    // null through every `props->>'...'` in the admin RPCs — a row that costs
    // storage and reports nothing.
    const body = constraintBody('analytics_events_props_bounded')
    expect(body).toMatch(/jsonb_typeof\(props\)\s*=\s*'object'/)
  })

  it('bounds every client-supplied text column, not only props', () => {
    const code = codeOf(MIGRATION)
    for (const c of ['name', 'session_id', 'language', 'app_version', 'level', 'props']) {
      expect(code, c + ' is unbounded').toContain('add constraint analytics_events_' + c + '_bounded')
    }
  })

  it('drops each constraint before adding it, so the migration is re-runnable', () => {
    const code = codeOf(MIGRATION)
    for (const c of ['name', 'session_id', 'language', 'app_version', 'level', 'props']) {
      const drop = code.indexOf('drop constraint if exists analytics_events_' + c + '_bounded')
      const add = code.indexOf('add constraint analytics_events_' + c + '_bounded')
      expect(drop, c + ' has no drop').toBeGreaterThan(-1)
      expect(drop, c + ' is added before it is dropped').toBeLessThan(add)
    }
  })

  it('keeps the future bound out of the CHECK constraints', () => {
    // now() is STABLE, not IMMUTABLE, so a CHECK constraint using it fails at
    // DDL time — the migration would not apply at all. It belongs in the
    // policy, which has no such restriction. This spec fails if anyone
    // "tidies" the policy clause into a constraint.
    const code = codeOf(MIGRATION)
    const policyAt = code.indexOf('create policy')
    const nowAt = code.indexOf('now()')
    expect(nowAt, 'the future bound must exist').toBeGreaterThan(-1)
    expect(policyAt, 'the policy must exist').toBeGreaterThan(-1)
    expect(nowAt, 'now() must appear only inside the policy').toBeGreaterThan(policyAt)
  })
})

describe('the insert policy still blocks what it blocked before', () => {
  it('keeps the cross-user clause exactly as it was', () => {
    // The one clause in this policy that is a security boundary rather than a
    // bound. Rewriting it is the mistake this whole migration must not make.
    const code = codeOf(MIGRATION)
    expect(code).toMatch(/\(user_id is null or auth\.uid\(\) = user_id\)/)
  })

  it('leaves the anonymous limb open, deliberately', () => {
    // Requiring auth.uid() here would delete the pre-signup funnel. If a later
    // change closes this limb it must be a deliberate decision with the funnel
    // rehomed, not a tightening that looks like a fix — so this asserts the
    // limb is present rather than absent.
    const code = codeOf(MIGRATION)
    expect(code).toContain('user_id is null or')
    expect(code, 'the anonymous limb was closed').not.toMatch(/with check\s*\(\s*auth\.uid\(\) is not null/)
  })

  it('requires an anonymous row to name a session', () => {
    const code = codeOf(MIGRATION)
    expect(code).toMatch(/user_id is not null or session_id is not null/)
  })

  it('bounds the future and not the past', () => {
    // The offline outbox replays events with the time they happened, so a past
    // created_at is the legitimate case. A symmetric bound would silently drop
    // every queued event from a device that was offline for a while.
    const code = codeOf(MIGRATION)
    expect(code).toMatch(/created_at <= now\(\) \+ interval '1 day'/)
    expect(code, 'the past must stay open for offline replay').not.toMatch(/created_at >= now\(\)/)
  })

  it('reloads PostgREST, or the new policy is not picked up', () => {
    expect(codeOf(MIGRATION)).toMatch(/notify pgrst, 'reload schema'/)
  })
})
