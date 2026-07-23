import { describe, it, expect } from 'vitest'
import {
  buildTimeline, tokenAtTime, startOfToken, tokenWeight, spotlightStyle,
  LEAD_IN_MS, TAIL_OUT_MS, SPEED_RATES, SPOTLIGHT_DIM,
} from './readAlong'

const toks = (...texts) => texts.map(t => ({ text: t, vocab: null }))

describe('tokenWeight', () => {
  it('counts one syllable per Han character', () => {
    expect(tokenWeight('今天').syllables).toBe(2)
    expect(tokenWeight('我').syllables).toBe(1)
  })
  it('counts one syllable per kana, but small kana ride the previous mora', () => {
    expect(tokenWeight('たかし').syllables).toBe(3)
    expect(tokenWeight('きょう').syllables).toBe(2)
  })
  it('gives punctuation a pause and no width', () => {
    expect(tokenWeight('，')).toEqual({ syllables: 0, pause: 0.5 })
    expect(tokenWeight('。')).toEqual({ syllables: 0, pause: 1 })
  })
  it('counts one syllable per vowel run for latin and Cyrillic', () => {
    expect(tokenWeight('книга').syllables).toBe(2)
    expect(tokenWeight('hello').syllables).toBe(2)
    // One run of vowels, one syllable — which is also the right answer for
    // the English word.
    expect(tokenWeight('queue').syllables).toBe(1)
  })
  it('never gives a vowel-less alphabetic token zero width', () => {
    expect(tokenWeight('gym').syllables).toBe(1)
  })
})

describe('buildTimeline', () => {
  it('spans lead-in to duration minus tail-out, with no gaps', () => {
    const tl = buildTimeline(toks('今', '天'), { durationMs: 1060 })
    expect(tl.spans).toHaveLength(2)
    expect(tl.spans[0].start).toBe(LEAD_IN_MS)
    expect(tl.spans[1].end).toBeCloseTo(1060 - TAIL_OUT_MS, 6)
    expect(tl.spans[1].start).toBeCloseTo(tl.spans[0].end, 6)
  })
  it('produces strictly increasing, non-overlapping spans', () => {
    const tl = buildTimeline(toks('今天', '，', '我', '很', '好', '。'), { durationMs: 3000 })
    for (let i = 0; i < tl.spans.length; i += 1) {
      expect(tl.spans[i].end).toBeGreaterThan(tl.spans[i].start)
      if (i > 0) expect(tl.spans[i].start).toBeCloseTo(tl.spans[i - 1].end, 6)
    }
  })
  it('gives a punctuation token real width from its pause', () => {
    const tl = buildTimeline(toks('好', '。'), { durationMs: 2000 })
    expect(tl.spans[1].end - tl.spans[1].start).toBeGreaterThan(0)
  })
  it('returns null for input it cannot time', () => {
    expect(buildTimeline([], { durationMs: 2000 })).toBe(null)
    expect(buildTimeline(null, { durationMs: 2000 })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: 0 })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: NaN })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: Infinity })).toBe(null)
    expect(buildTimeline(toks('今'), { durationMs: LEAD_IN_MS + TAIL_OUT_MS })).toBe(null)
  })
  it('returns null when nothing in the line carries time', () => {
    expect(buildTimeline(toks('   '), { durationMs: 2000 })).toBe(null)
  })
})

describe('tokenAtTime', () => {
  const tl = buildTimeline(toks('今', '天', '好'), { durationMs: 3150 })

  it('is -1 during the lead-in silence', () => {
    expect(tokenAtTime(tl, 0)).toBe(-1)
    expect(tokenAtTime(tl, LEAD_IN_MS - 1)).toBe(-1)
  })
  it('lights the token whose span contains the time', () => {
    expect(tokenAtTime(tl, LEAD_IN_MS)).toBe(0)
    expect(tokenAtTime(tl, tl.spans[1].start + 1)).toBe(1)
    expect(tokenAtTime(tl, tl.spans[2].start + 1)).toBe(2)
  })
  it('treats a span boundary as belonging to the later token', () => {
    expect(tokenAtTime(tl, tl.spans[0].end)).toBe(1)
  })
  it('holds the last token lit through the tail-out silence', () => {
    expect(tokenAtTime(tl, 3149)).toBe(2)
    expect(tokenAtTime(tl, 99999)).toBe(2)
  })
  it('is -1 for a missing timeline or a nonsense time', () => {
    expect(tokenAtTime(null, 100)).toBe(-1)
    expect(tokenAtTime(tl, NaN)).toBe(-1)
  })
})

describe('startOfToken', () => {
  const tl = buildTimeline(toks('今', '天'), { durationMs: 2000 })
  it('returns the span start', () => {
    expect(startOfToken(tl, 0)).toBe(LEAD_IN_MS)
    expect(startOfToken(tl, 1)).toBeCloseTo(tl.spans[1].start, 6)
  })
  it('returns null out of range or without a timeline', () => {
    expect(startOfToken(tl, 9)).toBe(null)
    expect(startOfToken(tl, -1)).toBe(null)
    expect(startOfToken(null, 0)).toBe(null)
  })
})

describe('spotlightStyle', () => {
  it('is empty when no token is lit, so a failed timeline never dims a line', () => {
    expect(spotlightStyle(false, false, false)).toEqual({})
    expect(spotlightStyle(true, false, false)).toEqual({})
  })
  it('keeps the spoken word full and quiets the rest', () => {
    expect(spotlightStyle(true, true, false).opacity).toBe(1)
    expect(spotlightStyle(true, true, false).fontWeight).toBe(700)
    expect(spotlightStyle(false, true, false).opacity).toBe(SPOTLIGHT_DIM)
  })
  it('drops the transition under reduced motion', () => {
    expect(spotlightStyle(true, true, true).transition).toBe('none')
  })
})

describe('SPEED_RATES', () => {
  it('offers 1x and defaults to it', () => {
    expect(SPEED_RATES).toContain(1)
    expect(SPEED_RATES[SPEED_RATES.length - 1]).toBe(1)
  })
})

describe('a real HSK story line', () => {
  it('times every token of 今天天气很好，我们去公园。', () => {
    const line = toks('今天', '天气', '很', '好', '，', '我们', '去', '公园', '。')
    const tl = buildTimeline(line, { durationMs: 4000 })
    expect(tl.spans).toHaveLength(line.length)
    // 今天 is two characters, 很 is one — the wider token gets the longer span.
    const w = (i) => tl.spans[i].end - tl.spans[i].start
    expect(w(0)).toBeGreaterThan(w(2))
  })
})
