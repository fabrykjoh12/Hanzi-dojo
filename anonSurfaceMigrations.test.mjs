import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// FAB-26 finding 2 — unpublished story content readable through the tables that
// hang off `stories`.
//
// Finding 1 (pg_net reachable by anon) HAS NO MIGRATION, and that is a
// conclusion rather than an omission: the `net` schema, its twelve functions
// and the extension are all owned by `supabase_admin`, every grant in
// `net`'s ACL reads `.../supabase_admin`, and the `postgres` role a migration
// applies as is neither a superuser nor a member of `supabase_admin`. A REVOKE
// by a non-grantor does not error in Postgres — it warns and changes nothing —
// so a migration would have applied cleanly, reported success, and left
// `has_function_privilege('anon', 'net.http_post…', 'EXECUTE')` true. One was
// written and deleted for exactly that reason; docs/BACKLOG.md carries the
// catalog evidence and the console remedy. Nothing here can assert about it,
// and pretending otherwise is the failure this file exists to avoid.
//
// READ THIS FIRST: what follows is STRUCTURAL assertions over migration text.
// There is no Postgres in this repository's test environment, so nothing here
// executes the SQL or proves a policy behaves. What they can do is hold the
// migration to the details that would make it wrong: a scope that breaks a
// legitimate reader, an escape that fails open, a drop without its create. A
// staging apply is still required.

const DIR = 'supabase/migrations'
const SCOPE = DIR + '/20260907001000_scope_story_children_to_published.sql'
const read = (p) => readFileSync(p, 'utf8')

// EVERY assertion runs over CODE, not over the file — positive ones included.
// This migration explains itself at length and its header quotes the very
// identifiers and predicates being asserted about, so a scan of the raw text
// would count the explanation as if it were SQL. An earlier version of this
// file used raw text for the positive assertions "because they cannot false-
// pass today", which is a property of the current header, not of the rule.
const codeOf = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => {
    // Whole-line and TRAILING `--` comments both. An earlier version dropped
    // only whole-line ones, so a trailing comment counted as code in every
    // positive assertion — not exploited by this migration, which has none,
    // but the rule should not depend on that.
    const i = l.indexOf('--')
    if (i === -1) return l
    // Not a comment if the -- is inside a quoted string: cheap test that covers
    // this file, an even number of single quotes before it.
    const before = l.slice(0, i)
    return (before.split("'").length - 1) % 2 === 0 ? before : l
  })
  .filter(l => l.trim() !== '')
  .join('\n')

