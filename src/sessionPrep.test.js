import { beforeEach, describe, expect, it } from 'vitest'
import {
  PREP_MAX_AGE_MS, clearPreparedSession, peekPreparedSession, prepKey,
  prepareStudySession, takePreparedSession,
} from './sessionPrep'

const track = { language: 'chinese', system: 'hsk_3', current_level: 2 }
const args = { userId: 'u1', profile: { daily_new_cards: 10 }, track }
const DATA = { queue: [{ vocab_id: 'v1', state: 'review', vocab: { id: 'v1', word: '今天' } }], levelCards: [], vocabList: [], knownWords: [], firstRun: false }

function fakeBuilder(data = DATA) {
  return () => Promise.resolve(data)
}

beforeEach(() => clearPreparedSession())

describe('prepKey', () => {
  it('scopes the slot to learner, track, level and day', () => {
    expect(prepKey({ userId: 'u1', track, day: '2026-08-16' }))
      .toBe('u1|chinese|hsk_3|2|2026-08-16')
  })
})

describe('prepare → peek → take', () => {
  it('serves the resolved session to peek without consuming it', async () => {
    await prepareStudySession(args, fakeBuilder())
    expect(peekPreparedSession(args)).toEqual(DATA)
    expect(peekPreparedSession(args)).toEqual(DATA) // peek is repeatable
  })

  it('take claims the session exactly once', async () => {
    await prepareStudySession(args, fakeBuilder())
    expect(takePreparedSession(args)).toEqual(DATA)
    expect(takePreparedSession(args)).toBe(null)
    expect(peekPreparedSession(args)).toBe(null)
  })

  it('returns the in-flight promise when taken before the build finishes', async () => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    prepareStudySession(args, () => pending)
    const taken = takePreparedSession(args)
    expect(typeof taken.then).toBe('function')
    release(DATA)
    expect(await taken).toEqual(DATA)
  })

  it('ignores a slot prepared for a different learner or track', async () => {
    await prepareStudySession(args, fakeBuilder())
    expect(takePreparedSession({ ...args, userId: 'u2' })).toBe(null)
    // The mismatched take must NOT discard u1's prepared session.
    expect(takePreparedSession(args)).toEqual(DATA)
  })

  it('expires a stale slot instead of serving old due-dates', async () => {
    let t = 1000
    const now = () => t
    await prepareStudySession(args, fakeBuilder(), now)
    t += PREP_MAX_AGE_MS + 1
    expect(peekPreparedSession(args, now)).toBe(null)
    expect(takePreparedSession(args, now)).toBe(null)
  })

  it('a re-prepare replaces the previous slot', async () => {
    await prepareStudySession(args, fakeBuilder())
    const fresh = { ...DATA, queue: [{ vocab_id: 'v9', state: 'new', vocab: { id: 'v9', word: '花' } }] }
    await prepareStudySession(args, fakeBuilder(fresh))
    expect(takePreparedSession(args)).toEqual(fresh)
  })

  it('a failed build resolves to null so callers fall back quietly', async () => {
    await prepareStudySession(args, () => Promise.reject(new Error('offline')))
    expect(takePreparedSession(args)).toBe(null)
  })
})
