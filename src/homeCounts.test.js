import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, hskVocabRows } from './fakePostgrest'

// Mutable test state the mocks read from.
const state = {
  cards: [], cardsError: false,
  pendingIds: new Set(), pendingNew: 0,
  vocab: [], vocabError: null,
  acts: [], actsError: null,
  // When set, vocabulary queries run against this capped-PostgREST fake
  // (fakePostgrest.js) instead of the filter-blind thenable below — for the
  // specs that prove completeness past the 1000-row cap.
  vocabDb: null,
}

// Chainable PostgREST-ish builder: every filter returns the builder, awaiting
// it resolves to { data, error } (same trick as grammarReview.test.js).
function thenable(getResult) {
  const b = {}
  for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'in', 'not', 'order', 'range']) b[m] = vi.fn(() => b)
  b.then = (res, rej) => Promise.resolve(getResult()).then(res, rej)
  return b
}

const from = vi.fn((table) => {
  if (table === 'vocabulary') {
    if (state.vocabDb) return state.vocabDb.from('vocabulary')
    return thenable(() => ({ data: state.vocabError ? null : state.vocab, error: state.vocabError }))
  }
  // daily_activity (the study-rhythm query)
  return thenable(() => ({ data: state.actsError ? null : state.acts, error: state.actsError }))
})

// Reference `from` lazily inside a wrapper — vi.mock is hoisted above the const
// declarations, so a direct `{ from }` would read it before initialization.
vi.mock('./supabase', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('./data', () => ({ getTrackCards: vi.fn(async () => { if (state.cardsError) throw new Error('unavailable'); return state.cards }) }))
vi.mock('./reviewJournal', () => ({ pendingReviewVocabIds: vi.fn(async () => state.pendingIds), pendingIntroductionCount: vi.fn(async () => state.pendingNew) }))
vi.mock('./grammarReview', () => ({ countDueGrammar: vi.fn(async () => 0) }))

import { getHomeCounts } from './homeCounts'

const TRACK = { language: 'chinese', system: 'hsk_3', current_level: 1 }

// Every field a caller may already rely on — the failed flag must arrive
// ALONGSIDE this shape, never instead of it.
const SHAPE = [
  'newCount', 'learnCount', 'dueCount', 'easyCount', 'totalWords',
  'learnedCount', 'masteredCount', 'masteredPct',
  'newDoneToday', 'dueTomorrow', 'weakCount', 'forecast7', 'rhythm7',
  'lifetimeLearned', 'lifetimeMastered', 'grammarDueCount',
]

beforeEach(() => {
  state.cards = []; state.cardsError = false; state.pendingIds = new Set(); state.pendingNew = 0
  state.vocab = []; state.vocabError = null
  state.acts = []; state.actsError = null
  state.vocabDb = null
  from.mockClear()
})

describe('getHomeCounts — failed flag', () => {
  it('reports failed: false with the full shape on a successful load', async () => {
    state.vocab = [{ id: 'v1' }, { id: 'v2' }]
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.failed).toBe(false)
    for (const key of SHAPE) expect(counts).toHaveProperty(key)
    expect(counts.totalWords).toBe(2)
    expect(counts.newCount).toBe(2) // both unstarted, within the daily allotment
  })

  it('reports failed: true when the vocabulary query errors, keeping the shape intact', async () => {
    state.vocabError = { message: 'network down' }
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.failed).toBe(true)
    // Callers that ignore the flag still get every field they had before.
    for (const key of SHAPE) expect(counts).toHaveProperty(key)
    expect(counts.newCount).toBe(0)
    expect(counts.dueCount).toBe(0)
  })

  it('does NOT report failed for a genuinely empty vocabulary result', async () => {
    state.vocab = []
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.failed).toBe(false)
    expect(counts.totalWords).toBe(0)
  })

  it('is untouched by a study-rhythm (daily_activity) failure — that query is defensive by design', async () => {
    state.vocab = [{ id: 'v1' }]
    state.actsError = { message: 'boom' }
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.failed).toBe(false)
    expect(counts.rhythm7).toHaveLength(7)
  })
})

