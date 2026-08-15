import { describe, it, expect } from 'vitest'
import { isDevAllowed, masteredCardRow, learningCardRow, chunk } from './devTools'

describe('isDevAllowed', () => {
  it('allows an admin profile', () => {
    expect(isDevAllowed({ is_admin: true })).toBe(true)
  })
  it('refuses a non-admin profile', () => {
    expect(isDevAllowed({ is_admin: false })).toBe(false)
    expect(isDevAllowed({})).toBe(false)
  })
  it('refuses a missing profile', () => {
    expect(isDevAllowed(null)).toBe(false)
    expect(isDevAllowed(undefined)).toBe(false)
  })
  // The gate used to be an email allowlist whose default was a personal
  // address; Vite inlined it into the public bundle. Nothing here may reference
  // an email at all — that is the regression this file guards.
  it('does not consider the account email', () => {
    expect(isDevAllowed({ is_admin: false, email: 'anything@example.com' })).toBe(false)
  })
})

describe('card rows', () => {
  const now = new Date('2026-07-14T12:00:00Z')
  it('mastered row satisfies every mastery signal without the banned writes', () => {
    const r = masteredCardRow('u1', 'v1', now)
    expect(r).toMatchObject({ user_id: 'u1', vocab_id: 'v1', state: 'review', is_easy: false, learned: true })
    expect(r.stability).toBeGreaterThanOrEqual(21)
    expect(new Date(r.due_at).getTime()).toBeGreaterThan(now.getTime())
    // §7.3 / §10: is_easy true is the grading flow's alone; ease_factor is a
    // dead column nothing may write. This is the regression the fix exists for.
    expect(r).not.toHaveProperty('ease_factor')
  })
  it('learning row is due immediately, unmastered, and never writes ease_factor', () => {
    const r = learningCardRow('u1', 'v1', now)
    expect(r).toMatchObject({ state: 'learning', is_easy: false, learned: false, stability: 0 })
    expect(r.due_at).toBe(now.toISOString())
    expect(r).not.toHaveProperty('ease_factor')
  })
})

describe('chunk', () => {
  it('splits into batches and keeps order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })
})
