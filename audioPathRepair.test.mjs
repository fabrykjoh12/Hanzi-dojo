import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The HSK 3-6 audio re-point, and the one property that makes it safe.
//
// READ THIS FIRST: there is no Postgres in this repository's test environment,
// so nothing here executes the SQL or proves a single row changes. The live
// measurement is in the migration header. What these assertions CAN do is hold
// the statement to the details that would make it actively harmful, and for
// this migration there is really only one:
//
//   a slug match that is not unique on BOTH sides attaches ANOTHER WORD'S
//   recording to a card.
//
// That is worse than the silence it replaces. A learner cannot hear that a
// clip is the wrong word -- it is fluent, correctly pronounced Chinese -- so
// the flashcard teaches the error with the app's full authority behind it. The
// obvious "simplification" of this migration (drop a HAVING, or scope the word
// side to the levels being repaired) reads as tidier and silently reintroduces
// exactly that. Both are pinned below.

const MIGRATION = 'supabase/migrations/20260921000000_repair_hsk3_6_audio_paths.sql'
const sql = readFileSync(MIGRATION, 'utf8')

// Assertions run over CODE, never the raw file. The header quotes the
// identifiers and predicates being asserted about, at length and on purpose --
// scanning the text would let the explanation satisfy the test.
const code = sql
  .split('\n')
  .map(l => l.replace(/--.*$/, ''))
  .join('\n')

describe('it writes the one column it claims to write', () => {
  it('updates public.vocabulary', () => {
    expect(code).toMatch(/update\s+public\.vocabulary/i)
  })

  it('sets audio_path, and sets nothing else', () => {
    const sets = [...code.matchAll(/set\s+([a-z_]+)\s*=/gi)].map(m => m[1].toLowerCase())
    expect(sets).toEqual(['audio_path'])
  })

  it('never writes a column CLAUDE.md forbids', () => {
    for (const column of ['ease_factor', 'reps', 'is_easy']) {
      expect(code.toLowerCase()).not.toContain(column)
    }
  })

  it('deletes nothing — §7.1 deactivates vocabulary, never removes it', () => {
    expect(code).not.toMatch(/\bdelete\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
  })
})

describe('the double-uniqueness that keeps another word’s voice off the card', () => {
  // One HAVING guards the files, one guards the words. Two is the whole
  // argument; one is a coin flip.
  it('requires uniqueness on both sides, not one', () => {
    const havings = [...code.matchAll(/having\s+count\(\*\)\s*=\s*1/gi)]
    expect(havings).toHaveLength(2)
  })

  it('tests the WORD side against the whole course, not just the levels being repaired', () => {
    // The word-uniqueness subquery must NOT carry a level filter. If it only
    // considered levels 3-6, a level-5 word could be handed the clip a level-1
    // homophone is already playing, and the bug would land on the level that
    // works today.
    const wordSubquery = code.slice(
      code.indexOf('replace(replace(lower(reading_plain)'),
      code.lastIndexOf('having count(*) = 1'),
    )
    expect(wordSubquery).toMatch(/language\s*=\s*'chinese'/)
    expect(wordSubquery).toMatch(/is_active/)
    expect(wordSubquery).not.toMatch(/level/)
  })

  it('still scopes the ROWS IT WRITES to the broken levels', () => {
    expect(code).toMatch(/v\.level\s+between\s+3\s+and\s+6/i)
  })

  it('folds the slug the same way on both sides — space and apostrophe, case', () => {
    expect(code).toMatch(/replace\(replace\(lower\(reading_plain\),\s*' ',\s*''\),\s*'''',\s*''\)/)
  })
})

describe('it cannot take working audio away, and it can be re-run', () => {
  // Both properties come from the same clause: only a row whose current path
  // resolves to nothing is touched. After the repair those rows resolve, so a
  // second run matches nothing at all.
  it('only writes rows whose current audio_path resolves to no object', () => {
    expect(code).toMatch(
      /not\s+exists\s*\(\s*select\s+1\s+from\s+storage\.objects\s+o\s+where\s+o\.bucket_id\s*=\s*'audio'\s+and\s+o\.name\s*=\s*v\.audio_path\s*\)/i,
    )
  })

  it('draws candidates only from this course’s own audio tree', () => {
    expect(code).toMatch(/name\s+like\s+'chinese\/hsk_3\/level_%'/)
    expect(code).toMatch(/bucket_id\s*=\s*'audio'/)
  })
})

describe('the defect the migration says it is fixing is real in the app', () => {
  it('Listen builds its pool from a NON-NULL audio_path, not a reachable one', () => {
    // This is why unreachable paths are not merely a silent speaker: the
    // listening exercise keeps choosing these words as questions.
    const listen = readFileSync('src/Listen.jsx', 'utf8')
    expect(listen).toMatch(/pool\.filter\(v\s*=>\s*v\.audio_path\)/)
  })

  it('ttsAudio falls back to the same column when a level has no generated row', () => {
    const tts = readFileSync('src/ttsAudio.js', 'utf8')
    expect(tts).toMatch(/getAudioUrl\(vocab\.audio_path\)/)
  })
})
