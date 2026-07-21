import { describe, it, expect } from 'vitest'
import { REASONS, examLabelFor, reasonLabel, encouragementFor, tastedWordsLine } from './prelogin'

describe('prelogin helpers', () => {
  it('exposes the reason set', () => {
    expect(REASONS.map(r => r.key)).toEqual(['travel', 'family', 'work', 'exam', 'culture', 'curious'])
    expect(REASONS.every(r => r.label && r.emoji)).toBe(true)
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
