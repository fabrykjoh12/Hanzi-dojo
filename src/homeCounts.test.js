import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable test state the mocks read from.
const state = {
  cards: [],
  vocab: [], vocabError: null,
  acts: [], actsError: null,
}

// Chainable PostgREST-ish builder: every filter returns the builder, awaiting
// it resolves to { data, error } (same trick as grammarReview.test.js).
function thenable(getResult) {
  const b = {}
  for (const m of ['select', 'eq', 'gte', 'lte']) b[m] = vi.fn(() => b)
  b.then = (res, rej) => Promise.resolve(getResult()).then(res, rej)
  return b
}

const from = vi.fn((table) => {
  if (table === 'vocabulary') {
    return thenable(() => ({ data: state.vocabError ? null : state.vocab, error: state.vocabError }))
  }
  // daily_activity (the study-rhythm query)
  return thenable(() => ({ data: state.actsError ? null : state.acts, error: state.actsError }))
})

// Reference `from` lazily inside a wrapper — vi.mock is hoisted above the const
// declarations, so a direct `{ from }` would read it before initialization.
vi.mock('./supabase', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('./data', () => ({ getTrackCards: vi.fn(async () => state.cards) }))
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
  state.cards = []
  state.vocab = []; state.vocabError = null
  state.acts = []; state.actsError = null
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
