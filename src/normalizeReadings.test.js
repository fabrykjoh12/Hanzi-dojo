import { describe, it, expect } from 'vitest'
import { joinReading, hanCount, validateJoined, planRow } from '../normalize-readings.mjs'

// The pure half of normalize-readings.mjs: turning the space-separated readings
// HSK 3-6 was bulk-generated with ("jiù shì") into the joined form
// readingToPhonemes can actually parse ("jiùshì"), and refusing to write
// anything that doesn't come back out as one syllable per character.
// Fixtures only — no network, no database.

describe('joinReading', () => {
  it('joins a spaced multi-syllable reading', () => {
    expect(joinReading('jiù shì')).toBe('jiùshì')
    expect(joinReading('bù bì')).toBe('bùbì')
    expect(joinReading('yī xià')).toBe('yīxià')
    expect(joinReading('tú shū guǎn')).toBe('túshūguǎn')
  })

  it('leaves an already-joined reading unchanged', () => {
    expect(joinReading('xièxie')).toBe('xièxie')
    expect(joinReading('wǒmen')).toBe('wǒmen')
  })

  it('preserves tone marks, ü and the syllable apostrophe exactly', () => {
    expect(joinReading('lǜ sè')).toBe('lǜsè')
    expect(joinReading('nǚ ér')).toBe('nǚér')
    expect(joinReading("xī'ān")).toBe("xī'ān")
    expect(joinReading("nǚ'ér")).toBe("nǚ'ér")
  })

  it('strips tabs, newlines and non-breaking spaces too, and trims', () => {
    expect(joinReading('jiù\tshì')).toBe('jiùshì')
    expect(joinReading(' jiù shì ')).toBe('jiùshì')
    expect(joinReading('jiù shì')).toBe('jiùshì')
  })

  it('returns an empty string for missing input', () => {
    expect(joinReading('')).toBe('')
    expect(joinReading(null)).toBe('')
    expect(joinReading(undefined)).toBe('')
    expect(joinReading(42)).toBe('')
  })
})

describe('hanCount', () => {
  it('counts only Han characters', () => {
    expect(hanCount('就是')).toBe(2)
    expect(hanCount('图书馆')).toBe(3)
    expect(hanCount('一')).toBe(1)
    expect(hanCount('')).toBe(0)
    expect(hanCount('abc 123')).toBe(0)
    expect(hanCount(null)).toBe(0)
  })
})

describe('validateJoined', () => {
  it('accepts a joined reading with one syllable per character', () => {
    expect(validateJoined('就是', 'jiùshì')).toMatchObject({ ok: true, phonemes: 'jiu4 shi4' })
    expect(validateJoined('不必', 'bùbì')).toMatchObject({ ok: true, phonemes: 'bu4 bi4' })
    expect(validateJoined('绿色', 'lǜsè')).toMatchObject({ ok: true, phonemes: 'lu:4 se4' })
    expect(validateJoined('图书馆', 'túshūguǎn').ok).toBe(true)
  })

  it('rejects a joined form the phoneme converter cannot parse', () => {
    // The apostrophe of a syllable-boundary reading is unsupported upstream, so
    // this row must be left alone rather than written blind.
    expect(validateJoined('西安', "xī'ān")).toMatchObject({ ok: false, reason: 'unparseable pinyin' })
    expect(validateJoined('女儿', "nǚ'ér").ok).toBe(false)
    // Still spaced (nothing to join) — also unparseable.
    expect(validateJoined('就是', 'jiù shì').ok).toBe(false)
  })

  it('rejects a syllable-count mismatch', () => {
    const r = validateJoined('一', 'yīxià') // 1 character, 2 syllables
    expect(r.ok).toBe(false)
    expect(r.syllables).toBe(2)
    expect(r.hanzi).toBe(1)
    expect(validateJoined('图书馆', 'túshū').ok).toBe(false) // 3 characters, 2 syllables
  })

  it('rejects a word with no Han characters', () => {
    expect(validateJoined('OK', 'ōukèi')).toMatchObject({ ok: false, reason: 'no Han characters in word' })
  })
})

describe('planRow', () => {
  it('plans a change for a spaced, validatable reading', () => {
    expect(planRow({ word: '就是', reading: 'jiù shì' })).toMatchObject({
      action: 'change', joined: 'jiùshì', phonemes: 'jiu4 shi4',
    })
  })

  it('leaves an already-joined reading alone', () => {
    expect(planRow({ word: '谢谢', reading: 'xièxie' }).action).toBe('already-joined')
  })

  it('marks a row invalid rather than writing an unvalidated reading', () => {
    expect(planRow({ word: '西安', reading: "xī 'ān" }).action).toBe('invalid')
    expect(planRow({ word: '一', reading: 'yī xià' }).action).toBe('invalid')
    expect(planRow({ word: '就是', reading: '' }).action).toBe('invalid')
  })
})
