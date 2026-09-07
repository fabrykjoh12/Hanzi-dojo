import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isMissingRpc } from './src/syncQueue.js'
import { calibrationUpdates } from './src/calibration.js'

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

  // Not a spec about apply order in any database — a filename comparison
  // cannot be one. It exists so a migration added with an EARLIER timestamp,
  // which would be applied before the function it means to replace, is caught.
  it('is named later than the migration it replaces', () => {
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
    // Both write paths, and both read the RAW incoming value rather than
    // excluded.reps — see the ON CONFLICT spec below for why that matters.
    expect(sql.match(/v_incoming_reps > c\.reps/g), 'both write paths must be guarded')
      .toHaveLength(2)

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
    expect(sql).toMatch(/where v_incoming_reps is null or c\.reps is null or v_incoming_reps > c\.reps/)
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
    expect(sql.match(/v_incoming_reps is null/g), 'both paths must fail open')
      .toHaveLength(2)
    expect(sql.match(/c\.reps is null/g)).toHaveLength(2)
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

  it('writes NO review log and NO day count for a refused grade', () => {
    // The first version of this migration wrote both, and its own header is
    // the argument against that: it disqualifies the last_review draft partly
    // because such a draft "DISCARDS a genuinely newer grade, while still
    // writing its review_logs row — so the log count now exceeds reps, the same
    // disagreement this guard exists to prevent". Identical mechanism when the
    // key is reps. Worse, `count(review_logs) > c.reps` is the query
    // docs/BACKLOG.md uses to COUNT the victims of the original bug, so a
    // logging guard would keep manufacturing its own damage signature and the
    // fix would be indistinguishable from the bug in the data.
    const sql = read(NEW)
    const afterCard = sql.slice(sql.indexOf('-- ── Review log'))
    expect(afterCard).toMatch(/if p_log is not null and not v_stale then/)
    expect(afterCard).toMatch(/if p_activity is not null and not v_stale then/)
  })

  it('reports staleness to the caller, and the caller reads it', () => {
    // A flag nothing consumes is not a signal. syncQueue reported ok:true for
    // a refused write and flushOutbox then deleted the op, while Study carried
    // on from `res.updates` the server had just declined — so the NEXT grade in
    // the session was computed from state that exists nowhere.
    expect(read(NEW)).toMatch(/'stale', v_stale/)
    const client = readFileSync(fileURLToPath(new URL('./src/syncQueue.js', import.meta.url)), 'utf8')
    expect(client, 'gradeCardWrite never reads row.stale').toMatch(/stale: !!row\.stale/)
    const study = readFileSync(fileURLToPath(new URL('./src/Study.jsx', import.meta.url)), 'utf8')
    expect(study, 'Study ignores a refused grade').toMatch(/write\.stale/)
    expect(study, 'a refused grade still puts the card back carrying refused state')
      .toMatch(/res\.stay && !staleGrade/)
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
    // Enumerated rather than loosened away: the point of this spec is that
    // every other difference is an accident, so the intended ones are named.
    // The return tail changed because the result gained `stale`; the two
    // conditionals gained `and not v_stale`, which is what stops a refused
    // grade writing a log or a day count.
    expect(lost.sort(), 'executable lines lost beyond the intended changes').toEqual([
      "1× -> 0× : 'already_applied', false, 'inserted', v_inserted);",
      '1× -> 0× : if p_activity is not null then',
      '1× -> 0× : if p_log is not null then',
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
    // The case where a wrongly-firing guard would be worst: a claim is inert,
    // so its reps is 0, and the guard must let the first real observation
    // through. An earlier version of this spec asserted `1 > 0` — a JavaScript
    // tautology that read neither the SQL nor the scheduler and could not fail.
    // This runs the actual scheduler over the actual claim shape.
    const claim = { id: 'c1', vocab_id: 'v1', state: 'new', reps: 0, lapses: 0, stability: null, difficulty: null, interval_days: 0, learning_step: 0, prior_known_at: '2026-08-01T00:00:00Z', verified_at: null }
    const incoming = calibrationUpdates(claim, false).updates.reps
    expect(incoming, 'a calibration check must record an observation').toBeGreaterThan(0)
    expect(incoming > (claim.reps || 0), 'the guard would refuse the first calibration check').toBe(true)
  })

  it('the ON CONFLICT guard fails open on the same input the UPDATE guard does', () => {
    // The insert's values list coalesces reps to 0, so `excluded.reps` can
    // never be null and a fail-open limb written against it is dead. A call
    // whose p_updates carries no reps, against an existing row with reps > 0,
    // would then be rejected in full — state, due_at, stability, learned,
    // verified_at — while the UPDATE path let the same input through. Both
    // read the raw incoming value.
    const sql = read(NEW)
    const conflict = sql.slice(sql.indexOf('on conflict (user_id, vocab_id) do update'))
    expect(conflict, 'the ON CONFLICT guard reads excluded.reps, which is never null')
      .not.toMatch(/where excluded\.reps is null/)
    expect(conflict).toMatch(/where v_incoming_reps is null or c\.reps is null or v_incoming_reps > c\.reps/)
  })

  it("a raise from inside grade_card is never read as an absent function", () => {
    // grade_card raises 'Card not found' for an op naming a row that is gone —
    // an undo of a new card, or a language reset, leaves exactly such an op in
    // the outbox. isMissingRpc matched a bare 'not found', so that latched
    // rpcUnavailable for the whole page load and dropped every later grade to
    // the legacy path: a bare UPDATE with no guard at all. One deleted card
    // disabled this migration's entire guarantee until reload.
    expect(isMissingRpc({ code: 'P0001', message: 'Card not found' })).toBe(false)
    expect(isMissingRpc({ message: 'Card not found' })).toBe(false)
    expect(isMissingRpc({ code: 'P0001', message: 'vocab_id required for a new card' })).toBe(false)
    // And it still recognises the state it exists for.
    expect(isMissingRpc({ code: 'PGRST202', message: 'anything' })).toBe(true)
    expect(isMissingRpc({ message: 'Could not find the function public.grade_card in the schema cache' })).toBe(true)
  })

  it('the "nothing else changed" comparison notices ADDED lines too', () => {
    // The multiset check only reported lost lines, so a stray
    // `delete from public.review_logs`, an extra `update public.cards set
    // reps = 0`, or a widened grant all passed green while the spec's own
    // comment claimed it held the whole "transformed, not retyped" claim.
    const count = (lines) => lines.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map())
    const before = count(codeLines(read(OLD)))
    const after = count(codeLines(read(NEW)))
    const gained = []
    for (const [line, n] of after) {
      const had = before.get(line) || 0
      if (n > had) gained.push(line.trim())
    }
    // Enumerated, not pattern-matched. Every line here is the guard, the
    // staleness bookkeeping that tells a missing card apart from a superseded
    // one, or the new return field — and listing them is what makes a stray
    // `delete from public.review_logs`, an extra `update public.cards`, or a
    // widened grant fail instead of passing under a loose regex.
    expect(gained.sort(), 'a statement unrelated to the guard was added').toEqual([
      "'already_applied', false, 'inserted', v_inserted,",
      "'stale', v_stale);",
      'and (v_incoming_reps is null or c.reps is null or v_incoming_reps > c.reps)',
      'end if;',
      'from public.cards c',
      'if not found then',
      'if p_activity is not null and not v_stale then',
      'if p_log is not null and not v_stale then',
      'if v_card_id is null then',
      'select c.id, c.vocab_id into v_card_id, v_vocab_id',
      'v_incoming_reps := (p_updates->>\'reps\')::int;',
      'v_incoming_reps int;',
      'v_stale := true;',
      'v_stale boolean := false;',
      'where c.id = p_card_id and c.user_id = v_user_id;',
      'where c.user_id = v_user_id and c.vocab_id = p_vocab_id;',
      'where v_incoming_reps is null or c.reps is null or v_incoming_reps > c.reps',
    ])
  })
})
