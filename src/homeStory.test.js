import { describe, it, expect, vi, beforeEach } from 'vitest'

// getDailyStoryCard's contract with the PRODUCTION `stories` table.
//
// This spec exists because of a live release blocker: the query selected
// `cover_url`, a column that does not exist. PostgREST answers an unknown
// column with 42703 and no rows, so `storiesRes.data` was null, the daily pick
// saw zero stories, and Home's "Then read" hand-off silently vanished for every
// learner. Nothing caught it — the E2E mock replies with fixtures regardless of
// what the select asked for, so a wrong column list is invisible there.
//
// So the fake below is column-aware: it validates the select list against the
// real production column set (`information_schema` on project bvqvturqupbggxaeihvi,
// checked 2026-08-24) and fails the query the way the server does. Reintroduce
// `cover_url` — in this query or any other — and these specs go red.

// Every column `public.stories` actually has, in production, today.
const STORIES_COLUMNS = [
  'id', 'language', 'system', 'level', 'story_number', 'title', 'content',
  'english_summary', 'is_published', 'created_at', 'updated_at', 'tier',
  'tier_min_words', 'english_content', 'has_audio', 'image_path',
  'presentation', 'interactions', 'panels', 'generation_meta',
]

const state = {
  stories: [],
  reads: [],
  vocab: [],
  cards: [],
  // Every select list the code under test asked for, keyed by table.
  selects: {},
}

// PostgREST's own error for a column that isn't there, near enough to matter:
// `data` is null and the row set is gone entirely.
function undefinedColumn(table, col) {
  return {
    data: null,
    error: { code: '42703', message: 'column ' + table + '.' + col + ' does not exist' },
  }
}

// Chainable builder that resolves to { data, error }, like the PostgREST client.
// `.range()` is supported so fetchPaged's vocabulary read works unchanged.
function thenable(table, getRows) {
  const b = {}
  let failure = null
  b.select = vi.fn((cols) => {
    ;(state.selects[table] = state.selects[table] || []).push(cols)
    if (table === 'stories') {
      const asked = String(cols).split(',').map(s => s.trim()).filter(Boolean)
      const unknown = asked.find(c => !STORIES_COLUMNS.includes(c))
      if (unknown) failure = undefinedColumn(table, unknown)
    }
    return b
  })
  for (const m of ['eq', 'gte', 'lte', 'lt', 'in', 'not', 'is', 'order']) b[m] = vi.fn(() => b)
  b.range = vi.fn(() => b)
  b.then = (res, rej) => Promise.resolve(failure || { data: getRows(), error: null }).then(res, rej)
  return b
}

const from = vi.fn((table) => {
  if (table === 'stories') return thenable('stories', () => state.stories)
  if (table === 'story_reads') return thenable('story_reads', () => state.reads)
  return thenable('vocabulary', () => state.vocab)
})

vi.mock('./supabase', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('./data', () => ({ getTrackCards: vi.fn(async () => state.cards) }))

import { getDailyStoryCard } from './homeStory'

const TRACK = { language: 'chinese', system: 'hsk_3', current_level: 1 }
const USER = '00000000-0000-4000-8000-000000000001'
const TODAY = '2026-08-24'

// A published story shaped exactly like a production row.
function storyRow(over = {}) {
  return {
    id: 'st-hsk1-12', title: '6. 我们的歌', content: '我们一起唱歌。',
    level: 1, tier: 1, story_number: 12,
    image_path: 'stories/st-hsk1-12/cover.webp',
    ...over,
  }
}

beforeEach(() => {
  state.stories = [storyRow()]
  state.reads = []
  state.vocab = [{ id: 'v1', word: '我们', reading: 'wǒmen', meaning: 'we', level: 1 }]
  state.cards = [{ vocab_id: 'v1', state: 'review', stability: 25, reps: 3, learned: true }]
  state.selects = {}
  from.mockClear()
})

describe('getDailyStoryCard — the stories column contract', () => {
  it('asks for image_path and never for cover_url', async () => {
    await getDailyStoryCard(USER, TRACK, 1, TODAY)
    const cols = (state.selects.stories || []).join(' | ')
    expect(cols).toContain('image_path')
    expect(cols).not.toContain('cover_url')
  })

  it('selects only columns that exist on the production stories table', async () => {
    await getDailyStoryCard(USER, TRACK, 1, TODAY)
    const asked = (state.selects.stories || [])
      .flatMap(c => String(c).split(',').map(s => s.trim()))
      .filter(Boolean)
    expect(asked.length).toBeGreaterThan(0)
    for (const col of asked) expect(STORIES_COLUMNS).toContain(col)
  })

  it('returns a card against a production-shaped stories table', async () => {
    // The regression itself: with `cover_url` in the select, the server-shaped
    // fake rejects the query, the pick sees no stories, and this is null — the
    // exact way Home lost its story hand-off in production.
    const card = await getDailyStoryCard(USER, TRACK, 1, TODAY)
    expect(card).not.toBeNull()
    expect(card.story.id).toBe('st-hsk1-12')
  })

  it('carries image_path through to the caller so Home can resolve the cover', async () => {
    const card = await getDailyStoryCard(USER, TRACK, 1, TODAY)
    expect(card.story.image_path).toBe('stories/st-hsk1-12/cover.webp')
    expect(card.story.cover_url).toBeUndefined()
  })
})

describe('getDailyStoryCard — degradation', () => {
  it('still returns the card when the story has no artwork', async () => {
    // Most published stories have no cover yet; a missing one is the norm, not
    // a failure. The card must arrive intact so Home paints its fallback tile.
    state.stories = [storyRow({ image_path: null })]
    const card = await getDailyStoryCard(USER, TRACK, 1, TODAY)
    expect(card).not.toBeNull()
    expect(card.story.image_path).toBeNull()
    expect(card.sentence).toBe('我们一起唱歌。')
  })

  it('returns null rather than throwing when the fetch fails (offline)', async () => {
    from.mockImplementationOnce(() => { throw new Error('Failed to fetch') })
    await expect(getDailyStoryCard(USER, TRACK, 1, TODAY)).resolves.toBeNull()
  })

  it('returns null when nothing is published yet', async () => {
    state.stories = []
    await expect(getDailyStoryCard(USER, TRACK, 1, TODAY)).resolves.toBeNull()
  })
})