describe('scoping story children to published stories', () => {
  it('rewrites all four leaking policies, and re-creates every one it drops', () => {
    // The earlier version of this spec asserted the four names and four DROPs
    // and stopped there — so a file containing only the drops, which would deny
    // all four reads outright, passed it.
    const sql = codeOf(SCOPE)
    const leaking = [
      'authenticated can read story utterances',
      'authenticated users can read story questions',
      'anon can read ready tts_audio',
      'authenticated can read ready tts_audio',
    ]
    for (const name of leaking) {
      expect(sql, 'policy not dropped: ' + name)
        .toContain('drop policy if exists "' + name + '"')
      expect(sql, 'policy dropped but not re-created: ' + name)
        .toContain('create policy "' + name + '"')
    }
    // Nothing is dropped that is not put back.
    const drops = [...sql.matchAll(/drop policy if exists "([^"]+)"/g)].map(m => m[1])
    const creates = [...sql.matchAll(/create policy "([^"]+)"/g)].map(m => m[1])
    for (const name of drops) {
      expect(creates, 'dropped without a create: ' + name).toContain(name)
    }
  })

  it('keeps vocabulary audio anonymously readable, by naming what is allowed', () => {
    // The scoping must apply ONLY to story audio: without the escape the public
    // surface loses vocabulary pronunciation, which is a real regression
    // dressed as a security fix.
    //
    // And the escape must be a whitelist. `source_type <> 'story_utterance'` is
    // exactly equivalent today — the column is NOT NULL with a two-value CHECK
    // — and fails OPEN the moment a third source_type is added.
    const sql = codeOf(SCOPE)
    expect(sql.match(/source_type = 'vocabulary'/g)).toHaveLength(2)
    expect(sql, 'a blacklist escape fails open on the next source_type')
      .not.toMatch(/source_type <> /)
  })

  it('gives the admin surfaces an escape on every table it scopes', () => {
    // tts_audio already had one (`admins can read all tts_audio`, untouched).
    // story_utterances and story_questions had none, so scoping them alone
    // would have left the admin review surface unable to read the utterances
    // behind an unpublished story's clips — the content it exists to review.
    const sql = codeOf(SCOPE)
    expect(sql, 'the existing tts_audio admin policy must not be touched')
      .not.toContain('admins can read all tts_audio')
    for (const name of ['admins can read all story utterances', 'admins can read all story questions']) {
      expect(sql, 'missing admin escape: ' + name).toContain('create policy "' + name + '"')
    }
    // The repo's own admin shape, not a new one.
    expect(sql.match(/from public\.profiles p where p\.id = auth\.uid\(\) and p\.is_admin/g))
      .toHaveLength(2)
  })

  it('pins every policy to a table and its COMPLETE role list', () => {
    // Three ways this has to bite, because each of them widens anonymous access
    // while leaving every other assertion in this file green:
    //
    //   1. No TO clause at all. A CREATE POLICY without one defaults to PUBLIC,
    //      which includes anon.
    //   2. An ADDED role: `to authenticated, anon`. An earlier version captured
    //      the first role with `to (\w+)` and compared that, so the extra role
    //      was invisible.
    //   3. A policy this parser cannot classify — `as permissive for select`,
    //      or `for all` — which simply did not appear in the list at all, so a
    //      wide-open anon policy could be appended and nothing noticed.
    //
    // (3) is why every `create policy` is counted first and the parse is
    // required to explain all of them: an unparsed policy FAILS rather than
    // being skipped.
    const sql = codeOf(SCOPE)
    const expected = {
      'authenticated can read story utterances': ['public.story_utterances', ['authenticated']],
      'admins can read all story utterances': ['public.story_utterances', ['authenticated']],
      'authenticated users can read story questions': ['public.story_questions', ['authenticated']],
      'admins can read all story questions': ['public.story_questions', ['authenticated']],
      'anon can read ready tts_audio': ['public.tts_audio', ['anon']],
      'authenticated can read ready tts_audio': ['public.tts_audio', ['authenticated']],
    }

    const allCreates = [...sql.matchAll(/create policy "([^"]+)"/g)].map(m => m[1])
    // Everything up to the USING clause, so a `for all`, an `as permissive` or
    // an extra role lands inside the captured span rather than escaping it.
    const parsed = new Map()
    for (const m of sql.matchAll(/create policy "([^"]+)"([\s\S]*?)\busing\b/g)) {
      const head = m[2]
      const on = /\bon\s+(public\.\w+)\b/.exec(head)
      const to = /\bto\s+([a-z_ ,]+?)\s*(?:using|$)/i.exec(head + ' ')
      const forSelect = /\bfor\s+select\b/.test(head)
      const permissiveOnly = !/\bas\s+restrictive\b/i.test(head)
      if (!on || !to || !forSelect || !permissiveOnly) continue   // unclassified
      parsed.set(m[1], [on[1], to[1].split(',').map(r => r.trim()).filter(Boolean)])
    }

    expect([...parsed.keys()].sort(), 'a create policy this parse could not classify')
      .toEqual(allCreates.sort())
    expect([...parsed.keys()].sort()).toEqual(Object.keys(expected).sort())
    for (const [name, [table, roles]] of parsed) {
      expect([table, roles], name + ' is on the wrong table, or names extra roles')
        .toEqual(expected[name])
    }
  })

  it('joins back to stories rather than trusting a column', () => {
    const sql = codeOf(SCOPE)
    // THREE of the four scoped policies reach `stories`, and each tests
    // is_published: the two on the child tables read it directly, and the
    // AUTHENTICATED tts_audio policy arrives through story_utterances.
    //
    // The fourth — the anon tts_audio policy — deliberately has no join at all.
    // Its story branch was dead by construction (anon holds no SELECT policy on
    // story_utterances or stories) and bought a plan-time table-grant
    // dependency with a silent failure mode, so it is vocabulary-only and fails
    // closed. That absence is asserted below rather than left implicit.
    const direct = sql.match(/from public\.stories s/g) || []
    const viaUtterance = sql.match(/join public\.stories s on s\.id = u\.story_id/g) || []
    expect(direct).toHaveLength(2)
    expect(viaUtterance).toHaveLength(1)
    expect(sql.match(/s\.is_published/g)).toHaveLength(3)

    // The anon policy, in full: nothing but ready vocabulary audio.
    const anon = /create policy "anon can read ready tts_audio"[\s\S]*?;/.exec(sql)
    expect(anon, 'the anon policy must still be rewritten').not.toBeNull()
    expect(anon[0]).toContain("using (status = 'ready' and source_type = 'vocabulary')")
    expect(anon[0], 'the anon policy must not depend on another table')
      .not.toMatch(/story_utterances|public\.stories/)
  })

  it('orders after every migration whose policies it replaces', () => {
    // The earlier version compared indices in a lexicographically sorted list
    // of timestamp-prefixed names, so it held by construction; it checked 2 of
    // the 4 files involved; and indexOf returns -1 for a renamed file, which
    // passed vacuously. This compares the timestamps themselves and fails if a
    // named file is missing.
    const names = new Set(readdirSync(DIR).filter(n => n.endsWith('.sql')))
    const stamp = (n) => {
      expect(names, 'migration not found: ' + n).toContain(n)
      return n.slice(0, 14)
    }
    const mine = stamp('20260907001000_scope_story_children_to_published.sql')
    for (const replaced of [
      '20260722150000_add_story_utterances.sql',
      '20260630010000_add_story_questions.sql',
      '20260722140000_add_tts_audio.sql',
      '20260808160000_anon_read_ready_tts_audio.sql',
    ]) {
      expect(stamp(replaced) < mine, replaced + ' is not ordered before this migration').toBe(true)
    }
  })

  it('reloads the PostgREST schema cache', () => {
    expect(codeOf(SCOPE)).toMatch(/notify pgrst, 'reload schema'/)
  })

  it('does not ship a migration that tries to revoke pg_net', () => {
    // A guard, not a discriminator, and it is here because the deleted
    // migration would have been indistinguishable from a fix: `net`'s objects
    // are owned by supabase_admin, and a REVOKE by a non-grantor warns and
    // returns success.
    //
    // It reads every migration's CONTENT. An earlier version matched file names
    // only, so `20260910_lock_outbound_http.sql` containing
    // `revoke usage on schema net from anon;` would have sailed through — while
    // its own comment claimed it caught exactly that. The one spec in this file
    // the mutation record did not cover was the one that did not hold.
    const offenders = []
    for (const name of readdirSync(DIR).filter(n => n.endsWith('.sql'))) {
      const sql = codeOf(DIR + '/' + name)
      // Case-insensitive on BOTH halves, and tolerant of the spellings ordinary
      // SQL uses: uppercase, a quoted identifier, extra whitespace, a newline
      // between `schema` and `net`. The first version carried /i on the revoke
      // half only, so `REVOKE USAGE ON SCHEMA NET FROM anon;` walked through a
      // guard whose comment said it caught exactly that.
      const touchesNet = /\bschema\s+"?net"?\b/i.test(sql) || /\bnet\s*\.\s*http/i.test(sql)
      if (touchesNet && /\brevoke\b/i.test(sql)) offenders.push(name)
    }
    // Known and accepted: this is FILE-scoped, not statement-scoped, so a future
    // migration that legitimately mentions net.http and also revokes something
    // unrelated is flagged. That is a false alarm someone reads, not a silent
    // pass, and it is the right way round for a guard about a hole that cannot
    // be closed from here.
    expect(offenders, 'see docs/BACKLOG.md: a revoke here cannot work as `postgres`')
      .toEqual([])
  })
})
