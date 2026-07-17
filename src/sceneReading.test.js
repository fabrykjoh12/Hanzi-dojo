import { describe, it, expect } from 'vitest'
import { splitScene, stripSceneEmoji } from './sceneReading'
import { calculateStoryReadability } from './storyReading'

describe('splitScene', () => {
  it('strips a leading emoji and the following space', () => {
    expect(splitScene('🌧️ 今天下雨。')).toEqual({ emoji: '🌧️', text: '今天下雨。' })
  })
  it('treats a multi-codepoint ZWJ emoji as one unit', () => {
    expect(splitScene('👨‍👩‍👧 一家人。')).toEqual({ emoji: '👨‍👩‍👧', text: '一家人。' })
  })
  it('treats a skin-tone emoji as one unit', () => {
    expect(splitScene('👋🏽 你好！')).toEqual({ emoji: '👋🏽', text: '你好！' })
  })
  it('returns the line unchanged when it has no leading emoji', () => {
    expect(splitScene('今天下雨。')).toEqual({ emoji: '', text: '今天下雨。' })
  })
  it('does not strip an emoji that is not at the front', () => {
    expect(splitScene('今天🌧️下雨。')).toEqual({ emoji: '', text: '今天🌧️下雨。' })
  })
  it('handles a line that is only an emoji', () => {
    expect(splitScene('🌸')).toEqual({ emoji: '🌸', text: '' })
  })
  it('is safe on empty / nullish input', () => {
    expect(splitScene('')).toEqual({ emoji: '', text: '' })
    expect(splitScene(undefined)).toEqual({ emoji: '', text: '' })
  })
})

describe('stripSceneEmoji', () => {
  it('removes the leading emoji from every line', () => {
    expect(stripSceneEmoji('🌧️ 今天下雨。\n☀️ 明天晴天。')).toBe('今天下雨。\n明天晴天。')
  })
  it('makes emoji prefixes readability-neutral', () => {
    const vocabMap = {
      v1: { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today' },
      v2: { id: 'v2', word: '花', reading: 'huā', meaning: 'flower' },
    }
    const withEmoji = '🌧️ 今天。\n🌸 花。'
    const plain = '今天。\n花。'
    const a = calculateStoryReadability({ content: stripSceneEmoji(withEmoji), vocabMap, cards: {}, language: 'chinese' })
    const b = calculateStoryReadability({ content: plain, vocabMap, cards: {}, language: 'chinese' })
    expect(a).toEqual(b)
  })
})
