import { describe, it, expect } from 'vitest'

import { isWritingMatch } from './writingMatch'

// The Japanese track was removed (see CLAUDE.md — Chinese-only); isJapanese
// is never true in the live app anymore. Kept as a minimal defensive check
// that the branch still behaves (exact reading match, no romaji conversion)
// rather than crashing if it's ever reached with old data.
describe('isWritingMatch — isJapanese branch (unreachable in the live app)', () => {
  it('matches the exact stored reading', () => {
    const v = { word: '水', reading: 'みず', meaning: 'water' }
    expect(isWritingMatch('みず', v, 'to_target', true)).toBe(true)
    expect(isWritingMatch('mizu', v, 'to_target', true)).toBe(false)
  })
})

describe('isWritingMatch — Chinese pinyin direction', () => {
  it('accepts tone-insensitive pinyin', () => {
    const v = { word: '海', reading: 'hǎi', reading_plain: 'hai3', meaning: 'sea' }
    expect(isWritingMatch('hai', v, 'to_target', false)).toBe(true)
    expect(isWritingMatch('hǎi', v, 'to_target', false)).toBe(true)
  })
})

describe('isWritingMatch — English meaning direction', () => {
  it('accepts the meaning ignoring articles and punctuation', () => {
    const v = { word: '走', reading: 'zǒu', meaning: 'to run, to walk' }
    expect(isWritingMatch('run', v, 'to_english', false)).toBe(true)
    expect(isWritingMatch('to walk', v, 'to_english', false)).toBe(true)
  })
})
