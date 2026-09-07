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

  it('pins every policy to a role and a table', () => {
    // Without this, stripping `to authenticated` from the two admin escapes
    // passed every other assertion in this file — and a CREATE POLICY with no
    // TO clause defaults to PUBLIC, which includes anon. For a spec file whose
    // stated job is catching an escape that fails open, that was the gap.
    const sql = codeOf(SCOPE)
    const expected = {
      'authenticated can read story utterances': ['public.story_utterances', 'authenticated'],
      'admins can read all story utterances': ['public.story_utterances', 'authenticated'],
      'authenticated users can read story questions': ['public.story_questions', 'authenticated'],
      'admins can read all story questions': ['public.story_questions', 'authenticated'],
      'anon can read ready tts_audio': ['public.tts_audio', 'anon'],
      'authenticated can read ready tts_audio': ['public.tts_audio', 'authenticated'],
    }
    const created = [...sql.matchAll(
      /create policy "([^"]+)"\s+on (public\.\w+) for select to (\w+)/g,
    )].map(m => [m[1], m[2], m[3]])

    expect(created.map(c => c[0]).sort()).toEqual(Object.keys(expected).sort())
    for (const [name, table, role] of created) {
      expect([table, role], name + ' is on the wrong table or role').toEqual(expected[name])
    }
  })

  it('joins back to stories rather than trusting a column', () => {
    const sql = codeOf(SCOPE)
    // Four scoped policies, each reaching `stories` and each testing
    // is_published. The two on the child tables read it directly; the two on
    // tts_audio arrive through story_utterances, so both spellings count.
    const direct = sql.match(/from public\.stories s/g) || []
    const viaUtterance = sql.match(/join public\.stories s on s\.id = u\.story_id/g) || []
    expect(direct).toHaveLength(2)
    expect(viaUtterance).toHaveLength(2)
    expect(sql.match(/s\.is_published/g)).toHaveLength(4)
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
      const touchesNet = /\bschema net\b/.test(sql) || /\bnet\.http/.test(sql)
      if (touchesNet && /\brevoke\b/i.test(sql)) offenders.push(name)
    }
    expect(offenders, 'see docs/BACKLOG.md: a revoke here cannot work as `postgres`')
      .toEqual([])
  })
})
