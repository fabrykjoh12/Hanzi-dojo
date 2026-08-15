import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  prefetchStudyDeck, consumeStudyDeck, deckKey, _clearStudyDeckSlot,
  STUDY_PREFETCH_TTL_MS,
} from './studyData'

// fetchStudyData itself is a thin composition of already-tested modules
// (data.js, levelScope.js, deckVocab.js) over the network client; what needs a
// spec is the prefetch slot's contract — keys, TTL, consume-once, failure.

const TRACK = { language: 'chinese', system: 'hsk_3', current_level: 2 }
const OTHER = { language: 'chinese', system: 'hsk_3', current_level: 3 }

beforeEach(() => _clearStudyDeckSlot())

describe('deckKey', () => {
  it('identifies a deck by user + language + system + level', () => {
    expect(deckKey('u1', TRACK)).toBe('u1:chinese:hsk_3:2')
    expect(deckKey(null, TRACK)).toBe(null)
    expect(deckKey('u1', null)).toBe(null)
  })
})

describe('prefetch → consume', () => {
  it('hands the prefetched promise to the consumer exactly once', async () => {
    const data = { cards: [], vocab: [], vocabById: {} }
    const fetcher = vi.fn(async () => data)
    prefetchStudyDeck('u1', TRACK, { now: 1000, fetcher })
    const got = consumeStudyDeck('u1', TRACK, { now: 2000 })
    expect(await got).toBe(data)
    expect(fetcher).toHaveBeenCalledTimes(1)
    // Consumed — a second session start refetches rather than reusing.
    expect(consumeStudyDeck('u1', TRACK, { now: 2000 })).toBe(null)
  })

  it('returns null for a different deck', () => {
    prefetchStudyDeck('u1', TRACK, { now: 1000, fetcher: async () => ({}) })
    expect(consumeStudyDeck('u1', OTHER, { now: 2000 })).toBe(null)
    expect(consumeStudyDeck('u2', TRACK, { now: 2000 })).toBe(null)
  })

  it('expires after the TTL so a session never grades against stale rows', () => {
    prefetchStudyDeck('u1', TRACK, { now: 1000, fetcher: async () => ({}) })
    expect(consumeStudyDeck('u1', TRACK, { now: 1000 + STUDY_PREFETCH_TTL_MS })).toBe(null)
  })

  it('does not refetch while an unexpired prefetch for the same deck exists', () => {
    const fetcher = vi.fn(async () => ({}))
    prefetchStudyDeck('u1', TRACK, { now: 1000, fetcher })
    prefetchStudyDeck('u1', TRACK, { now: 2000, fetcher })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refetches after the TTL', () => {
    const fetcher = vi.fn(async () => ({}))
    prefetchStudyDeck('u1', TRACK, { now: 1000, fetcher })
    prefetchStudyDeck('u1', TRACK, { now: 1000 + STUDY_PREFETCH_TTL_MS, fetcher })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('clears itself when the prefetch fails, so Study falls back to a fresh fetch', async () => {
    let reject
    const fetcher = () => new Promise((_, r) => { reject = r })
    prefetchStudyDeck('u1', TRACK, { now: 1000, fetcher })
    reject(new Error('offline'))
    // Let the rejection handler run.
    await Promise.resolve(); await Promise.resolve()
    expect(consumeStudyDeck('u1', TRACK, { now: 1001 })).toBe(null)
  })
})
