import { describe, it, expect } from 'vitest'
import { shouldRefreshHome, HOME_STALE_MS, READ_ONLY_VIEWS } from './homeRefresh'

const NOON = new Date(2026, 7, 7, 12, 0, 0).getTime()

describe('shouldRefreshHome', () => {
  it('always refetches when nothing has been loaded yet', () => {
    expect(shouldRefreshHome('settings', null, NOON)).toBe(true)
    expect(shouldRefreshHome(undefined, undefined, NOON)).toBe(true)
  })

  it('refetches after any screen that could have changed a count', () => {
    for (const view of ['study', 'test', 'writing', 'stories', 'fillblank', 'profile', 'dictionary', 'knownwords']) {
      expect(shouldRefreshHome(view, NOON - 1000, NOON)).toBe(true)
    }
  })

  it('skips the refetch after a read-only detour', () => {
    for (const view of READ_ONLY_VIEWS) {
      expect(shouldRefreshHome(view, NOON - 1000, NOON)).toBe(false)
    }
  })

  it('refetches anyway once the data has gone cold', () => {
    expect(shouldRefreshHome('settings', NOON - HOME_STALE_MS, NOON)).toBe(true)
    expect(shouldRefreshHome('settings', NOON - HOME_STALE_MS + 1, NOON)).toBe(false)
  })

  it('refetches across local midnight, however recent the load looks', () => {
    // 23:59 yesterday → 00:01 today is two minutes, but the queue has rolled over.
    const lateLastNight = new Date(2026, 7, 6, 23, 59, 0).getTime()
    const justAfterMidnight = new Date(2026, 7, 7, 0, 1, 0).getTime()
    expect(justAfterMidnight - lateLastNight).toBeLessThan(HOME_STALE_MS)
    expect(shouldRefreshHome('settings', lateLastNight, justAfterMidnight)).toBe(true)
  })

  it('treats an unknown screen as one that might have changed something', () => {
    expect(shouldRefreshHome('some-new-screen', NOON - 1000, NOON)).toBe(true)
  })
})
