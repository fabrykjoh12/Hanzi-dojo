// Stroke-order data, cached on the device.
//
// hanzi-writer fetches each character's stroke data from a CDN at runtime.
// That is fine on the web and poor in the app: the product's offline promise
// covers reviewing and reading, so a learner on a plane or an underground
// train who taps "Strokes" gets nothing. Characters they have already looked
// at should keep working.
//
// So every character is cached in the existing IndexedDB cache store the
// first time it loads. Cache-first, network-fallback, and — importantly —
// entirely best-effort: if storage is blocked or the fetch fails, the loader
// behaves exactly as it did before (hanzi-writer's own error path runs).

import { cacheGet, cacheSet } from './offline'

// Where hanzi-writer's own default loader points. Keeping the same origin
// means the cache is populated with byte-identical data to what the library
// would have fetched itself.
export const STROKE_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1'

export function strokeCacheKey(char) {
  return 'strokes:' + char
}

export function strokeUrl(char) {
  return STROKE_CDN + '/' + encodeURIComponent(char) + '.json'
}

// A hanzi-writer `charDataLoader`. Its contract: call onComplete(data) or
// onError(err). `deps` is injectable so the behaviour is testable without a
// network or a database.
export function makeCharDataLoader(deps = {}) {
  const get = deps.cacheGet || cacheGet
  const set = deps.cacheSet || cacheSet
  const fetchImpl = deps.fetch || (typeof fetch !== 'undefined' ? fetch : null)

  return function charDataLoader(char, onComplete, onError) {
    Promise.resolve()
      .then(() => get(strokeCacheKey(char)))
      .catch(() => null)
      .then((cached) => {
        if (cached) return { data: cached, fromCache: true }
        if (!fetchImpl) throw new Error('no fetch')
        return fetchImpl(strokeUrl(char))
          .then((res) => {
            if (!res || !res.ok) throw new Error('stroke data ' + (res && res.status))
            return res.json()
          })
          .then((data) => ({ data, fromCache: false }))
      })
      .then(({ data, fromCache }) => {
        if (!fromCache) {
          // Storing must never delay or fail the render.
          Promise.resolve().then(() => set(strokeCacheKey(char), data)).catch(() => {})
        }
        onComplete(data)
      })
      .catch((err) => {
        if (typeof onError === 'function') onError(err)
      })
  }
}
