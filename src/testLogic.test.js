import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fakeSupabase, hskVocabRows } from './fakePostgrest'

// testLogic.js imports the Supabase client at module load; stub it so the pure
// helpers can be tested in isolation.
//
// getTestStatus additionally touches two live tables (vocabulary, level_unlocks)
// and delegates card fetching to data.js's getTrackCards. A minimal thenable
// query-builder stub lets getTestStatus run for real (Postgrest's client is
// itself thenable — `await supabase.from(...).select(...).eq(...)` resolves
// the chain), and getTrackCards is mocked directly so its own DB-level
// level-scoping (already covered by data.test.js / the level-scope audit)
// doesn't need to be re-simulated here.
const { vocabResult, unlockResult, attemptsResult, trackCardsMock, vocabDb } = vi.hoisted(() => ({
  vocabResult: { data: [{ id: 'a' }, { id: 'b' }], error: null },
  unlockResult: { data: null, error: null },
  attemptsResult: { data: [], error: null },
  trackCardsMock: vi.fn(),
  // When .current is set, vocabulary queries run against a capped-PostgREST
  // fake (fakePostgrest.js) — for the past-the-1000-row-cap specs.
  vocabDb: { current: null },
}))

function makeChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'vocabulary') {
        return vocabDb.current ? vocabDb.current.from('vocabulary') : makeChain(vocabResult)
      }
      if (table === 'level_unlocks') return makeChain(unlockResult)
      if (table === 'test_attempts') return makeChain(attemptsResult)
      throw new Error('unexpected table in test: ' + table)
    },
  },
}))
vi.mock('./data', () => ({ getTrackCards: trackCardsMock }))

import {
  normalizePinyin, checkAnswer, lenientPinyin,
  getTestStatus, getAttemptsToday, resolveTestStatus, canStartTest,
} from './testLogic'

describe('normalizePinyin', () => {
  it('strips tone marks, spaces and case', () => {
    expect(normalizePinyin('Nǐ Hǎo')).toBe('nihao')
    expect(normalizePinyin('lǜ')).toBe('lu')
    expect(normalizePinyin('zhōng guó')).toBe('zhongguo')
  })
  it('folds the v/ü spelling', () => {
    expect(normalizePinyin('nv')).toBe('nu')
    expect(normalizePinyin('nü')).toBe('nu')
  })
  it('handles empty input', () => {
    expect(normalizePinyin('')).toBe('')
    expect(normalizePinyin(null)).toBe('')
  })
  it('accepts a decomposed (NFD) tone mark the same as precomposed', () => {
    // base letter + combining caron (U+030C) vs the precomposed ǎ — this
    // mismatch is what silently made "hai" get marked wrong before.
    const decomposed = 'ha' + '̌' + 'i'
    const precomposed = 'hǎi'
    expect(normalizePinyin(decomposed)).toBe('hai')
    expect(normalizePinyin(precomposed)).toBe('hai')
    expect(normalizePinyin('hai')).toBe('hai')
  })
})

describe('lenientPinyin', () => {
  it('strips numeric tones and matches the plain / decomposed forms', () => {
    expect(lenientPinyin('hai3')).toBe('hai')
    expect(lenientPinyin('hǎi')).toBe('hai')
    expect(lenientPinyin('ha' + '̌' + 'i')).toBe('hai')
  })
})

describe('checkAnswer', () => {
  const vocab = { word: '好', reading: 'hǎo', reading_plain: 'hao' }

  it('accepts the exact character', () => {
    expect(checkAnswer('好', vocab)).toBe(true)
  })
  it('accepts tone-insensitive pinyin (plain or with marks)', () => {
    expect(checkAnswer('hao', vocab)).toBe(true)
    expect(checkAnswer('hǎo', vocab)).toBe(true)
    expect(checkAnswer(' HAO ', vocab)).toBe(true)
  })
  it('rejects a wrong answer and empty input', () => {
    expect(checkAnswer('bad', vocab)).toBe(false)
    expect(checkAnswer('', vocab)).toBe(false)
  })
})

