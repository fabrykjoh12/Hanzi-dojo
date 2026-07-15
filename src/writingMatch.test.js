import { describe, it, expect } from 'vitest'

import { isWritingMatch } from './writingMatch'

describe('isWritingMatch — Japanese reading direction', () => {
  it('accepts a phrase answer without its trailing 。 (user report: いただきます。)', () => {
    const v = { word: 'いただきます。', reading: 'いただきます。', meaning: 'let\'s eat' }
    expect(isWritingMatch('Itadakimasu', v, 'to_target', true)).toBe(true)
    expect(isWritingMatch('itadakimasu.', v, 'to_target', true)).toBe(true)
    expect(isWritingMatch('いただきます', v, 'to_target', true)).toBe(true)
    expect(isWritingMatch('いただきます。', v, 'to_target', true)).toBe(true)
  })

  it('accepts すみません for すみません。', () => {
    const v = { word: 'すみません。', reading: 'すみません。', meaning: 'excuse me' }
    expect(isWritingMatch('sumimasen', v, 'to_target', true)).toBe(true)
    expect(isWritingMatch('すみません', v, 'to_target', true)).toBe(true)
  })

  it('still rejects a genuinely wrong reading', () => {
    const v = { word: 'いただきます。', reading: 'いただきます。', meaning: 'let\'s eat' }
    expect(isWritingMatch('arigatou', v, 'to_target', true)).toBe(false)
  })

  it('accepts kana or romaji for a plain word', () => {
    const v = { word: '水', reading: 'みず', meaning: 'water' }
    expect(isWritingMatch('mizu', v, 'to_target', true)).toBe(true)
    expect(isWritingMatch('みず', v, 'to_target', true)).toBe(true)
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
