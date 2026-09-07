import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

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

  it('covers exactly the definer RPCs that still hold an anon grant', () => {
    // The first version of this spec hard-coded the same seventeen names as the
    // migration and asserted them back at it: it could only fail if someone
    // edited one and forgot the other, and it would have passed on a migration
    // that revoked nothing. This derives the expected set from the rest of the
    // repository instead, so adding a definer RPC in a later migration and
    // forgetting it here fails HERE.
    //
    // The rule, which matches the live catalog: Supabase's default privileges
    // grant EXECUTE on a new function in `public` to anon, so a definer
    // function holds an anon grant unless some migration explicitly revoked it
    // FROM ANON. `revoke ... from public` is not the same thing and does not
    // remove the explicit grant — conflating the two is what made an earlier
    // draft of this derivation report two functions instead of seventeen.
    const files = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    const definer = new Set()
    const revokedFromAnon = new Set()
    const droppedFunctions = new Set()

    for (const f of files) {
      const sql = read(DIR + '/' + f)
      let m
      const created = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi
      while ((m = created.exec(sql)) !== null) {
        if (/security\s+definer/i.test(sql.slice(m.index, m.index + 1200))) definer.add(m[1])
      }
      const droppedRe = /drop\s+function\s+if\s+exists\s+public\.([a-z0-9_]+)/gi
      while ((m = droppedRe.exec(sql)) !== null) droppedFunctions.add(m[1])
      const revokedRe = /revoke[\s\S]{0,120}?on\s+function\s+public\.([a-z0-9_]+)\s*\([^)]*\)\s*from\s+([a-z_, ]+)/gi
      while ((m = revokedRe.exec(sql)) !== null) {
        if (/\banon\b/.test(m[2])) revokedFromAnon.add(m[1])
      }
    }

    // The two the signed-out app calls keep their grant (asserted separately
    // above); a dropped function has nothing to revoke.
    const KEEP = ['public_story', 'public_assessment_vocab']
    const expected = [...definer]
      .filter(n => !revokedFromAnon.has(n))
      .filter(n => !droppedFunctions.has(n))
      .filter(n => !KEEP.includes(n))
      .sort()

    const list = /private_rpcs text\[\] := array\[([\s\S]*?)\];/.exec(codeOf(REVOKE))[1]
    const actual = [...list.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]).sort()

    expect(expected.length, 'the derivation itself must find something').toBeGreaterThan(10)
    expect(actual).toEqual(expected)
  })

  it('drops the older, unapplied index it supersedes', () => {
    // 20260724170000 declares vocabulary_dict_word_uniq on the same key without
    // the is_active limb. It is unapplied in production, but any environment
    // applied in filename order gets both — and then a word deactivated by §7.1
    // cleanup cannot be re-added at all: the older index is also a valid
    // ON CONFLICT arbiter, DO NOTHING fires, the is_active-filtered re-select
    // finds nothing, and the card insert violates vocab_id NOT NULL.
    const cap = codeOf(CAP)
    const dropAt = cap.indexOf('drop index if exists public.vocabulary_dict_word_uniq')
    const createAt = cap.indexOf('create unique index if not exists vocabulary_dictionary_word_unique')
    expect(dropAt, 'the superseded index must be dropped').toBeGreaterThan(-1)
    expect(dropAt, 'and dropped before the replacement is built').toBeLessThan(createAt)
  })

  it('brakes on something the caller cannot delete', () => {
    // The per-caller limb counts the caller's own `cards`, and `cards` carries
    // a delete policy the app itself uses — so 200 adds, one DELETE, repeat,
    // and the counter is zero while the global vocabulary rows remain (§7.1
    // forbids deleting those). A cap counted from state the adversary controls
    // is not a cap. The second limb counts `vocabulary` itself.
    const cap = codeOf(CAP)
    expect(cap).toMatch(/c_global_daily_cap constant int := \d+/)
    expect(cap, 'the global limb must count vocabulary rows, not cards')
      .toMatch(/from public\.vocabulary\n\s*where level is null\n\s*and created_at > now\(\) - interval '24 hours'/)
    // And it must gate the branch that creates one, before the insert.
    const brake = cap.indexOf('v_recent_global >= c_global_daily_cap')
    const insert = cap.indexOf('insert into public.vocabulary')
    expect(brake).toBeGreaterThan(-1)
    expect(brake).toBeLessThan(insert)
  })

  it('gives the limit a code the client can recognise', () => {
    // Without it the 201st add of the day is indistinguishable from a dead
    // connection: Dictionary.jsx swallowed the throw entirely and the reader
    // replaced it with "Couldn't save that word".
    const cap = codeOf(CAP)
    expect(cap.match(/using errcode = c_limit_errcode/g)).toHaveLength(2)
    expect(cap).toMatch(/c_limit_errcode constant text := 'HD429'/)
    expect(read('src/dictSearch.js')).toContain("DICT_ADD_LIMIT_CODE = 'HD429'")
  })

  it('reloads the PostgREST schema cache from both migrations', () => {
    // Grants and function bodies are exactly what PostgREST caches, and 35
    // migrations in this directory already do it.
    for (const f of [CAP, REVOKE]) expect(codeOf(f)).toMatch(/notify pgrst, 'reload schema'/)
  })
})
