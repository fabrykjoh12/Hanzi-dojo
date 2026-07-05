// Offline audio via preloaded object URLs.
//
// iOS/Safari only lets <audio>.play() start inside the user-gesture tick, and
// it bypasses the service worker's cache for ranged media — so an offline tap
// can neither await an IndexedDB read nor hit the network. The fix is to
// preload: while a card/word is on screen (NOT during the tap), turn its audio
// into an in-memory object URL, so the eventual tap plays it synchronously.
//
// `ensureAudio(url)` (async, call on view): resolves the blob from IndexedDB,
// or fetches + stores it when online, and creates a same-origin object URL.
// `readyUrl(url)` (sync, call during playback): returns that object URL if it's
// ready, else null — the caller then falls back to the remote URL. All of this
// no-ops safely without IndexedDB / fetch.

import { audioGet, audioPut } from './offline'

const mem = new Map() // url -> objectURL (insertion-ordered LRU)
const MAX = 60
const inflight = new Map() // url -> Promise, so concurrent asks share one fetch

function remember(url, objUrl) {
  mem.set(url, objUrl)
  while (mem.size > MAX) {
    const oldest = mem.keys().next().value
    const old = mem.get(oldest)
    mem.delete(oldest)
    try { URL.revokeObjectURL(old) } catch { /* noop */ }
  }
}

// Synchronous — safe to call inside a play() gesture. null means "not preloaded".
export function readyUrl(url) {
  if (!url) return null
  return mem.get(url) || null
}

// Warm one clip: IndexedDB blob → object URL, else fetch + persist (when online).
export function ensureAudio(url) {
  if (!url) return Promise.resolve(null)
  if (mem.has(url)) return Promise.resolve(mem.get(url))
  if (inflight.has(url)) return inflight.get(url)

  const p = (async () => {
    let blob = await audioGet(url)
    if (!blob) {
      try {
        const resp = await fetch(url)
        if (resp && resp.ok) {
          blob = await resp.blob()
          audioPut(url, blob) // persist for future offline sessions (fire-and-forget)
        }
      } catch { /* offline and not cached yet */ }
    }
    if (!blob) return null
    let objUrl
    try { objUrl = URL.createObjectURL(blob) } catch { return null }
    remember(url, objUrl)
    return objUrl
  })()
    .catch(() => null)
    .finally(() => { inflight.delete(url) })

  inflight.set(url, p)
  return p
}
