import { describe, it, expect, vi, beforeEach } from 'vitest'

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
const { vocabResult, unlockResult, trackCardsMock } = vi.hoisted(() => ({
  vocabResult: { data: [{ id: 'a' }, { id: 'b' }], error: null },
  unlockResult: { data: null, error: null },
  trackCardsMock: vi.fn(),
}))

function makeChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'vocabulary') return makeChain(vocabResult)
      if (table === 'level_unlocks') return makeChain(unlockResult)
      throw new Error('unexpected table in test: ' + table)
    },
  },
}))
vi.mock('./data', () => ({ getTrackCards: trackCardsMock }))

import { normalizePinyin, checkAnswer, lenientPinyin, getTestStatus } from './testLogic'

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

  it('does not let a NULL-level card inflate totalWords or masteredCount', async () => {
    // Level vocab is [a, b] — a dictionary-sourced word (level = null) can
    // never be one of these rows, since `.eq('level', current_level)` never
    // matches level IS NULL. getTrackCards, scoped the same way, returns only
    // the in-level card `a` (mastered); a null-level card `z` (also mastered)
    // is never in this result — its vocab_id is not in the level's vocab-id
    // set, so it is never counted.
    trackCardsMock.mockResolvedValue([{ vocab_id: 'a', stability: 999 }])
    const status = await getTestStatus('user1', track)
    expect(status.totalWords).toBe(2) // vocab a, b only
    expect(status.masteredCount).toBe(1) // only a; z (null-level) never entered the set
  })
})
