import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hskVocabRows } from './fakePostgrest'
import { todayStr } from './streak'

// The end-to-end paging specs below run buildStudySession for real — through
// the REAL data.js getTrackCards — against a capped-PostgREST fake, so Home
// counts and the Study queue are proven to read the same complete dataset.
const db = vi.hoisted(() => ({ current: null }))
vi.mock('./supabase', () => ({ supabase: { from: (...a) => db.current.from(...a) } }))
vi.mock('./offline', () => ({ cacheGet: vi.fn(async () => null), cacheSet: vi.fn() }))
vi.mock('./ttsAudio', () => ({ loadTtsAudio: vi.fn(async () => {}) }))

import {
  PREP_MAX_AGE_MS, buildStudySession, clearPreparedSession, peekPreparedSession, prepKey,
  prepareStudySession, takePreparedSession,
} from './sessionPrep'

const track = { language: 'chinese', system: 'hsk_3', current_level: 2 }
const args = { userId: 'u1', profile: { daily_new_cards: 10 }, track }
const DATA = { queue: [{ vocab_id: 'v1', state: 'review', vocab: { id: 'v1', word: '今天' } }], levelCards: [], vocabList: [], knownWords: [], firstRun: false }

function fakeBuilder(data = DATA) {
  return () => Promise.resolve(data)
}

beforeEach(() => clearPreparedSession())

describe('prepKey', () => {
  it('scopes the slot to learner, track, level and day', () => {
    expect(prepKey({ userId: 'u1', track, day: '2026-08-16' }))
      .toBe('u1|chinese|hsk_3|2|2026-08-16')
  })
})

describe('prepare → peek → take', () => {
  it('serves the resolved session to peek without consuming it', async () => {
    await prepareStudySession(args, fakeBuilder())
    expect(peekPreparedSession(args)).toEqual(DATA)
    expect(peekPreparedSession(args)).toEqual(DATA) // peek is repeatable
  })

  it('take claims the session exactly once', async () => {
    await prepareStudySession(args, fakeBuilder())
    expect(takePreparedSession(args)).toEqual(DATA)
    expect(takePreparedSession(args)).toBe(null)
    expect(peekPreparedSession(args)).toBe(null)
  })

  it('returns the in-flight promise when taken before the build finishes', async () => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    prepareStudySession(args, () => pending)
    const taken = takePreparedSession(args)
    expect(typeof taken.then).toBe('function')
    release(DATA)
    expect(await taken).toEqual(DATA)
  })

  it('ignores a slot prepared for a different learner or track', async () => {
    await prepareStudySession(args, fakeBuilder())
    expect(takePreparedSession({ ...args, userId: 'u2' })).toBe(null)
    // The mismatched take must NOT discard u1's prepared session.
    expect(takePreparedSession(args)).toEqual(DATA)
  })

  it('expires a stale slot instead of serving old due-dates', async () => {
    let t = 1000
    const now = () => t
    await prepareStudySession(args, fakeBuilder(), now)
    t += PREP_MAX_AGE_MS + 1
    expect(peekPreparedSession(args, now)).toBe(null)
    expect(takePreparedSession(args, now)).toBe(null)
  })

  it('a re-prepare replaces the previous slot', async () => {
    await prepareStudySession(args, fakeBuilder())
    const fresh = { ...DATA, queue: [{ vocab_id: 'v9', state: 'new', vocab: { id: 'v9', word: '花' } }] }
    await prepareStudySession(args, fakeBuilder(fresh))
    expect(takePreparedSession(args)).toEqual(fresh)
  })

  it('clearing the slot un-serves it — what a progress reset needs', () => {
    // The four reset paths call this after the reset RPC succeeds. Without it
    // the slot survives: prepKey covers learner, track, level and day, all
    // unchanged by a reset, so takePreparedSession would still match and hand
    // Study a queue of cards the reset had just deleted.
    return prepareStudySession(args, fakeBuilder()).then(() => {
      expect(peekPreparedSession(args)).toEqual(DATA)
      clearPreparedSession()
      expect(peekPreparedSession(args)).toBe(null)
      expect(takePreparedSession(args)).toBe(null)
    })
  })

  it('a failed build resolves to null so callers fall back quietly', async () => {
    await prepareStudySession(args, () => Promise.reject(new Error('offline')))
    expect(takePreparedSession(args)).toBe(null)
  })
})

