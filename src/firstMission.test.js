import { describe, it, expect } from 'vitest'
import { firstMissionCardHint, firstMissionCompletion } from './firstMission'

describe('firstMissionCardHint', () => {
  it('card 1 (index 0) is context-aware: flip first, then grade', () => {
    expect(firstMissionCardHint(0, { flipped: false })).toMatch(/reveal the answer/i)
    expect(firstMissionCardHint(0, { flipped: true })).toMatch(/tap good/i)
  })

  it('card 2 (index 1) has no hint', () => {
    expect(firstMissionCardHint(1)).toBeNull()
  })

  it('card 3 (index 2) introduces audio', () => {
    expect(firstMissionCardHint(2)).toMatch(/speaker/i)
  })

  it('card 4 (index 3) introduces typing only when typed recall is on', () => {
    expect(firstMissionCardHint(3, { isTyped: true })).toMatch(/type/i)
    expect(firstMissionCardHint(3, { isTyped: false })).toBeNull()
    expect(firstMissionCardHint(3)).toBeNull()
  })

  it('card 5 and beyond have no hint (guidance disappears)', () => {
    expect(firstMissionCardHint(4, { isTyped: true })).toBeNull()
    expect(firstMissionCardHint(9)).toBeNull()
  })

  it('is safe with missing options', () => {
    expect(firstMissionCardHint(0)).toMatch(/flashcard/i)
    expect(firstMissionCardHint(2, undefined)).toMatch(/speaker/i)
  })
})

describe('firstMissionCompletion', () => {
  it('names the language', () => {
    expect(firstMissionCompletion('Chinese')).toBe('You’ve already read your first Chinese story.')
  })
  it('stays clean when the language is missing', () => {
    expect(firstMissionCompletion()).toBe('You’ve already read your first story.')
  })
})