// Home is a promise about the session the learner is about to get. Study
// serves every card in the track — a card exists only because the learner
// chose that word — while Home used to count only the current level window,
// so words saved from a story or the dictionary were due but invisible.
describe('getHomeCounts — the deck, not just the level window', () => {
  const dueYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const started = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  it('counts a due card whose word sits outside the level window', async () => {
    state.vocab = [{ id: 'in-level' }]
    state.cards = [
      { vocab_id: 'in-level', state: 'review', reps: 3, due_at: dueYesterday, created_at: started, learned: true, stability: 5, lapses: 0 },
      // Saved from a story above the level, and from the dictionary (no level).
      { vocab_id: 'above-level', state: 'review', reps: 3, due_at: dueYesterday, created_at: started, learned: true, stability: 5, lapses: 0 },
      { vocab_id: 'no-level', state: 'learning', reps: 1, due_at: dueYesterday, created_at: started, learned: false, stability: 0, lapses: 0 },
    ]
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.dueCount).toBe(2)   // both reviews, not just the in-level one
    expect(counts.learnCount).toBe(1) // the dictionary word is due too
  })

  it('keeps level progress scoped to the level window', async () => {
    state.vocab = [{ id: 'in-level' }]
    state.cards = [
      { vocab_id: 'in-level', state: 'review', reps: 8, due_at: dueYesterday, created_at: started, learned: true, stability: 30, lapses: 0 },
      { vocab_id: 'above-level', state: 'review', reps: 8, due_at: dueYesterday, created_at: started, learned: true, stability: 30, lapses: 0 },
    ]
    const counts = await getHomeCounts('u1', TRACK, 5)
    // One active word at this level, one of them mastered — the off-level card
    // must not inflate HSK progress past 100%.
    expect(counts.totalWords).toBe(1)
    expect(counts.masteredCount).toBe(1)
    expect(counts.masteredPct).toBe(1) // a 0–1 fraction (mastery.js), not a percent
    // ...but it is still a real card waiting in the session.
    expect(counts.dueCount).toBe(2)
  })

  it('counts weak words over the whole deck, matching the weak drill', async () => {
    state.vocab = [{ id: 'in-level' }]
    state.cards = [
      { vocab_id: 'above-level', state: 'review', reps: 5, due_at: dueYesterday, created_at: started, learned: true, stability: 2, lapses: 3 },
    ]
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.weakCount).toBe(1)
  })
})

// The 1000-row PostgREST cap: an HSK 1-4 cumulative window is 1,879 words, so
// an unpaged vocabulary fetch silently loses 879 of them and every count
// downstream (totalWords, newCount, level progress) is wrong.
describe('getHomeCounts — complete vocabulary past the 1000-row cap', () => {
  const started = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const TRACK4 = { language: 'chinese', system: 'hsk_3', current_level: 4 }

  it('totalWords covers the full HSK 1-4 window (1,879 words)', async () => {
    const vocabulary = hskVocabRows([1, 2, 3, 4, 5, 6])
    state.vocabDb = fakeSupabase({ vocabulary })
    // One level-1 card sets the study floor to 1 → window 1..4.
    state.cards = [
      { vocab_id: 'v1-0000', state: 'review', reps: 3, due_at: started, created_at: started, learned: true, stability: 5, lapses: 0, vocabulary: { id: 'v1-0000', level: 1 } },
    ]
    const counts = await getHomeCounts('u1', TRACK4, 5)
    expect(counts.failed).toBe(false)
    expect(counts.totalWords).toBe(1879)
    // 1,878 unstarted words exist; the daily allotment caps what Home offers.
    expect(counts.newCount).toBe(5)
  })
})


describe('Home and Study share new-card and pending-write semantics', () => {
  const today = new Date().toISOString()
  const earlier = new Date(Date.now() - 3 * 86400000).toISOString()
  it('offers explicitly saved ungraded cards from outside the window without spending today’s allowance', async () => {
    state.vocab = [{ id: 'window' }]
    state.cards = [{ vocab_id: 'saved', state: 'new', reps: 0, created_at: today }]
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.newDoneToday).toBe(0)
    expect(counts.newCount).toBe(2)
  })
  it('reserves the allowance only for genuine introductions, including off-level words', async () => {
    state.vocab = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]
    state.cards = [{ vocab_id: 'outside', state: 'learning', reps: 1, created_at: earlier, first_reviewed_at: today }]
    const counts = await getHomeCounts('u1', TRACK, 2)
    expect(counts.newDoneToday).toBe(1)
    expect(counts.newCount).toBe(1)
  })
  it('does not spend new-word allowance on an observed prior-knowledge claim', async () => {
    state.vocab = [{ id: 'v1' }]
    state.cards = [{ vocab_id: 'claimed', state: 'review', reps: 1, created_at: today, first_reviewed_at: today, prior_known_at: earlier }]
    const counts = await getHomeCounts('u1', TRACK, 1)
    expect(counts.newDoneToday).toBe(0)
    expect(counts.newCount).toBe(1)
  })
  it('excludes pending words from every review pool and reserves pending introductions', async () => {
    state.vocab = [{ id: 'new-pending' }, { id: 'other' }]
    state.pendingIds = new Set(['new-pending', 'review-pending'])
    state.pendingNew = 1
    state.cards = [{ vocab_id: 'review-pending', state: 'review', reps: 5, stability: 2, lapses: 3, due_at: earlier, created_at: earlier }]
    const counts = await getHomeCounts('u1', TRACK, 2)
    expect(counts.newDoneToday).toBe(1)
    expect(counts.newCount).toBe(1)
    expect(counts.dueCount).toBe(0)
    expect(counts.weakCount).toBe(0)
  })
  it('reports a missing card load as a failure rather than an empty deck', async () => {
    state.cardsError = true
    state.vocab = [{ id: 'v1' }]
    expect((await getHomeCounts('u1', TRACK, 5)).failed).toBe(true)
  })
  it('marks unavailable activity separately from a week with no sessions', async () => {
    state.actsError = { message: 'offline' }
    const counts = await getHomeCounts('u1', TRACK, 5)
    expect(counts.rhythmFailed).toBe(true)
    expect(counts.failed).toBe(false)
  })
})
