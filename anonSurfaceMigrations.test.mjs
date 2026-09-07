import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// FAB-26 findings 1 and 2 — the two the security audit named as things to close
// before a store submission.
//
// READ THIS FIRST: structural assertions over migration text. There is no
// Postgres in this repository's test environment, so nothing here executes the
// SQL or proves a policy behaves. What they can do is hold each migration to
// the specific thing that made the first draft of the LAST migration wrong: a
// detail that would have made it a no-op, or a scope that would have broken a
// legitimate reader. A staging apply is still required.

const DIR = 'supabase/migrations'
const NET = DIR + '/20260907000000_revoke_pg_net_from_clients.sql'
const SCOPE = DIR + '/20260907001000_scope_story_children_to_published.sql'
const read = (p) => readFileSync(p, 'utf8')

// Counting and negative assertions run over CODE, not over the file. These
// migrations explain themselves at length — the headers name the policies they
// rewrite, quote the escape clause, and discuss dropping the extension — so a
// scan of the raw text counts the explanation as if it were SQL. That is the
// same mistake that made an earlier migration spec over-claim, so it is fixed
// here rather than worked around by loosening the numbers.
const codeOf = (p) => read(p)
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n')

describe('revoking pg_net from client roles', () => {
  it('revokes from PUBLIC, not only from the named roles', () => {
    // The detail that decides whether this migration does anything at all.
    // `proacl` on every net.* function is NULL — Postgres's default, which
    // means EXECUTE to PUBLIC. anon and authenticated hold no grant of their
    // own; they inherit it. Revoking from the two named roles alone would
    // leave the PUBLIC grant intact and look like a fix.
    const sql = read(NET)
    expect(sql, 'without this the migration is a no-op')
      .toMatch(/revoke all on all functions in schema net from public/)
    expect(sql).toMatch(/revoke usage on schema net from public/)
  })

  it('also revokes the named roles and future defaults', () => {
    const sql = read(NET)
    for (const role of ['anon', 'authenticated']) {
      expect(sql).toContain('revoke all on all functions in schema net from ' + role)
      expect(sql).toContain('revoke usage on schema net from ' + role)
    }
    // So a function added by a later pg_net upgrade does not arrive reachable.
    expect(sql).toMatch(/alter default privileges in schema net revoke execute on functions from public/)
  })

  it('is safe where pg_net was never installed', () => {
    // Idempotency across environments: a bare REVOKE on a missing schema errors.
    expect(read(NET)).toMatch(/if exists \(select 1 from pg_namespace where nspname = 'net'\)/)
  })

  it('does not drop the extension', () => {
    // Defensible either way, but a DROP is not reversible without recreating
    // the objects, and a revoke closes the hole completely.
    expect(codeOf(NET)).not.toMatch(/drop extension/i)
  })
})

describe('scoping story children to published stories', () => {
  it('scopes all four leaking policies', () => {
    const sql = codeOf(SCOPE)
    for (const name of [
      'authenticated can read story utterances',
      'authenticated users can read story questions',
      'anon can read ready tts_audio',
      'authenticated can read ready tts_audio',
    ]) {
      expect(sql, 'policy not rewritten: ' + name).toContain('"' + name + '"')
    }
    expect(sql.match(/drop policy if exists/g), 'each rewrite must be idempotent')
      .toHaveLength(4)
  })

  it('keeps vocabulary audio anonymously readable', () => {
    // The scoping must apply ONLY to story audio. Without this escape the
    // public surface loses vocabulary pronunciation, which is a real
    // regression dressed as a security fix.
    const sql = codeOf(SCOPE)
    expect(sql.match(/source_type <> 'story_utterance'/g)).toHaveLength(2)
  })

  it('leaves the admin policy alone', () => {
    // `admins can read all tts_audio` is a separate policy and is what keeps
    // the audio tooling working. Touching it here would break admin review of
    // exactly the unpublished content this is about.
    expect(codeOf(SCOPE)).not.toContain('admins can read all tts_audio')
  })

  it('joins back to stories rather than trusting a column', () => {
    const sql = codeOf(SCOPE)
    expect(sql.match(/from public\.stories s/g).length).toBeGreaterThanOrEqual(2)
    expect(sql.match(/s\.is_published/g).length).toBeGreaterThanOrEqual(4)
  })

  it('both migrations order after everything they modify', () => {
    const names = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    const idx = (n) => names.indexOf(n)
    expect(idx('20260907000000_revoke_pg_net_from_clients.sql'))
      .toBeGreaterThan(idx('20260715230000_feedback_discord_webhook.sql'))
    expect(idx('20260907001000_scope_story_children_to_published.sql'))
      .toBeGreaterThan(idx('20260808160000_anon_read_ready_tts_audio.sql'))
  })

  it('reloads the PostgREST schema cache', () => {
    for (const p of [NET, SCOPE]) expect(read(p)).toMatch(/notify pgrst, 'reload schema'/)
  })
})
