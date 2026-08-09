import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  query, readCache, writeCache, invalidate, subscribe,
  setCacheScope, getCacheScope, scopedKey,
  resetCache, cacheSize, debugKeys,
} from './dataCache'

beforeEach(() => resetCache())

// A fetcher whose resolution we control, so "an older response arrives after a
// newer one" is a thing we can actually stage rather than hope for.
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('a plain cache hit', () => {
  it('serves synchronously and does not fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a'])
    const first = query('stories:shelf', fetcher)
    expect(first.status).toBe('loading')
    await first.promise

    const second = query('stories:shelf', fetcher)
    expect(second.status).toBe('fresh')
    expect(second.value).toEqual(['a'])
    expect(second.promise).toBe(null)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('stays fresh across any number of reads — a tab switch costs nothing', async () => {
    const fetcher = vi.fn().mockResolvedValue(1)
    await query('home:counts', fetcher).promise
    for (let i = 0; i < 10; i += 1) query('home:counts', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not go stale on time by default', async () => {
    const fetcher = vi.fn().mockResolvedValue(1)
    await query('home:counts', fetcher, { now: 0 }).promise
    // A year later, with nothing invalidated, still fresh: only an event that
    // actually changed the data may cause a refetch.
    expect(query('home:counts', fetcher, { now: 3.2e10 }).status).toBe('fresh')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('honours an explicit staleMs when a caller asks for one', async () => {
    const fetcher = vi.fn().mockResolvedValue(1)
    await query('home:counts', fetcher, { staleMs: 1000, now: 0 }).promise
    expect(query('home:counts', fetcher, { staleMs: 1000, now: 500 }).status).toBe('fresh')
    expect(query('home:counts', fetcher, { staleMs: 1000, now: 1500 }).status).toBe('revalidating')
  })
})

describe('concurrent misses', () => {
  it('makes one underlying request for simultaneous readers', async () => {
    const fetcher = vi.fn().mockResolvedValue('shelf')
    const a = query('stories:shelf', fetcher)
    const b = query('stories:shelf', fetcher)
    const c = query('stories:shelf', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(b.promise).toBe(a.promise)
    expect(c.promise).toBe(a.promise)
    await a.promise
    expect(readCache('stories:shelf').value).toBe('shelf')
  })

  it('starts a fresh request once the first has settled', async () => {
    const fetcher = vi.fn().mockResolvedValue(1)
    await query('k', fetcher).promise
    invalidate('k')
    query('k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not join an in-flight request that was started before an invalidation', async () => {
    // The one in the air is fetching data we already know to be wrong.
    const first = deferred()
    const second = deferred()
    const fetcher = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    query('k', fetcher)
    invalidate('k')
    query('k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)

    first.resolve('old')
    second.resolve('new')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(readCache('k').value).toBe('new')
  })
})

describe('invalidation', () => {
  it('returns the cached value synchronously and revalidates exactly once', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('before')
      .mockResolvedValueOnce('after')
    await query('stories:shelf', fetcher).promise

    invalidate('stories:shelf')

    const out = query('stories:shelf', fetcher)
    expect(out.status).toBe('revalidating')
    expect(out.value).toBe('before')          // no blank screen, no spinner
    expect(fetcher).toHaveBeenCalledTimes(2)

    await out.promise
    expect(readCache('stories:shelf').value).toBe('after')
    expect(query('stories:shelf', fetcher).status).toBe('fresh')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('matches a whole family by prefix', async () => {
    const f = vi.fn().mockResolvedValue(1)
    await query('stories:shelf', f).promise
    await query('stories:series:inkbound', f).promise
    await query('home:counts', f).promise

    expect(invalidate('stories:')).toBe(2)
    expect(query('stories:shelf', f).status).toBe('revalidating')
    expect(query('stories:series:inkbound', f).status).toBe('revalidating')
    expect(query('home:counts', f).status).toBe('fresh')
  })

  it('notifies subscribers', async () => {
    const seen = vi.fn()
    const off = subscribe('stories:shelf', seen)
    await query('stories:shelf', vi.fn().mockResolvedValue(1)).promise
    seen.mockClear()
    invalidate('stories:shelf')
    expect(seen).toHaveBeenCalled()
    off()
    invalidate('stories:shelf')
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('keeps the old value when a revalidation fails', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('good')
      .mockRejectedValueOnce(new Error('offline'))
    await query('k', fetcher).promise
    invalidate('k')
    const out = query('k', fetcher)
    const result = await out.promise
    // A failed refresh must never destroy what the learner is looking at.
    expect(result.ok).toBe(false)
    expect(readCache('k').value).toBe('good')
    expect(query('k', fetcher).status).toBe('revalidating')   // will try again
  })

  it('never rejects the returned promise, so an ignored one cannot become an unhandled rejection', async () => {
    const out = query('k', () => Promise.reject(new Error('boom')))
    await expect(out.promise).resolves.toMatchObject({ ok: false })
  })
})

describe('out-of-order responses', () => {
  it('discards an older response that lands after a newer one', async () => {
    const first = deferred()
    const second = deferred()
    const fetcher = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    query('stories:shelf', fetcher)     // request 1
    invalidate('stories:shelf')
    query('stories:shelf', fetcher)     // request 2

    // The newer one comes back first…
    second.resolve('NEW')
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(readCache('stories:shelf').value).toBe('NEW')

    // …and the older one arrives late. Without sequencing this is where the
    // shelf would flick back to its pre-unlock state a second after updating.
    first.resolve('OLD')
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(readCache('stories:shelf').value).toBe('NEW')
  })

  it('does not let a slow fetch undo a deliberate write', async () => {
    const slow = deferred()
    query('home:counts', () => slow.promise)
    writeCache('home:counts', { due: 0 })         // optimistic update
    slow.resolve({ due: 18 })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(readCache('home:counts').value).toEqual({ due: 0 })
  })
})

describe('identity isolation', () => {
  it('namespaces keys by user and language', () => {
    setCacheScope({ userId: 'u1', language: 'chinese' })
    expect(scopedKey('stories:shelf')).toBe('u:u1|l:chinese|stories:shelf')
    expect(scopedKey('global:dict')).toBe('global:dict')
  })

  it('makes one user\'s data unreadable to the next — login after logout', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    await query('stories:shelf', () => Promise.resolve('alice shelf')).promise
    expect(readCache('stories:shelf').value).toBe('alice shelf')

    setCacheScope({ userId: null, language: null })          // logout
    expect(readCache('stories:shelf')).toBe(null)

    setCacheScope({ userId: 'bob', language: 'chinese' })    // login as someone else
    expect(readCache('stories:shelf')).toBe(null)
  })

  it('clears user data outright on logout rather than merely hiding it', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    await query('progress:stats', () => Promise.resolve({ learned: 300 })).promise
    expect(cacheSize()).toBe(1)
    setCacheScope({ userId: null, language: null })
    expect(cacheSize()).toBe(0)
  })

  it('reports what each transition did', () => {
    expect(setCacheScope({ userId: 'a', language: 'chinese' })).toBe('user-changed')
    expect(setCacheScope({ userId: 'a', language: 'chinese' })).toBe('unchanged')
    expect(setCacheScope({ userId: 'a', language: 'japanese' })).toBe('language-changed')
    expect(setCacheScope({ userId: 'b', language: 'japanese' })).toBe('user-changed')
    expect(setCacheScope({ userId: null, language: null })).toBe('user-changed')
    expect(getCacheScope()).toEqual({ userId: null, language: null })
  })

  it('keeps genuinely shared data across an account change', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    await query('global:dict:friend', () => Promise.resolve('朋友')).promise
    setCacheScope({ userId: 'bob', language: 'chinese' })
    expect(readCache('global:dict:friend').value).toBe('朋友')
  })

  it('discards a request that was in flight when the account changed', async () => {
    const pending = deferred()
    setCacheScope({ userId: 'alice', language: 'chinese' })
    const out = query('progress:stats', () => pending.promise)

    setCacheScope({ userId: 'bob', language: 'chinese' })
    pending.resolve({ learned: 999 })                  // alice's data, arriving late
    const result = await out.promise

    expect(result.stale).toBe(true)
    expect(readCache('progress:stats')).toBe(null)     // never lands in bob's scope
  })
})

describe('language isolation', () => {
  it('keeps each language\'s data separate for the same user', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    await query('stories:shelf', () => Promise.resolve('chinese shelf')).promise

    setCacheScope({ userId: 'alice', language: 'japanese' })
    expect(readCache('stories:shelf')).toBe(null)      // isolated, not leaked
    await query('stories:shelf', () => Promise.resolve('japanese shelf')).promise
    expect(readCache('stories:shelf').value).toBe('japanese shelf')

    setCacheScope({ userId: 'alice', language: 'chinese' })
    expect(readCache('stories:shelf').value).toBe('chinese shelf')   // still valid on return
  })

  it('never lets a language switch serve the wrong language\'s data', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    await query('home:counts', () => Promise.resolve({ due: 18 })).promise
    setCacheScope({ userId: 'alice', language: 'japanese' })
    const out = query('home:counts', () => Promise.resolve({ due: 3 }))
    expect(out.status).toBe('loading')
    expect(out.value).toBeUndefined()
    await out.promise
    expect(readCache('home:counts').value).toEqual({ due: 3 })
  })

  it('discards a request that was in flight when the language changed', async () => {
    const pending = deferred()
    setCacheScope({ userId: 'alice', language: 'chinese' })
    const out = query('home:counts', () => pending.promise)
    setCacheScope({ userId: 'alice', language: 'japanese' })
    pending.resolve({ due: 18 })
    expect((await out.promise).stale).toBe(true)
    expect(readCache('home:counts')).toBe(null)
  })

  it('keeps the two namespaces visibly distinct', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    await query('k', () => Promise.resolve(1)).promise
    setCacheScope({ userId: 'alice', language: 'japanese' })
    await query('k', () => Promise.resolve(2)).promise
    expect(debugKeys().sort()).toEqual([
      'u:alice|l:chinese|k',
      'u:alice|l:japanese|k',
    ])
  })
})

describe('the scenario the whole design exists for', () => {
  it('shows an unlocked chapter when returning to an already-loaded Stories tab', async () => {
    setCacheScope({ userId: 'alice', language: 'chinese' })
    const shelf = vi.fn()
      .mockResolvedValueOnce(['ch1', 'ch2'])
      .mockResolvedValueOnce(['ch1', 'ch2', 'ch3'])

    // Stories was opened earlier in the session.
    await query('stories:shelf', shelf).promise

    // A session finishes in Cards and unlocks a chapter. Stories is hidden, so
    // nothing fetches and nothing renders.
    invalidate('stories:')
    expect(shelf).toHaveBeenCalledTimes(1)

    // The learner taps Stories. The shelf paints immediately from cache…
    const back = query('stories:shelf', shelf)
    expect(back.status).toBe('revalidating')
    expect(back.value).toEqual(['ch1', 'ch2'])

    // …and the new chapter lands a moment later.
    await back.promise
    expect(readCache('stories:shelf').value).toEqual(['ch1', 'ch2', 'ch3'])
    expect(shelf).toHaveBeenCalledTimes(2)
  })
})
