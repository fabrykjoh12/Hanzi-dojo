import { describe, it, expect } from 'vitest'
import { normalizeEmail, getSystemLabel, metaLine } from './utils'

describe('normalizeEmail', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  me@example.com  ')).toBe('me@example.com')
  })

  it('lowercases the whole address', () => {
    expect(normalizeEmail('Me@Example.COM')).toBe('me@example.com')
  })

  it('collapses mobile auto-capitalization to one canonical account', () => {
    // A phone keyboard capitalizes the first letter; the same person must not
    // end up with two Supabase users.
    expect(normalizeEmail('Me@example.com')).toBe(normalizeEmail('me@example.com'))
  })

  it('handles empty / nullish input without throwing', () => {
    expect(normalizeEmail('')).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail(null)).toBe('')
  })

  it('leaves an already-normalized address unchanged', () => {
    expect(normalizeEmail('a.b+tag@sub.example.co')).toBe('a.b+tag@sub.example.co')
  })
})

// ── P10-A7: an unknown curriculum system must never print itself ───────────
//
// `getSystemLabel` used to `return system`, so an unrecognised or renamed enum
// leaked the raw column value into a screen header. The E2E fixture's
// `system: 'hsk'` rendered a lowercase "hsk · HSK 2" in the audit's own
// screenshots; a production rename would do the same with nothing to catch it.

describe('getSystemLabel', () => {
  it('names the systems it knows', () => {
    expect(getSystemLabel('hsk_3')).toBe('HSK 3.0')
    expect(getSystemLabel('jlpt')).toBe('JLPT')
    expect(getSystemLabel('russian')).toBe('CEFR')
  })

  it('says nothing about a system it does not know', () => {
    // Never the raw value — that is the whole fix.
    expect(getSystemLabel('hsk')).toBe('')
    expect(getSystemLabel('hsk_4')).toBe('')
    expect(getSystemLabel('some_future_enum')).toBe('')
  })

  it('survives a missing system', () => {
    expect(getSystemLabel(null)).toBe('')
    expect(getSystemLabel(undefined)).toBe('')
    expect(getSystemLabel('')).toBe('')
  })
})

describe('metaLine', () => {
  it('joins the parts that exist', () => {
    expect(metaLine('HSK 3.0', 'HSK 2')).toBe('HSK 3.0 · HSK 2')
    expect(metaLine('HSK 3.0', 'HSK 2', '44 words')).toBe('HSK 3.0 · HSK 2 · 44 words')
  })

  it('never leaves a dangling separator when a part is missing', () => {
    // The three ways the hand-written template literals would have broken.
    expect(metaLine('', 'HSK 2')).toBe('HSK 2')
    expect(metaLine('HSK 2', '')).toBe('HSK 2')
    expect(metaLine('HSK 3.0', '', '44 words')).toBe('HSK 3.0 · 44 words')
  })

  it('drops null, undefined and whitespace-only parts', () => {
    expect(metaLine(null, 'HSK 2', undefined)).toBe('HSK 2')
    expect(metaLine('   ', 'HSK 2')).toBe('HSK 2')
    expect(metaLine()).toBe('')
    expect(metaLine(null, undefined, '')).toBe('')
  })

  it('composes an unknown system into a clean line', () => {
    // The end-to-end case: the fixture track, which is what produced "hsk · HSK 2".
    expect(metaLine(getSystemLabel('hsk'), 'HSK 2', '44 words')).toBe('HSK 2 · 44 words')
  })

  it('trims the parts it keeps, and accepts numbers', () => {
    expect(metaLine(' HSK 2 ', 44 + ' words')).toBe('HSK 2 · 44 words')
    expect(metaLine('Level', 3)).toBe('Level · 3')
  })

  it('flattens an array argument, so a caller can spread a list', () => {
    expect(metaLine(['HSK 2', '', '44 words'])).toBe('HSK 2 · 44 words')
  })
})
