import { describe, it, expect } from 'vitest'
import { isPracticeFormat, formatEmoji, formatLabel, distinctiveFormatLabel, DEFAULT_FORMAT_LABEL } from './storyFormat'

describe('isPracticeFormat', () => {
  it('is false for a plain paced/narrative story', () => {
    expect(isPracticeFormat({ presentation: 'paced' })).toBe(false)
    expect(isPracticeFormat({ presentation: null })).toBe(false)
  })
  it('is true for chat, scene, and reply-along stories', () => {
    expect(isPracticeFormat({ presentation: 'chat' })).toBe(true)
    expect(isPracticeFormat({ presentation: 'scene' })).toBe(true)
    expect(isPracticeFormat({ presentation: 'chat', interactions: { you: 'x' } })).toBe(true)
  })
  it('is safe on missing input', () => {
    expect(isPracticeFormat(null)).toBe(false)
    expect(isPracticeFormat(undefined)).toBe(false)
  })
})

describe('formatEmoji / formatLabel', () => {
  it('maps each format, with reply-along taking precedence over chat', () => {
    expect(formatLabel({ presentation: 'paced' })).toBe('Story')
    expect(formatEmoji({ presentation: 'paced' })).toBe('📖')
    expect(formatLabel({ presentation: 'chat' })).toBe('Chat')
    expect(formatLabel({ presentation: 'scene' })).toBe('Scene')
    expect(formatLabel({ presentation: 'chat', interactions: {} })).toBe('Reply')
    expect(formatEmoji({ presentation: 'chat', interactions: {} })).toBe('🗨️')
  })
  it('defaults to Story/📖 for missing input', () => {
    expect(formatLabel(null)).toBe('Story')
    expect(formatEmoji(undefined)).toBe('📖')
  })
})

// A row still tagged with the pre-rename spelling is labelled and shelved as the
// manhua it is, rather than as an unknown format.
describe('the legacy manga tag', () => {
  it('is not a practice format, and reads as manhua', () => {
    expect(isPracticeFormat({ presentation: 'manga' })).toBe(false)
    expect(formatEmoji({ presentation: 'manga' })).toBe('\u{1F58C}\u{FE0F}')
    expect(formatLabel({ presentation: 'manga' })).toBe('Manhua')
  })
})

describe('distinctiveFormatLabel', () => {
  it('says nothing about the default format', () => {
    // A prose story is what a story is. "HSK 2 · Story · 4 min" spent a third of
    // the line saying so on every card in the library.
    expect(distinctiveFormatLabel({ presentation: 'prose' })).toBe('')
    expect(distinctiveFormatLabel({})).toBe('')
    expect(distinctiveFormatLabel(null)).toBe('')
    expect(DEFAULT_FORMAT_LABEL).toBe('Story')
  })

  it('names a format that genuinely reads differently', () => {
    expect(distinctiveFormatLabel({ presentation: 'manhua' })).toBe('Manhua')
    expect(distinctiveFormatLabel({ presentation: 'chat' })).toBe('Chat')
    expect(distinctiveFormatLabel({ presentation: 'scene' })).toBe('Scene')
    expect(distinctiveFormatLabel({ presentation: 'prose', interactions: [1] })).toBe('Reply')
  })

  it('agrees with formatLabel wherever it says anything at all', () => {
    for (const story of [{ presentation: 'manhua' }, { presentation: 'chat' }, { presentation: 'scene' }]) {
      expect(distinctiveFormatLabel(story)).toBe(formatLabel(story))
    }
  })
})

