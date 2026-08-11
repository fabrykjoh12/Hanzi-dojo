import { describe, it, expect } from 'vitest'
import { DAILY_STORY_COLUMNS } from './homeStory'

// The bug this exists to prevent, found 2026-08-11 while giving Home's story
// hand-off its cover art:
//
//   .from('stories').select('id, title, content, level, tier, story_number, cover_url')
//
// `stories` has no `cover_url` and never has — the column is `image_path`.
// PostgREST answers an unknown column with a 400, supabase-js reports that in
// `error` and leaves `data` null, and `getDailyStoryCard`'s own
// `stories.length === 0` guard then returned null. Silently, on every load, for
// every learner: **Home's "Then read" hand-off had never rendered in
// production.** Verified against the live schema —
// `select id, cover_url from stories` fails with 42703.
//
// Nothing could catch it: the unit suite does not touch Supabase, and the e2e
// mock answers any `select` with its own rows regardless of the columns asked
// for. So the column list is asserted here, by name, against the schema as it
// actually is.

// Every column `stories` has, as at 2026-08-11. Update this list when the
// schema changes — that is the point of it.
const STORIES_COLUMNS = new Set([
  'id', 'language', 'system', 'level', 'story_number', 'title', 'content',
  'english_summary', 'is_published', 'created_at', 'updated_at', 'tier',
  'tier_min_words', 'english_content', 'has_audio', 'image_path', 'presentation',
  'interactions', 'panels',
])

describe('the daily-story query', () => {
  it('asks only for columns that exist', () => {
    for (const col of DAILY_STORY_COLUMNS.split(',').map(c => c.trim())) {
      expect(STORIES_COLUMNS.has(col), col + ' is not a column on `stories`').toBe(true)
    }
  })

  it('names the cover column correctly', () => {
    expect(DAILY_STORY_COLUMNS).toContain('image_path')
    expect(DAILY_STORY_COLUMNS).not.toContain('cover_url')
  })

  it('still asks for what the card needs to render', () => {
    // The pick needs level/tier/story_number, the readability needs content, and
    // the row needs a title and its artwork.
    for (const needed of ['id', 'title', 'content', 'level', 'tier', 'story_number', 'image_path']) {
      expect(DAILY_STORY_COLUMNS).toContain(needed)
    }
  })
})
