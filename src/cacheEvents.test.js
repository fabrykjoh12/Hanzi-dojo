import { describe, it, expect, beforeEach } from 'vitest'
import { publish, keysFor, EVENT_KEYS, HOME_IDENTITY, HOME_COUNTS, HOME_HANDOFF, STORIES } from './cacheEvents'
import { resetCache, setCacheScope, writeCache, readCache } from './dataCache'

// The event table is the whole point: an event may only invalidate what it can
// actually change. These specs are that sentence, one pair at a time.

function seedAll() {
  writeCache(HOME_IDENTITY, { profile: 1 })
  writeCache(HOME_COUNTS, { dueCount: 4 })
  writeCache(HOME_HANDOFF, { reward: null, daily: null })
  writeCache('stories:shelf', true)
}

function invalidated(key) {
  const entry = readCache(key)
  return Boolean(entry && entry.invalidated)
}

beforeEach(() => {
  resetCache()
  setCacheScope({ userId: 'u1', language: 'chinese' })
})

describe('cacheEvents', () => {
  it('a graded card touches the counts and nothing else', () => {
    seedAll()
    expect(publish('card:graded')).toEqual([HOME_COUNTS])
    expect(invalidated(HOME_COUNTS)).toBe(true)
    expect(invalidated(HOME_IDENTITY)).toBe(false)
    expect(invalidated(HOME_HANDOFF)).toBe(false)
    expect(invalidated('stories:shelf')).toBe(false)
  })

  it('a story read changes what to read next, not what is due', () => {
    seedAll()
    publish('story:read')
    expect(invalidated(HOME_HANDOFF)).toBe(true)
    expect(invalidated('stories:shelf')).toBe(true)
    expect(invalidated(HOME_COUNTS)).toBe(false)
    expect(invalidated(HOME_IDENTITY)).toBe(false)
  })

  it('a chapter unlock leaves the review queue alone', () => {
    seedAll()
    publish('chapter:unlocked')
    expect(invalidated(HOME_HANDOFF)).toBe(true)
    expect(invalidated(HOME_COUNTS)).toBe(false)
  })

  it('a finished session moves the counts, the hand-off and the shelf', () => {
    seedAll()
    publish('session:completed')
    expect(invalidated(HOME_COUNTS)).toBe(true)
    expect(invalidated(HOME_HANDOFF)).toBe(true)
    expect(invalidated('stories:shelf')).toBe(true)
    // Who you are did not change by studying.
    expect(invalidated(HOME_IDENTITY)).toBe(false)
  })

  it('a level unlock puts everything behind, because the level scopes everything', () => {
    seedAll()
    publish('level:unlocked')
    expect(invalidated(HOME_IDENTITY)).toBe(true)
    expect(invalidated(HOME_COUNTS)).toBe(true)
    expect(invalidated(HOME_HANDOFF)).toBe(true)
    expect(invalidated('stories:shelf')).toBe(true)
  })

  it('a profile write reaches the counts, because the daily goal is one of their inputs', () => {
    seedAll()
    publish('profile:updated')
    expect(invalidated(HOME_IDENTITY)).toBe(true)
    expect(invalidated(HOME_COUNTS)).toBe(true)
    expect(invalidated(HOME_HANDOFF)).toBe(false)
  })

  it('reaches every stories key through the prefix', () => {
    writeCache('stories:shelf', true)
    writeCache('stories:series:inkbound', true)
    publish('story:read')
    expect(invalidated('stories:shelf')).toBe(true)
    expect(invalidated('stories:series:inkbound')).toBe(true)
  })

  it('has no entry for a language switch — the namespace already handles it', () => {
    expect(EVENT_KEYS['language:switched']).toBeUndefined()
    expect(keysFor('language:switched')).toEqual([])
    seedAll()
    publish('language:switched')
    expect(invalidated(HOME_COUNTS)).toBe(false)
  })

  it('ignores an event it does not know rather than invalidating everything', () => {
    seedAll()
    expect(publish('something:else')).toEqual([])
    expect(invalidated(HOME_COUNTS)).toBe(false)
    expect(invalidated('stories:shelf')).toBe(false)
  })

  it('never names a key outside the four it is allowed to touch', () => {
    const allowed = [HOME_IDENTITY, HOME_COUNTS, HOME_HANDOFF, STORIES]
    Object.values(EVENT_KEYS).forEach((keys) => {
      keys.forEach((key) => expect(allowed).toContain(key))
    })
  })
})