describe('lenientPinyin', () => {
  it('treats tone marks, tone numbers, and case as equivalent', () => {
    expect(lenientPinyin('hǎi')).toBe('hai')
    expect(lenientPinyin('hai3')).toBe('hai')
    expect(lenientPinyin('HAI')).toBe('hai')
    expect(lenientPinyin('hai')).toBe('hai')
  })
  it('ignores spaces, apostrophes, and punctuation', () => {
    expect(lenientPinyin("xi'an")).toBe('xian')
    expect(lenientPinyin('ni hao')).toBe('nihao')
    expect(lenientPinyin('nǚ')).toBe('nu')
    expect(lenientPinyin('nv')).toBe('nu')
  })
})

describe('getTestStatus — level-scoped mastery math excludes NULL-level (dictionary-sourced) cards', () => {
  const track = { language: 'chinese', system: 'pinyin', current_level: 3 }

  beforeEach(() => {
    trackCardsMock.mockReset()
  })

  it('scopes getTrackCards to the exact level, never the unleveled review pool', async () => {
    // The only way a dictionary-sourced (vocabulary.level = null) card can
    // enter a level query is via getTrackCards({ includeUnleveled: true })
    // (see data.js's `.or('level.lte...,level.is.null')` branch). A level
    // test must never opt into that — it has to stay on the plain
    // `{ level }` path, which excludes NULL by construction.
    trackCardsMock.mockResolvedValue([])
    await getTestStatus('user1', track)
    expect(trackCardsMock).toHaveBeenCalledTimes(1)
    const opts = trackCardsMock.mock.calls[0][2]
    expect(opts.level).toBe(track.current_level)
    expect(opts.includeUnleveled).toBeFalsy()
    expect(opts.maxLevel).toBeUndefined()
  })

  it('level-scoped mastery math counts only in-level cards', async () => {
    // Level vocab is [a, b] — a dictionary-sourced word (level = null) can
    // never be one of these rows, since `.eq('level', current_level)` never
    // matches level IS NULL. getTrackCards, scoped the same way, returns only
    // the in-level card `a` (mastered); a null-level card `z` (also mastered)
    // is never in this result — its vocab_id is not in the level's vocab-id
    // set, so it is never counted.
    trackCardsMock.mockResolvedValue([{ vocab_id: 'a', reps: 4, stability: 999 }])
    const status = await getTestStatus('user1', track)
    expect(status.totalWords).toBe(2) // vocab a, b only
    expect(status.masteredCount).toBe(1) // only a; z (null-level) never entered the set
  })
})

describe('getTestStatus — complete denominator past the 1000-row cap', () => {
  const track = { language: 'chinese', system: 'hsk_3', current_level: 6 }

  beforeEach(() => {
    trackCardsMock.mockReset()
  })
  // afterEach, not the test body: a failing assertion must not leave the fake
  // routed in for the specs that follow.
  afterEach(() => { vocabDb.current = null })

  it('HSK 6 (1,621 words) gets the real totalWords, not a 1000-row prefix', async () => {
    const vocabulary = hskVocabRows([5, 6])
    vocabDb.current = fakeSupabase({ vocabulary })
    // Every level-6 word genuinely mastered; the gate must read exactly 100%.
    trackCardsMock.mockResolvedValue(
      vocabulary.filter(v => v.level === 6).map(v => ({ vocab_id: v.id, reps: 6, stability: 30 }))
    )
    const status = await getTestStatus('user1', track)
    expect(status.totalWords).toBe(1621)
    expect(status.masteredCount).toBe(1621)
    expect(status.masteredPct).toBe(1)
    expect(status.testUnlocked).toBe(true)
  })
})

