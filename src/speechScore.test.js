import { describe, it, expect } from 'vitest'
import { normalizeForSpeech, speechMatches } from './speechScore'

describe('normalizeForSpeech', () => {
  it('strips spaces, punctuation, and case', () => {
    expect(normalizeForSpeech('你好。')).toBe('你好')
    expect(normalizeForSpeech('  你 好 ')).toBe('你好')
    expect(normalizeForSpeech('Privét!')).toBe('privét')
  })
})

describe('speechMatches', () => {
  it('matches ignoring punctuation and spacing', () => {
    expect(speechMatches('你好。', '你好')).toBe(true)
    expect(speechMatches('你 好', '你好')).toBe(true)
  })

  it('matches when the recognizer returns a phrase containing the target', () => {
    expect(speechMatches('我想说学校', '学校')).toBe(true)
  })

  it('accepts any of several target forms (e.g. word or reading)', () => {
    expect(speechMatches('がっこう', ['学校', 'がっこう'])).toBe(true)
    expect(speechMatches('学校', ['学校', 'がっこう'])).toBe(true)
  })

  it('rejects a different word', () => {
    expect(speechMatches('再见', '你好')).toBe(false)
  })

  it('is false for empty transcript or target', () => {
    expect(speechMatches('', '你好')).toBe(false)
    expect(speechMatches('你好', '')).toBe(false)
  })

  it('does not let a 1-char target match an unrelated phrase', () => {
    // '好' (1 char) inside '你好' shouldn't count as saying just '好' target...
    // but containment for >=2 only, so a 1-char target must match exactly.
    expect(speechMatches('你好吗', '好')).toBe(false)
    expect(speechMatches('好', '好')).toBe(true)
  })
})
