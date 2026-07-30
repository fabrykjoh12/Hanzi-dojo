import { describe, it, expect } from 'vitest'
import { isPracticeFormat, formatEmoji, formatLabel } from './storyFormat'

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
