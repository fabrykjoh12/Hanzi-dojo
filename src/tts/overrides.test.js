import { describe, it, expect } from 'vitest'
import {
  isApplicable, selectOverrides, applyOverrides, overrideVersion,
  assertVerificationChange, normalizeOverride,
} from './overrides.js'
import { OVERRIDE_VERIFICATION } from './constants.js'

function o(matched, pinyin, extra = {}) {
  return normalizeOverride({ matched_text: matched, pinyin, ...extra })
}

describe('isApplicable', () => {
  it('accepts an unreviewed override - honest labelling, still usable', () => {
    expect(isApplicable(o('银行', 'yínháng', { verification: OVERRIDE_VERIFICATION.UNREVIEWED }))).toBe(true)
  })

  it('accepts a machine-inferred override', () => {
    expect(isApplicable(o('银行', 'yínháng', { verification: OVERRIDE_VERIFICATION.INFERRED }))).toBe(true)
  })

  it('never applies one a reviewer rejected', () => {
    expect(isApplicable(o('银行', 'yínháng', { verification: OVERRIDE_VERIFICATION.REJECTED }))).toBe(false)
  })

  it('ignores an override with no matched text', () => {
    expect(isApplicable({ pinyin: 'yínháng' })).toBe(false)
  })
})

describe('selectOverrides', () => {
  const list = [o('行', 'xíng'), o('银行', 'yínháng'), o('你好', 'nǐhǎo')]

  it('returns only overrides whose text is present, longest first', () => {
    const picked = selectOverrides('我去银行', list)
    expect(picked.map(x => x.matched_text)).toEqual(['银行', '行'])
  })

  it('filters by locale when the override declares one', () => {
    const scoped = [o('银行', 'yínháng', { locale: 'zh-TW' })]
    expect(selectOverrides('我去银行', scoped, { locale: 'zh-CN' })).toHaveLength(0)
    expect(selectOverrides('我去银行', scoped, { locale: 'zh-TW' })).toHaveLength(1)
  })

  it('filters by context so a story-only name does not affect flashcards', () => {
    const scoped = [o('小明', 'xiǎomíng', { context: 'story' })]
    expect(selectOverrides('小明来了', scoped, { context: 'word' })).toHaveLength(0)
    expect(selectOverrides('小明来了', scoped, { context: 'story' })).toHaveLength(1)
  })
})

describe('applyOverrides', () => {
  it('returns the whole string as one text segment when nothing matches', () => {
    expect(applyOverrides('你好', [])).toEqual([{ kind: 'text', text: '你好' }])
  })

  it('lets the longer phrase win so 银行 consumes its own 行', () => {
    const segments = applyOverrides('我去银行', [o('行', 'xíng'), o('银行', 'yínháng')])
    const phonemes = segments.filter(s => s.kind === 'phoneme')
    expect(phonemes).toHaveLength(1)
    expect(phonemes[0].text).toBe('银行')
    expect(phonemes[0].override.pinyin).toBe('yínháng')
  })

  it('marks every non-overlapping occurrence', () => {
    const segments = applyOverrides('银行和银行', [o('银行', 'yínháng')])
    expect(segments.filter(s => s.kind === 'phoneme')).toHaveLength(2)
  })

  it('reassembles to exactly the original text', () => {
    const text = '我去银行，行吗？'
    const segments = applyOverrides(text, [o('银行', 'yínháng'), o('行', 'xíng')])
    expect(segments.map(s => s.text).join('')).toBe(text)
  })

  it('applies a shorter override outside the span claimed by a longer one', () => {
    const segments = applyOverrides('银行不行', [o('银行', 'yínháng'), o('行', 'xíng')])
    const phonemes = segments.filter(s => s.kind === 'phoneme')
    expect(phonemes.map(p => p.text)).toEqual(['银行', '行'])
  })
})

describe('overrideVersion', () => {
  it('is "none" when nothing applied, so an empty value is never ambiguous', () => {
    expect(overrideVersion(applyOverrides('你好', []))).toBe('none')
  })

  it('changes when a pronunciation changes', () => {
    const before = overrideVersion(applyOverrides('银行', [o('银行', 'yínháng')]))
    const after = overrideVersion(applyOverrides('银行', [o('银行', 'yínxíng')]))
    expect(before).not.toBe(after)
  })

  it('is stable regardless of how many times an override matched', () => {
    const once = overrideVersion(applyOverrides('银行', [o('银行', 'yínháng')]))
    const twice = overrideVersion(applyOverrides('银行和银行', [o('银行', 'yínháng')]))
    expect(once).toBe(twice)
  })

  it('is order-independent for the same set of overrides', () => {
    const a = overrideVersion(applyOverrides('银行和长城', [o('银行', 'yínháng'), o('长城', 'chángchéng')]))
    const b = overrideVersion(applyOverrides('银行和长城', [o('长城', 'chángchéng'), o('银行', 'yínháng')]))
    expect(a).toBe(b)
  })
})

describe('assertVerificationChange', () => {
  it('refuses to mark an override verified without a human', () => {
    expect(() => assertVerificationChange(OVERRIDE_VERIFICATION.VERIFIED)).toThrow(/human reviewer/)
  })

  it('refuses to mark an override rejected without a human', () => {
    expect(() => assertVerificationChange(OVERRIDE_VERIFICATION.REJECTED)).toThrow(/human reviewer/)
  })

  it('allows a human to verify', () => {
    expect(assertVerificationChange(OVERRIDE_VERIFICATION.VERIFIED, { byHuman: true }))
      .toBe(OVERRIDE_VERIFICATION.VERIFIED)
  })

  it('allows the pipeline to record an inferred reading', () => {
    expect(assertVerificationChange(OVERRIDE_VERIFICATION.INFERRED)).toBe(OVERRIDE_VERIFICATION.INFERRED)
  })
})

describe('normalizeOverride', () => {
  it('defaults an unknown verification state to the most conservative one', () => {
    expect(normalizeOverride({ matched_text: '行', verification: 'trust-me' }).verification)
      .toBe(OVERRIDE_VERIFICATION.UNREVIEWED)
  })

  it('falls back between source_text and matched_text', () => {
    expect(normalizeOverride({ source_text: '银行' }).matched_text).toBe('银行')
    expect(normalizeOverride({ matched_text: '银行' }).source_text).toBe('银行')
  })
})
