import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// FAB-28 finding 3 — the stale-replay guard on grade_card.
//
// READ THIS FIRST: these are STRUCTURAL assertions over the migration text.
// This repository has no Postgres in its test environment, so nothing here
// executes the SQL. They cannot tell you the function is correct; they can tell
// you the guard is still there, and that the rest of the function was not
// silently altered while adding it. The behavioural proof has to be a staging
// apply — which is why the migration ships committed-but-unapplied, per
// CLAUDE.md §8.

const DIR = 'supabase/migrations'
const OLD = DIR + '/20260822170000_grade_card_verifies_claims.sql'
const NEW = DIR + '/20260906120000_grade_card_rejects_stale_replay.sql'

const read = (p) => readFileSync(p, 'utf8')
const bodyOf = (src) => src.slice(src.indexOf('create or replace function'))
const codeLines = (src) => bodyOf(src)
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('--'))

describe('grade_card rejects a stale replay', () => {
  it('exists and replaces the function idempotently', () => {
    // create or replace, so re-running the migration is safe — CLAUDE.md §8
    // requires migrations in this repo to be idempotent.
    const sql = read(NEW)
    expect(sql).toMatch(/create or replace function public\.grade_card/)
    expect(sql).toMatch(/notify pgrst, 'reload schema'/)
  })

  it('orders after the migration it replaces', () => {
    // Migrations are ordered (CLAUDE.md §7.7). A guard applied before the
    // function it guards would be overwritten by the older definition.
    const names = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    expect(names.indexOf('20260906120000_grade_card_rejects_stale_replay.sql'))
      .toBeGreaterThan(names.indexOf('20260822170000_grade_card_verifies_claims.sql'))
  })

  it('guards BOTH write paths, not just the update', () => {
    const sql = read(NEW)
    // The UPDATE branch: an explicit staleness test before any column is set.
    expect(sql).toMatch(/v_stale\s*:=\s*v_incoming_last_review is not null/)
    expect(sql).toMatch(/v_incoming_last_review < v_existing_last_review/)
    expect(sql).toMatch(/if v_stale then/)
    // The ON CONFLICT branch — the path a stale op with no card id takes, and
    // the one that would otherwise recreate a superseded row.
    expect(sql).toMatch(/or excluded\.last_review >= c\.last_review/)
  })

  it('fails OPEN when either side has no last_review', () => {
    // A row never graded has nothing to be stale against, and an op carrying no
    // last_review cannot be ordered. Dropping those would lose legitimate
    // writes on a technicality.
    const sql = read(NEW)
    expect(sql).toMatch(/c\.last_review is null/)
    expect(sql).toMatch(/excluded\.last_review is null/)
    expect(sql).toMatch(/v_existing_last_review is not null/)
  })

  it('still writes the review log and the daily activity for a stale grade', () => {
    // The grade genuinely happened; it is the SCHEDULING that is superseded.
    // Dropping the log would lose a real observation and push reps and the log
    // count apart in the other direction.
    const sql = read(NEW)
    const staleBranch = sql.slice(sql.indexOf('if v_stale then'), sql.indexOf('-- ── Review log'))
    expect(staleBranch, 'the review log write moved inside the stale branch')
      .not.toMatch(/insert into public\.review_logs/)
    expect(sql).toMatch(/insert into public\.review_logs/)
    expect(sql).toMatch(/insert into public\.daily_activity/)
  })

  it('changes NOTHING ELSE in a 263-line function', () => {
    // The migration was produced by transforming the previous file rather than
    // retyping it, and this is what holds that claim: every line of executable
    // SQL in the old definition must still be present in the new one. A
    // transcription slip, a dropped column from the 13-column whitelist, or a
    // lost verified_at CASE would fail here.
    const before = codeLines(read(OLD))
    const after = new Set(codeLines(read(NEW)))
    const missing = before.filter(l => !after.has(l))
    expect(missing, 'lines lost from the previous definition').toEqual([])
  })

  it('keeps the claim-verification behaviour the previous migration added', () => {
    // The reason grade_card exists in this shape at all. Losing it would make
    // every first calibration grade fail against
    // cards_unverified_claim_is_inert.
    const sql = read(NEW)
    expect(sql.match(/when c\.prior_known_at is not null and c\.verified_at is null/g))
      .toHaveLength(2)   // once per write path
    expect(sql).toMatch(/v_verified_at timestamptz := now\(\)/)
  })
})
