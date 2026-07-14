import { describe, it, expect } from 'vitest'
import { isDevUser, devEmailList, masteredCardRow, learningCardRow, chunk } from './devTools'

describe('devEmailList / isDevUser', () => {
  it('parses, trims and lowercases the allowlist', () => {
    expect(devEmailList(' A@x.com, b@Y.com ')).toEqual(['a@x.com', 'b@y.com'])
  })
  it('matches emails case/whitespace-insensitively', () => {
    expect(isDevUser(' A@X.com ', 'a@x.com')).toBe(true)
    expect(isDevUser('stranger@x.com', 'a@x.com')).toBe(false)
    expect(isDevUser(null, 'a@x.com')).toBe(false)
  })
  it('defaults to the repo developer', () => {
    expect(isDevUser('fabrykjoh@gmail.com')).toBe(true)
    expect(isDevUser('someone-else@gmail.com')).toBe(false)
  })
})

describe('card rows', () => {
  const now = new Date('2026-07-14T12:00:00Z')
  it('mastered row satisfies every mastery signal', () => {
    const r = masteredCardRow('u1', 'v1', now)
    expect(r).toMatchObject({ user_id: 'u1', vocab_id: 'v1', state: 'review', is_easy: true, learned: true })
    expect(r.stability).toBeGreaterThanOrEqual(21)
    expect(new Date(r.due_at).getTime()).toBeGreaterThan(now.getTime())
  })
  it('learning row is due immediately and unmastered', () => {
    const r = learningCardRow('u1', 'v1', now)
    expect(r).toMatchObject({ state: 'learning', is_easy: false, learned: false, stability: 0 })
    expect(r.due_at).toBe(now.toISOString())
  })
})

describe('chunk', () => {
  it('splits into batches and keeps order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })
})
