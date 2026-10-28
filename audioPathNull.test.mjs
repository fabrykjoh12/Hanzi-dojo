import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Nulling the HSK 3-6 audio paths that name no file (FAB-64).
//
// Structural, like audioPathRepair.test.mjs: nothing here runs the SQL. The
// migration was run against production and measured there; see its header and
// docs/BACKLOG.md. What these hold it to are the properties that would make it
// destructive rather than corrective:
//
//   - it clears a path only when no object exists at that path, so a working
//     clip can never be taken away;
//   - it copies every value before clearing it, so the change is reversible;
//   - it stays inside Chinese (CLAUDE.md §1: the frozen tracks are untouched).

const MIGRATION = 'supabase/migrations/20261028090000_null_unreachable_audio_paths.sql'
const sql = readFileSync(MIGRATION, 'utf8')

// Code only — the header quotes the predicates it explains.
const code = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const flat = code.replace(/\s+/g, ' ').toLowerCase()

const DEAD = "v.audio_path is not null and not exists ( select 1 from storage.objects o where o.bucket_id = 'audio' and o.name = v.audio_path )"

describe('it clears only paths that name nothing', () => {
  it('sets audio_path to null and writes no other column', () => {
    const sets = [...code.matchAll(/set\s+([a-z_]+)\s*=/gi)].map(m => m[1].toLowerCase())
    expect(sets).toEqual(['audio_path'])
    expect(flat).toContain('set audio_path = null')
  })

  it('guards the update with the missing-object predicate', () => {
    const update = flat.slice(flat.indexOf('update public.vocabulary'))
    expect(update).toContain(DEAD)
  })

  it('stays inside Chinese', () => {
    const update = flat.slice(flat.indexOf('update public.vocabulary'))
    expect(update).toContain("v.language = 'chinese'")
  })

  it('never writes a column CLAUDE.md forbids, and deletes nothing', () => {
    for (const forbidden of ['ease_factor', ' reps', 'is_easy', 'delete from']) {
      expect(flat).not.toContain(forbidden)
    }
  })
})

describe('it is reversible', () => {
  it('copies each value before clearing it, with the same predicate', () => {
    const insertAt = flat.indexOf('insert into public.vocabulary_unreachable_audio_path')
    const updateAt = flat.indexOf('update public.vocabulary')
    expect(insertAt).toBeGreaterThan(-1)
    expect(insertAt, 'the backup must run before the values it saves are gone').toBeLessThan(updateAt)
    const insert = flat.slice(insertAt, updateAt)
    expect(insert).toContain(DEAD)
    expect(insert).toContain("v.language = 'chinese'")
  })

  it('keeps the backup out of the client', () => {
    expect(flat).toContain('alter table public.vocabulary_unreachable_audio_path enable row level security')
    expect(flat).toContain('revoke all on table public.vocabulary_unreachable_audio_path from anon, authenticated')
  })

  it('re-runs without error or duplicates', () => {
    expect(flat).toContain('create table if not exists public.vocabulary_unreachable_audio_path')
    expect(flat).toContain('on conflict (vocab_id) do nothing')
  })
})
