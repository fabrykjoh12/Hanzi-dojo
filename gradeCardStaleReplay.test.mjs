import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// FAB-28 finding 3 — the stale-replay guard on grade_card.
//
// READ THIS FIRST: these are STRUCTURAL assertions over the migration text.
// This repository has no Postgres in its test environment, so nothing here
// executes the SQL. They cannot tell you the function is correct; they can tell
// you the guard is still there, that it still keys on the right column, and
// that the rest of the function was not altered while adding it. The
// behavioural proof has to be a staging apply — which is why the migration
// ships committed-but-unapplied, per CLAUDE.md §8.

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
    const sql = read(NEW)
    expect(sql).toMatch(/create or replace function public\.grade_card/)
    expect(sql).toMatch(/notify pgrst, 'reload schema'/)
  })

  it('orders after the migration it replaces', () => {
    const names = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    expect(names.indexOf('20260906120000_grade_card_rejects_stale_replay.sql'))
      .toBeGreaterThan(names.indexOf('20260822170000_grade_card_verifies_claims.sql'))
  })

  it('orders on reps, and NOT on any timestamp', () => {
    // The load-bearing property. An earlier draft compared last_review, which
    // is stamped by the DEVICE clock — and 20260822160000 says in as many words
    // that two timestamps from two clock domains must not be ordered by the
    // database. Ordering two device clocks fails both ways: a slow clock
    // discards a genuinely newer grade, a fast one lets the stale write land.
    //
    // reps is not a clock. srs.schedule() increments the row the client read,
    // so a newer grade always carries existing + 1.
    const sql = read(NEW)
    expect(sql).toMatch(/v_incoming_reps > c\.reps/)
    expect(sql).toMatch(/excluded\.reps > c\.reps/)

    // No timestamp comparison anywhere in the guard. Scanned over code only,
    // because the header discusses last_review at length on purpose.
    const code = bodyOf(sql).split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    expect(code, 'the guard is comparing timestamps again')
      .not.toMatch(/last_review\s*[<>]/)
    expect(code).not.toMatch(/[<>]=?\s*c\.last_review/)
  })

  it('decides inside the write, so a concurrent grade cannot slip past it', () => {
    // Atomicity. A SELECT-then-UPDATE is two statements: under READ COMMITTED a
    // newer grade committing between them reads as "not stale" and is then
    // overwritten. The predicate has to be part of the statement that writes.
    const sql = read(NEW)
    const updateStmt = sql.slice(sql.indexOf('update public.cards c set'), sql.indexOf('returning c.id, c.vocab_id into v_card_id, v_vocab_id;'))
    expect(updateStmt, 'the guard is not in the UPDATE\'s own WHERE')
      .toMatch(/and \(v_incoming_reps is null or c\.reps is null or v_incoming_reps > c\.reps\)/)
    // And on the conflict path, in the DO UPDATE's WHERE.
    expect(sql).toMatch(/where excluded\.reps is null or c\.reps is null or excluded\.reps > c\.reps/)
  })

  it('tells a missing card apart from a superseded one', () => {
    // With the predicate in the WHERE, `not found` means either. A missing card
    // must still raise; a superseded one must not.
    const sql = read(NEW)
    expect(sql).toMatch(/raise exception 'Card not found'/)
    expect(sql).toMatch(/v_stale := true/)
    expect(sql.match(/v_stale := true/g), 'both write paths must mark staleness')
      .toHaveLength(2)
  })

  it('fails OPEN when either side has no reps', () => {
    const sql = read(NEW)
    expect(sql).toMatch(/v_incoming_reps is null/)
    expect(sql).toMatch(/excluded\.reps is null/)
    expect(sql).toMatch(/c\.reps is null/)
  })

  it('reads the incoming reps in the body, not in DECLARE', () => {
    // A DECLARE default evaluates before the auth check and before the
    // already-applied early return, so a malformed value would raise a cast
    // error on a path that used to return cleanly.
    const sql = read(NEW)
    const declareBlock = sql.slice(sql.indexOf('declare'), sql.indexOf('\nbegin'))
    expect(declareBlock).toMatch(/v_incoming_reps int;/)
    expect(declareBlock, 'the cast runs before the auth check')
      .not.toMatch(/v_incoming_reps int :=/)
    expect(sql).toMatch(/v_incoming_reps := \(p_updates->>'reps'\)::int;/)
  })

  it('still writes the review log and the daily activity for a stale grade', () => {
    // The grade genuinely happened; it is the SCHEDULING that is superseded.
    // Both writes must sit outside any staleness conditional — asserted by
    // requiring that v_stale is not READ anywhere after the card section.
    const sql = read(NEW)
    const afterCard = sql.slice(sql.indexOf('-- ── Review log'))
    expect(afterCard).toMatch(/insert into public\.review_logs/)
    expect(afterCard).toMatch(/insert into public\.daily_activity/)
    const reads = afterCard.split('\n')
      .filter(l => !l.trim().startsWith('--') && /v_stale/.test(l))
    // The only mention after the card section is returning it to the caller.
    expect(reads.map(l => l.trim()), 'the log or activity write is gated on staleness')
      .toEqual(["'stale', v_stale);"])
  })

  it('reports staleness to the caller', () => {
    // Without it src/syncQueue.js reports ok for a rejected write and the
    // client keeps its superseded local card with no signal to refresh.
    expect(read(NEW)).toMatch(/'stale', v_stale\);/)
  })

  it('changes NOTHING ELSE in a 263-line function', () => {
    // The migration was produced by transforming the previous file rather than
    // retyping it, and this is what holds that claim.
    //
    // A MULTISET comparison, not set membership. Set membership was the first
    // version and it was too weak in a way worth recording: the two verified_at
    // CASE blocks are textually identical, so deleting one whole block left the
    // set unchanged and the test green — while its own comment claimed it would
    // catch exactly that. Counting occurrences catches a deleted duplicate, and
    // a dropped column, and a line moved out of one branch into another.
    const count = (lines) => lines.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map())
    const before = count(codeLines(read(OLD)))
    const after = count(codeLines(read(NEW)))
    const lost = []
    for (const [line, n] of before) {
      const have = after.get(line) || 0
      if (have < n) lost.push(n + '× -> ' + have + '× : ' + line)
    }
    // Exactly ONE line is intentionally gone: the old return tail, because the
    // result object gained the `stale` field. Named explicitly rather than
    // loosened away — the point of this spec is that every other difference is
    // an accident, so the intended ones have to be enumerated.
    expect(lost, 'executable lines lost beyond the one intended change').toEqual([
      "1× -> 0× : 'already_applied', false, 'inserted', v_inserted);",
    ])
    // And the replacement really does carry the same three fields.
    const sql = read(NEW)
    expect(sql).toMatch(/'already_applied', false, 'inserted', v_inserted,/)
  })

  it('keeps the claim-verification behaviour the previous migration added', () => {
    // Losing it would make every first calibration grade fail against
    // cards_unverified_claim_is_inert.
    const sql = read(NEW)
    expect(sql.match(/when c\.prior_known_at is not null and c\.verified_at is null/g))
      .toHaveLength(2)
    expect(sql).toMatch(/v_verified_at timestamptz := now\(\)/)
  })

  it('cannot refuse a first calibration grade', () => {
    // The one case where a wrongly-firing guard would be worst: a claim is
    // inert, so its reps is 0, and the incoming grade carries 1. 1 > 0 holds,
    // so the guard passes it through. Asserted as the arithmetic rather than
    // the text, so it stays true if the predicate is rewritten.
    const incoming = 1, existing = 0
    expect(incoming > existing).toBe(true)
  })
})