// An HSK 1-4 cumulative deck is 1,879 words — past the 1000-row PostgREST cap.
// The session build must see every card and every word of the window, or due
// reviews silently vanish and the "cumulative deck" promise breaks at HSK 4+.
describe('buildStudySession — complete deck past the 1000-row cap', () => {
  const DAY = 24 * 60 * 60 * 1000
  const yesterday = new Date(Date.now() - DAY).toISOString()
  const nextMonth = new Date(Date.now() + 30 * DAY).toISOString()
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString()

  it('serves all 1,879 words and every one of 1,200 due reviews', async () => {
    const vocabulary = hskVocabRows([1, 2, 3, 4, 5, 6])
    const window = vocabulary.filter(v => v.level <= 4)
    // Every window word started; the first 1,200 are due, the rest are not.
    const cards = window.map((v, i) => ({
      id: 'c' + String(i).padStart(4, '0'),
      user_id: 'u1',
      vocab_id: v.id,
      state: 'review',
      due_at: i < 1200 ? yesterday : nextMonth,
      created_at: weekAgo,
      stability: 5,
      lapses: 0,
    }))
    db.current = fakeSupabase({ vocabulary, cards })

    const data = await buildStudySession({
      userId: 'u1',
      // last_studied_on today, so the gentle-return cap stays out of the way.
      profile: { daily_new_cards: 10, last_studied_on: todayStr() },
      track: { language: 'chinese', system: 'hsk_3', current_level: 4 },
    })

    expect(data.vocabList).toHaveLength(1879)
    expect(data.levelCards).toHaveLength(1879)
    expect(data.knownWords).toHaveLength(1879)
    // Every due review is in the session — none lost to the cap — and no
    // card appears twice.
    expect(data.queue).toHaveLength(1200)
    expect(new Set(data.queue.map(c => c.vocab_id)).size).toBe(1200)
  })
})

// Regression (audit HD-AUD-001): a word saved from a story or the dictionary is
// a `new` card row that no grade has touched. It used to be served by nothing —
// excluded from new words because its row exists, and never "due" — while
// still eating a slot of the day's new-word allowance.
describe('buildStudySession — saved words are dealt', () => {
  const DAY = 24 * 60 * 60 * 1000
  const profile = { daily_new_cards: 3, last_studied_on: todayStr() }
  const level1 = { language: 'chinese', system: 'hsk_3', current_level: 1 }
  // One genuine past review, so the gentle first-run cap stays out of the way.
  const studied = (v) => ({
    id: 'c-' + v.id, user_id: 'u1', vocab_id: v.id, state: 'review', reps: 4,
    due_at: new Date(Date.now() + 30 * DAY).toISOString(),
    created_at: new Date(Date.now() - 40 * DAY).toISOString(), stability: 30, lapses: 0,
  })
  const savedRow = (v, ageDays) => ({
    id: 'c-' + v.id, user_id: 'u1', vocab_id: v.id, state: 'new', reps: 0,
    due_at: new Date().toISOString(),
    created_at: new Date(Date.now() - ageDays * DAY).toISOString(),
  })

  it('serves saved words first, oldest first, keeping their real card ids', async () => {
    const vocabulary = hskVocabRows([1])
    const [a, b, c, d] = vocabulary
    db.current = fakeSupabase({ vocabulary, cards: [studied(a), savedRow(c, 1), savedRow(b, 9)] })
    const data = await buildStudySession({ userId: 'u1', profile, track: level1 })
    const newOnes = data.queue.filter(x => x.state === 'new')
    expect(newOnes).toHaveLength(3)
    expect(newOnes.map(x => x.vocab_id)).toEqual(expect.arrayContaining([b.id, c.id, d.id]))
    const savedServed = newOnes.filter(x => x.id)
    expect(savedServed.map(x => x.id).sort()).toEqual(['c-' + b.id, 'c-' + c.id].sort())
  })

  it('a pile of words saved today does not use up the allowance unserved', async () => {
    const vocabulary = hskVocabRows([1])
    const [a, ...rest] = vocabulary
    // Ten words added at once today (the Analyzer's "Add all").
    const pile = rest.slice(0, 10).map(v => savedRow(v, 0))
    db.current = fakeSupabase({ vocabulary, cards: [studied(a), ...pile] })
    const data = await buildStudySession({ userId: 'u1', profile, track: level1 })
    const newOnes = data.queue.filter(x => x.state === 'new')
    // The allowance (3) is spent ON the saved words, not wiped out by them.
    expect(newOnes).toHaveLength(3)
    expect(newOnes.every(x => x.id && x.id.startsWith('c-'))).toBe(true)
  })
})
