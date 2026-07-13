import { describe, it, expect } from 'vitest'
import { normalizeEmail } from './utils'

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
