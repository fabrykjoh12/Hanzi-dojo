import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression for the Then-read cover never loading in production: the hero
// query selected `cover_url`, a column the stories table does not have (the
// real column is `image_path`). PostgREST rejects the whole select on an
// unknown column, so the entire daily-story fetch failed — not just the art.
// This spec runs getDailyStoryCard against a recording supabase mock and pins
// both the selected column and that the story's image_path survives to the
// card the Home hero renders.

const { selects, rows } = vi.hoisted(() => ({ selects: {}, rows: {} }))

vi.mock('./supabase', () => ({
  supabase: {
    from(table) {
      const result = { data: rows[table] || [], error: null }
      const q = {
        select(cols) { selects[table] = cols; return q },
        eq() { return q },
        lte() { return q },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
      }
      return q
    },
  },
}))

vi.mock('./data', () => ({
  getTrackCards: async () => [
    { vocab_id: 'v1', state: 'review', due_at: '2099-01-01T00:00:00.000Z', stability: 30, lapses: 0 },
  ],
}))

import { getDailyStoryCard } from './homeStory'

const TRACK = { language: 'chinese', system: 'hsk_3', current_level: 1 }

beforeEach(() => {
  for (const key of Object.keys(selects)) delete selects[key]
  rows.stories = [{
    id: 's1', title: '6. 我们的歌', content: '我们一起唱歌。',
    level: 1, tier: 1, story_number: 12,
    image_path: 'stories/s1/cover.webp',
  }]
  rows.story_reads = []
  rows.vocabulary = [{ id: 'v1', word: '我们', reading: 'wǒmen', meaning: 'we', level: 1 }]
})

describe('getDailyStoryCard', () => {
  it('selects image_path — the column stories actually has — never cover_url', async () => {
    await getDailyStoryCard('u1', TRACK, 500, '2026-08-20')
    expect(selects.stories).toContain('image_path')
    expect(selects.stories).not.toContain('cover_url')
  })

  it('returns the picked story with its image_path intact for the hero cover', async () => {
    const card = await getDailyStoryCard('u1', TRACK, 500, '2026-08-20')
    expect(card).not.toBeNull()
    expect(card.story.image_path).toBe('stories/s1/cover.webp')
    expect(card.knownPct).toBeGreaterThan(0)
  })

  it('returns null instead of throwing when the fetch fails', async () => {
    rows.stories = []
    expect(await getDailyStoryCard('u1', TRACK, 500, '2026-08-20')).toBeNull()
  })
})
