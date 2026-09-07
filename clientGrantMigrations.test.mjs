import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// FAB-26 findings 3 and 7 — the two write-surface findings that need DDL.
//
// READ THIS FIRST: structural assertions over migration text. There is no
// Postgres in this repository's test environment, so nothing here executes the
// SQL or proves a grant or a cap behaves. What they can do is hold each
// migration to the detail that would make it wrong — a revoke that is a no-op,
// a cap checked after the write it is meant to prevent, a scope that breaks a
// legitimate caller. A staging apply is still required.

const DIR = 'supabase/migrations'
const CAP = DIR + '/20260907010000_cap_dict_add_to_deck.sql'
const REVOKE = DIR + '/20260907011000_revoke_anon_execute_on_private_rpcs.sql'
const read = (p) => readFileSync(p, 'utf8')

// Negative and ordering assertions run over CODE, not over the file. These
// migrations explain themselves at length and their headers quote the very
// identifiers being asserted about, so a scan of the raw text would count the
// explanation as if it were SQL.
const codeOf = (p) => read(p)
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n')

describe('capping dict_add_to_deck (finding 3)', () => {
  it('checks the cap BEFORE the first write, not after it', () => {
    // The whole point. A cap evaluated after the insert into the global
    // vocabulary table would report an error to the caller and still have
    // appended the row — which is the pollution the finding is about.
    const code = codeOf(CAP)
    const raise = code.indexOf('Dictionary add limit reached')
    const firstInsert = code.indexOf('insert into public.vocabulary')
    const cardInsert = code.indexOf('insert into public.cards')
    expect(raise, 'the cap must exist at all').toBeGreaterThan(-1)
    expect(firstInsert).toBeGreaterThan(-1)
    expect(cardInsert).toBeGreaterThan(-1)
    expect(raise, 'cap must precede the vocabulary insert').toBeLessThan(firstInsert)
    expect(raise, 'cap must precede the card insert').toBeLessThan(cardInsert)
  })

  it('counts the caller\'s own additions, not a global total', () => {
    // A global counter would let one abusive account lock out everyone else,
    // which turns a rate limit into a denial of service.
    const code = codeOf(CAP)
    expect(code).toMatch(/where c\.user_id = v_user_id/)
    expect(code).toMatch(/c\.created_at > now\(\) - interval '24 hours'/)
    // Only the dictionary-sourced rows count: a learner's ordinary curriculum
    // cards must not consume the dictionary budget.
    expect(code).toMatch(/and v\.level is null/)
  })

  it('stops writing ease_factor', () => {
    // CLAUDE.md §10. Asserted against the INSERT's column list specifically —
    // the file legitimately says "ease_factor" in its header and in the
    // function's COMMENT, and a whole-file scan would fail on the explanation.
    const cards = /insert into public\.cards \(([^)]*)\)/.exec(codeOf(CAP))
    expect(cards, 'the card insert must still exist').not.toBeNull()
    expect(cards[1]).not.toContain('ease_factor')
    // Behaviour-identical only because the column has a default; if that ever
    // changes, this insert starts failing rather than silently drifting.
    expect(cards[1]).toContain('state')
  })

  it('makes the uniqueness partial on BOTH level and is_active', () => {
    // level: (language, system, word) has 29 duplicate groups across the whole
    // table, so a global unique index cannot build.
    // is_active: §7.1 cleanup deactivates rather than deletes, so an index that
    // ignored is_active would leave a cleaned-up word permanently unaddable.
    const code = codeOf(CAP)
    expect(code).toMatch(/create unique index if not exists vocabulary_dictionary_word_unique/)
    expect(code).toMatch(/where level is null and is_active;/)
    expect(code, 'a global unique index would fail to build').not.toMatch(
      /create unique index[\s\S]*?on public\.vocabulary \(language, system, word\);/)
  })

  it('adopts the winner of a concurrent insert instead of returning null', () => {
    // ON CONFLICT DO NOTHING returns no row, so RETURNING leaves v_vocab_id
    // null. Without the re-select the loser of the race builds a card against
    // a null vocab_id — a NOT NULL violation, i.e. the fix for the race would
    // itself be the new bug.
    const code = codeOf(CAP)
    const conflict = code.indexOf('on conflict (language, system, word) where level is null and is_active do nothing')
    const reselect = code.indexOf('if v_vocab_id is null then')
    expect(conflict).toBeGreaterThan(-1)
    expect(reselect).toBeGreaterThan(conflict)
  })
})

describe('revoking anon EXECUTE on the private RPCs (finding 7)', () => {
  it('revokes assert_admin from PUBLIC, not only from anon', () => {
    // The detail that decides whether this migration does anything for the one
    // function that matters most. assert_admin's proacl carries a bare `=X/`,
    // which is a grant to PUBLIC; anon inherits it. Revoking from anon alone
    // leaves it callable by anon — a revoke that looks like a fix.
    const code = codeOf(REVOKE)
    expect(code, 'without this the assert_admin revoke is a no-op')
      .toMatch(/revoke execute on function %s from public/)
    expect(code).toMatch(/if r\.proname = 'assert_admin' then/)
  })

  it('leaves the two RPCs the signed-out app actually calls', () => {
    // src/PublicStory.jsx -> public_story, src/HowMuchCanYouRead.jsx ->
    // public_assessment_vocab. Revoking either breaks a public route, which is
    // a real regression dressed as a security fix.
    const code = codeOf(REVOKE)
    expect(code).toContain('grant execute on function public.public_story(uuid) to anon')
    expect(code).toContain('grant execute on function public.public_assessment_vocab(text) to anon')
    // And they must not appear in the revoke list at all.
    const list = /private_rpcs text\[\] := array\[([\s\S]*?)\];/.exec(code)
    expect(list, 'the revoke list must be an explicit array').not.toBeNull()
    expect(list[1]).not.toContain('public_story')
    expect(list[1]).not.toContain('public_assessment_vocab')
  })

  it('names the functions instead of sweeping the whole schema', () => {
    // `revoke ... on all functions in schema public` would also strip the
    // trigger functions and the pg_trgm operators, and would silently take the
    // next legitimately public RPC with it.
    expect(codeOf(REVOKE)).not.toMatch(/on all functions in schema public/)
  })

  it('covers every definer RPC the audit named', () => {
    const list = /private_rpcs text\[\] := array\[([\s\S]*?)\];/.exec(codeOf(REVOKE))[1]
    for (const fn of [
      'admin_active_users', 'admin_client_errors', 'admin_funnel', 'admin_overview',
      'admin_retention', 'admin_story_stats', 'assert_admin', 'claim_story_reward',
      'dict_add_to_deck', 'dict_entry', 'dict_examples_for', 'dict_search',
      'dict_words_containing', 'dojo_hq_members', 'grade_card',
      'reset_current_language_progress', 'reset_language_progress',
    ]) {
      expect(list, fn + ' is missing from the revoke list').toContain("'" + fn + "'")
    }
  })
})