describe('resolveTestStatus — error vs empty vs locked', () => {
  const okVocab = { data: [{ id: 'a' }, { id: 'b' }], error: null }
  const noUnlock = { data: null, error: null }

  it('surfaces a failed vocabulary query as an error, never a fabricated lock', () => {
    const status = resolveTestStatus({ data: null, error: { message: 'network' } }, [], noUnlock)
    expect(status.error).toBe(true)
    expect(status.testUnlocked).toBe(false)
    expect(status.totalWords).toBe(0)
  })

  it('surfaces a failed unlock query as an error too', () => {
    const status = resolveTestStatus(okVocab, [], { data: null, error: { message: 'network' } })
    expect(status.error).toBe(true)
  })

  it('a genuinely empty level is NOT an error — it is locked at 0 / 0', () => {
    const status = resolveTestStatus({ data: [], error: null }, [], noUnlock)
    expect(status.error).toBe(false)
    expect(status.totalWords).toBe(0)
    expect(status.masteredPct).toBe(0)
    expect(status.testUnlocked).toBe(false)
  })

  it('computes the real mastery math when every query succeeds', () => {
    const status = resolveTestStatus(okVocab, [{ vocab_id: 'a', reps: 4, stability: 999 }], noUnlock)
    expect(status.error).toBe(false)
    expect(status.totalWords).toBe(2)
    expect(status.masteredCount).toBe(1)
    expect(status.masteredPct).toBe(0.5)
    expect(status.testUnlocked).toBe(false)
  })

  it('a previously passed level stays unlocked regardless of mastery', () => {
    const status = resolveTestStatus(okVocab, [], { data: { level: 3 }, error: null })
    expect(status.error).toBe(false)
    expect(status.levelPassed).toBe(true)
    expect(status.testUnlocked).toBe(true)
  })
})

describe('getTestStatus — error propagation', () => {
  const track = { language: 'chinese', system: 'pinyin', current_level: 3 }

  beforeEach(() => {
    trackCardsMock.mockReset()
    vocabResult.error = null
  })

  it('returns error: true when the vocabulary query fails', async () => {
    trackCardsMock.mockResolvedValue([])
    vocabResult.error = { message: 'fetch failed' }
    const status = await getTestStatus('user1', track)
    expect(status.error).toBe(true)
    expect(status.testUnlocked).toBe(false)
    vocabResult.error = null
  })

  it('returns error: true when a query rejects outright', async () => {
    trackCardsMock.mockRejectedValue(new Error('offline'))
    const status = await getTestStatus('user1', track)
    expect(status.error).toBe(true)
  })

  it('returns error: false on the happy path', async () => {
    trackCardsMock.mockResolvedValue([])
    const status = await getTestStatus('user1', track)
    expect(status.error).toBe(false)
  })
})

describe('getAttemptsToday — error propagation', () => {
  const track = { language: 'chinese', system: 'pinyin', current_level: 3 }

  it('flags a failed query instead of fabricating 0 attempts', async () => {
    attemptsResult.error = { message: 'fetch failed' }
    attemptsResult.data = null
    const attempts = await getAttemptsToday('user1', track)
    expect(attempts.error).toBe(true)
    attemptsResult.error = null
    attemptsResult.data = []
  })

  it('counts attempts and passes on the happy path', async () => {
    attemptsResult.data = [{ id: 't1', passed: false }, { id: 't2', passed: true }]
    const attempts = await getAttemptsToday('user1', track)
    expect(attempts.error).toBe(false)
    expect(attempts.count).toBe(2)
    expect(attempts.passed).toBe(true)
    attemptsResult.data = []
  })
})

describe('canStartTest — the quiz needs a non-empty vocab pool', () => {
  it('rejects an empty or missing pool (would crash on questions[0])', () => {
    expect(canStartTest([])).toBe(false)
    expect(canStartTest(null)).toBe(false)
    expect(canStartTest(undefined)).toBe(false)
  })
  it('accepts a pool with at least one word', () => {
    expect(canStartTest([{ id: 'a' }])).toBe(true)
  })
})
