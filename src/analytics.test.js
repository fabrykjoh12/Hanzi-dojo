import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock the transports so we can assert routing without a real client / network.
// Defined via vi.hoisted so the (hoisted) mock factories can reference them.
const { insertMock, enqueueMock, net } = vi.hoisted(() => ({
  insertMock: vi.fn(() => Promise.resolve({ error: null })),
  enqueueMock: vi.fn(() => Promise.resolve()),
  net: { online: true },
}))

vi.mock('./supabase', () => ({ supabase: { from: () => ({ insert: insertMock }) } }))
vi.mock('./useOnline', () => ({ isOnline: () => net.online }))
vi.mock('./syncQueue', () => ({ enqueueAnalytics: enqueueMock }))
vi.mock('./version', () => ({ BUILD_SHA: 'testsha' }))

import {
  buildEvent, sanitizeProps, markOnce, track, trackOnce,
  setAnalyticsContext, _resetForTests, EVENTS,
} from './analytics'

beforeEach(() => {
  _resetForTests()
  insertMock.mockClear()
  enqueueMock.mockClear()
  net.online = true
})

describe('buildEvent', () => {
  it('includes the required fields', () => {
    const e = buildEvent({
      name: 'onboarding_completed',
      props: { mode: 'review' },
      context: { userId: 'u1', language: 'chinese', level: 1 },
      sessionId: 'sess1', appVersion: 'abc', ts: '2026-07-13T00:00:00.000Z',
    })
    expect(e).toEqual({
      name: 'onboarding_completed',
      session_id: 'sess1',
      user_id: 'u1',
      language: 'chinese',
      level: 1,
      app_version: 'abc',
      props: { mode: 'review' },
      created_at: '2026-07-13T00:00:00.000Z',
    })
  })

  it('is null-safe for a missing user', () => {
    const e = buildEvent({ name: 'landing_viewed', context: {} })
    expect(e.user_id).toBeNull()
  })

  it('is null-safe for a missing language and level', () => {
    const e = buildEvent({ name: 'signup_started', context: { userId: 'u1' } })
    expect(e.language).toBeNull()
    expect(e.level).toBeNull()
  })

  it('keeps level 0 rather than coercing it to null', () => {
    const e = buildEvent({ name: 'x', context: { level: 0 } })
    expect(e.level).toBe(0)
  })
})

describe('sanitizeProps — keeps events non-personal', () => {
  it('keeps numbers, booleans, and short enum strings', () => {
    expect(sanitizeProps({ cards: 12, first_run: true, mode: 'weak' }))
      .toEqual({ cards: 12, first_run: true, mode: 'weak' })
  })
  it('drops long strings (e.g. a typed answer or a story sentence)', () => {
    const longText = 'the quick brown fox jumped over the lazy dog many times over'
    expect(sanitizeProps({ answer: longText })).toEqual({})
  })
  it('drops objects, arrays, functions, and empty strings', () => {
    expect(sanitizeProps({ o: {}, a: [1], f: () => {}, e: '' })).toEqual({})
  })
  it('is safe for nullish input', () => {
    expect(sanitizeProps(null)).toEqual({})
    expect(sanitizeProps(undefined)).toEqual({})
  })
})

describe('markOnce — duplicate prevention', () => {
  it('returns true once, then false', () => {
    expect(markOnce('session')).toBe(true)
    expect(markOnce('session')).toBe(false)
    expect(markOnce('session')).toBe(false)
  })
  it('is independent per key', () => {
    expect(markOnce('a')).toBe(true)
    expect(markOnce('b')).toBe(true)
  })
})

describe('track — routing', () => {
  it('inserts to Supabase when online', () => {
    setAnalyticsContext({ userId: 'u1', language: 'chinese', level: 1 })
    track(EVENTS.STUDY_SESSION_STARTED, { mode: 'review' })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(enqueueMock).not.toHaveBeenCalled()
    const row = insertMock.mock.calls[0][0]
    expect(row.name).toBe('study_session_started')
    expect(row.user_id).toBe('u1')
    expect(row.language).toBe('chinese')
    expect(row.props).toEqual({ mode: 'review' })
    expect(row.session_id).toBeTruthy()
    expect(row.app_version).toBe('testsha')
  })

  it('queues to the offline outbox when offline', () => {
    net.online = false
    track(EVENTS.STORY_COMPLETED, { tier: 1 })
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('never throws and does nothing without a name', () => {
    expect(() => track()).not.toThrow()
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('trackOnce — one-shot events (duplicate session prevention)', () => {
  it('sends only the first time for a given key', () => {
    trackOnce(EVENTS.SESSION_STARTED, {}, 'session')
    trackOnce(EVENTS.SESSION_STARTED, {}, 'session')
    trackOnce(EVENTS.SESSION_STARTED, {}, 'session')
    expect(insertMock).toHaveBeenCalledTimes(1)
  })
})

it('defines the public-story funnel events', () => {
  expect(EVENTS.PUBLIC_STORY_VIEWED).toBe('public_story_viewed')
  expect(EVENTS.PUBLIC_STORY_LEVEL_PICKED).toBe('public_story_level_picked')
  expect(EVENTS.PUBLIC_STORY_SIGNUP_CLICKED).toBe('public_story_signup_clicked')
})
