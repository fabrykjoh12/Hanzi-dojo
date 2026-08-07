import { describe, it, expect, vi } from 'vitest'
import { makeCharDataLoader, strokeCacheKey, strokeUrl } from './strokeData'

const DATA = { strokes: ['M0 0'], medians: [[[0, 0]]] }

function loaderWith({ cached = null, response, cacheSet = vi.fn(() => Promise.resolve()), fetchImpl } = {}) {
  const cacheGet = vi.fn(() => Promise.resolve(cached))
  const fetch = fetchImpl || vi.fn(() => Promise.resolve(response))
  return { load: makeCharDataLoader({ cacheGet, cacheSet, fetch }), cacheGet, cacheSet, fetch }
}

const ok = (data) => ({ ok: true, json: () => Promise.resolve(data) })

describe('keys and urls', () => {
  it('namespaces the cache key and encodes the character in the URL', () => {
    expect(strokeCacheKey('好')).toBe('strokes:好')
    expect(strokeUrl('好')).toContain(encodeURIComponent('好'))
    expect(strokeUrl('好').endsWith('.json')).toBe(true)
  })
})

describe('makeCharDataLoader', () => {
  it('fetches on a cache miss and stores the result', async () => {
    const { load, fetch, cacheSet } = loaderWith({ response: ok(DATA) })
    const onComplete = vi.fn()
    load('好', onComplete, vi.fn())
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith(DATA))
    expect(fetch).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(cacheSet).toHaveBeenCalledWith('strokes:好', DATA))
  })

  it('serves a cached character without touching the network — the offline case', async () => {
    const { load, fetch } = loaderWith({ cached: DATA })
    const onComplete = vi.fn()
    load('好', onComplete, vi.fn())
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith(DATA))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports an error when offline with nothing cached, so the caller can degrade', async () => {
    const { load } = loaderWith({ fetchImpl: vi.fn(() => Promise.reject(new Error('offline'))) })
    const onError = vi.fn()
    load('好', vi.fn(), onError)
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
  })

  it('treats a non-ok response as an error rather than caching junk', async () => {
    const { load, cacheSet } = loaderWith({ response: { ok: false, status: 404 } })
    const onError = vi.fn()
    load('好', vi.fn(), onError)
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    expect(cacheSet).not.toHaveBeenCalled()
  })

  it('still renders when the cache read throws (storage blocked)', async () => {
    const load = makeCharDataLoader({
      cacheGet: () => Promise.reject(new Error('blocked')),
      cacheSet: vi.fn(),
      fetch: vi.fn(() => Promise.resolve(ok(DATA))),
    })
    const onComplete = vi.fn()
    load('好', onComplete, vi.fn())
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith(DATA))
  })

  it('still renders when the cache WRITE fails — storing must never break the view', async () => {
    const { load } = loaderWith({ response: ok(DATA), cacheSet: vi.fn(() => Promise.reject(new Error('full'))) })
    const onComplete = vi.fn()
    load('好', onComplete, vi.fn())
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith(DATA))
  })
})
