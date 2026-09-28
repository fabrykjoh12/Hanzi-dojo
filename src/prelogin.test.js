import { describe, it, expect } from 'vitest'
import {
  REASONS, examLabelFor, reasonLabel, encouragementFor, tastedWordsLine, initialLandingMode,
} from './prelogin'

describe('initialLandingMode', () => {
  it('sends the web to the marketing page', () => {
    expect(initialLandingMode(false)).toBe('landing')
  })

  it('sends the installed app to a welcome screen — the store listing was the pitch', () => {
    expect(initialLandingMode(true)).toBe('welcome')
  })
})

describe('prelogin helpers', () => {
  it('exposes the reason set', () => {
    expect(REASONS.map(r => r.key)).toEqual(['travel', 'family', 'work', 'exam', 'culture', 'curious'])
    expect(REASONS.every(r => r.label)).toBe(true)
  })

  it('maps the exam label per language', () => {
    expect(examLabelFor('chinese')).toBe('HSK')
    expect(examLabelFor('japanese')).toBe('JLPT')
    expect(examLabelFor('russian')).toBe('TORFL')
    expect(examLabelFor('klingon')).toMatch(/proficiency/i)
  })

  it('looks up a reason label', () => {
    expect(reasonLabel('travel')).toBe('Travel')
    expect(reasonLabel('nope')).toBe(null)
  })

  it('builds encouragement copy that reflects language + reason', () => {
    expect(encouragementFor('chinese', 'travel', 'Chinese')).toMatch(/travel/i)
    expect(encouragementFor('chinese', 'exam', 'Chinese')).toContain('HSK')
    expect(encouragementFor('japanese', 'exam', 'Japanese')).toContain('JLPT')
    // Unknown reason still yields a friendly, language-aware line.
    expect(encouragementFor('russian', 'zzz', 'Russian')).toMatch(/Russian/)
  })
})

describe('tastedWordsLine', () => {
  it('returns null for no words', () => {
    expect(tastedWordsLine([])).toBe(null)
    expect(tastedWordsLine(null)).toBe(null)
  })
  it('names one word', () => {
    expect(tastedWordsLine(['钱'])).toBe('You already met 钱 — nice start.')
  })
  it('names two words and stops there', () => {
    expect(tastedWordsLine(['我', '爱', '家'])).toBe('You already met 我 and 爱 — nice start.')
  })
})

describe('prelogin choice checkpoints', () => {
  it('preserves each answer when the step advances and when later answers change', async () => {
    const values = new Map()
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    } })
    try {
      const { updatePreloginPrefs, readPreloginPrefs } = await import('./prelogin')
      updatePreloginPrefs({ language: 'chinese', tastedWords: ['你好'] })
      updatePreloginPrefs({ experience: 'some' })
      updatePreloginPrefs({ wizardStep: 'purpose' })
      updatePreloginPrefs({ purposes: ['travel'], minutesPerDay: 10 })
      expect(readPreloginPrefs()).toEqual({ language: 'chinese', tastedWords: ['你好'], experience: 'some', wizardStep: 'purpose', purposes: ['travel'], minutesPerDay: 10 })
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
      else delete globalThis.localStorage
    }
  })

  it('returns the choice without breaking the wizard if device storage is blocked', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
    try {
      const { updatePreloginPrefs } = await import('./prelogin')
      expect(updatePreloginPrefs({ experience: 'beginner' })).toEqual({ experience: 'beginner' })
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
      else delete globalThis.localStorage
    }
  })
})
