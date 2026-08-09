// The data cache behind the persistent tabs.
//
// Once a tab root stays mounted for the app run (React's <Activity>, NAV-MODEL
// §2), its effects re-run every time it becomes visible again. So data cannot
// live in mount effects, or every tab tap is another nine queries — the exact
// thing the persistent shell was supposed to stop. It lives here instead:
//
//   - a remount with nothing invalidated is served SYNCHRONOUSLY. A plain tab
//     switch does zero network work.
//   - an invalidated key returns the cached value AND revalidates behind it,
//     so the screen never blanks and never shows a spinner over data it
//     already has.
//   - invalidation is event-driven, not time-driven: a session completing or a
//     chapter unlocking is what makes the shelf wrong, not the clock.
//
// Pure logic, deliberately: no React, no Supabase, no timers of its own. The
// hook and the event table are commit 2; this is the machine underneath them.
//
// ── Identity isolation ───────────────────────────────────────────────────
// Every key is namespaced by the signed-in user and the active language unless
// it opts out with a `global:` prefix. Namespacing means one account's shelf
// CANNOT be read by another even if a clear were ever missed — isolation by
// construction rather than by remembering to tidy up. Clearing on top of that
// is for memory and for not keeping a signed-out learner's progress in RAM.
//
// The default is the strict one on purpose. A key that is user-specific but
// not language-specific is merely over-scoped: it costs one extra fetch after
// a language switch. A key that should have been scoped and wasn't would show
// one learner another learner's data. Only one of those is acceptable.

const GLOBAL_PREFIX = 'global:'

let scope = { userId: null, language: null }

// Bumped on every scope change. A request that was in flight when the account
// or language changed resolves into a world it no longer belongs to; the
// generation it captured at the start is how we know to throw it away.
let generation = 0

// scopedKey → entry
const entries = new Map()
// unscoped key → Set<listener>
const listeners = new Map()

// Validity is ordered by a monotonic counter, NOT by the clock.
//
// This was Date.now() first, and it was wrong in a way that only showed up
// under test: `invalidate()` and a response landing in the SAME millisecond
// compare equal, so `invalidatedAt > fetchedAt` is false and the invalidation
// is silently lost. On a fast connection — or a resolved-from-cache Supabase
// call — that is not a rare race, it is the common case. A counter cannot tie.
//
// `fetchedAt` survives as wall-clock, but only to answer `staleMs`; it is
// never used to decide whether an invalidation has happened.
let clock = 0
function tick() {
  clock += 1
  return clock
}

function isGlobal(key) {
  return typeof key === 'string' && key.startsWith(GLOBAL_PREFIX)
}

export function scopedKey(key) {
  if (isGlobal(key)) return key
  return 'u:' + (scope.userId || 'anon') + '|l:' + (scope.language || 'none') + '|' + key
}

export function getCacheScope() {
  return { ...scope }
}

function emptyEntry(unscoped) {
  return {
    unscoped,
    value: undefined,
    hasValue: false,
    // Wall clock, for staleMs only.
    fetchedAt: 0,
    // Monotonic, for validity. invalidatedTick > fetchedTick means "the value
    // is still worth showing, but it is known to be behind".
    fetchedTick: 0,
    invalidatedTick: 0,
    // Monotonic per key. `seq` is the last request STARTED, `settledSeq` the
    // one whose response is currently stored.
    seq: 0,
    settledSeq: 0,
    inflight: null,
  }
}

function entryFor(unscoped) {
  const k = scopedKey(unscoped)
  let entry = entries.get(k)
  if (!entry) {
    entry = emptyEntry(unscoped)
    entries.set(k, entry)
  }
  return entry
}

function notify(unscoped) {
  const set = listeners.get(unscoped)
  if (!set) return
  set.forEach((fn) => {
    try { fn() } catch { /* a bad listener must not block the others */ }
  })
}

// ── Scope transitions ────────────────────────────────────────────────────

// Called on sign-in, sign-out, account change and language change.
//
//   login          null → id      user changed  → clear
//   logout         id → null      user changed  → clear
//   account change idA → idB      user changed  → clear
//   language       same user      isolated by namespace; generation bumped
//
// Returns what it did, so the caller can log or test it rather than guess.
export function setCacheScope({ userId = null, language = null } = {}) {
  const userChanged = userId !== scope.userId
  const languageChanged = language !== scope.language
  if (!userChanged && !languageChanged) return 'unchanged'

  scope = { userId: userId || null, language: language || null }
  generation += 1

  if (userChanged) {
    // Everything that belonged to a person goes. `global:` entries survive
    // because they never belonged to one — reference data like the dictionary.
    const doomed = []
    entries.forEach((entry, key) => { if (!isGlobal(key)) doomed.push(key) })
    doomed.forEach((key) => entries.delete(key))
    listeners.forEach((_set, unscoped) => notify(unscoped))
    return 'user-changed'
  }

  // A language switch needs no deletion: the new language reads a different
  // namespace, so it starts empty, and the previous language's data stays
  // valid for switching back. The generation bump is what discards requests
  // still in flight for the language we just left.
  listeners.forEach((_set, unscoped) => notify(unscoped))
  return 'language-changed'
}

// ── Reads and writes ─────────────────────────────────────────────────────

export function readCache(key) {
  const entry = entries.get(scopedKey(key))
  if (!entry || !entry.hasValue) return null
  return {
    value: entry.value,
    fetchedAt: entry.fetchedAt,
    invalidated: entry.invalidatedTick > entry.fetchedTick,
  }
}

// A deliberate write — an optimistic update, or a screen that already has the
// answer. It takes the next sequence number, so a slower request started
// BEFORE it cannot land afterwards and undo it.
export function writeCache(key, value, now) {
  const entry = entryFor(key)
  entry.seq += 1
  entry.settledSeq = entry.seq
  entry.value = value
  entry.hasValue = true
  entry.fetchedAt = typeof now === 'number' ? now : Date.now()
  entry.fetchedTick = tick()
  notify(key)
}

// Mark a key — or a whole family of them — as no longer trustworthy. The value
// stays: that is what lets the next read paint immediately and revalidate
// behind itself. Prefix matching is on the UNSCOPED key, so
// `invalidate('stories:')` reaches `stories:shelf` and every
// `stories:series:<key>` in one call, in every scope.
export function invalidate(keyOrPrefix) {
  const at = tick()
  const touched = new Set()
  entries.forEach((entry) => {
    if (entry.unscoped === keyOrPrefix || entry.unscoped.startsWith(keyOrPrefix)) {
      entry.invalidatedTick = at
      touched.add(entry.unscoped)
    }
  })
  touched.forEach(notify)
  return touched.size
}

export function subscribe(key, fn) {
  if (typeof fn !== 'function') return () => {}
  let set = listeners.get(key)
  if (!set) { set = new Set(); listeners.set(key, set) }
  set.add(fn)
  return () => {
    const current = listeners.get(key)
    if (!current) return
    current.delete(fn)
    if (current.size === 0) listeners.delete(key)
  }
}

// ── The query ────────────────────────────────────────────────────────────

// Returns synchronously. `status` is the whole contract:
//
//   'fresh'        — cached and trustworthy. promise is null. NOTHING is fetched.
//   'revalidating' — cached but invalidated or stale; value is the old one and
//                    a refresh is under way.
//   'loading'      — nothing cached; value is undefined.
//
// The returned promise never rejects. A failed fetch resolves { ok: false },
// so a caller that ignores the promise cannot produce an unhandled rejection —
// which errorMonitor.js would otherwise file as a client error.
export function query(key, fetcher, options) {
  const opts = options || {}
  // Infinity by default, and that is the point: time alone must never be a
  // reason to refetch. Only an event that actually changed the data (or an
  // explicit staleMs from a caller that knows better) does.
  const staleMs = typeof opts.staleMs === 'number' ? opts.staleMs : Infinity
  const now = typeof opts.now === 'number' ? opts.now : Date.now()

  const entry = entryFor(key)
  const invalidated = entry.invalidatedTick > entry.fetchedTick
  const expired = staleMs !== Infinity && entry.hasValue && (now - entry.fetchedAt) >= staleMs

  if (entry.hasValue && !invalidated && !expired) {
    return { value: entry.value, status: 'fresh', promise: null }
  }

  // Join a request already in flight rather than starting a second one — but
  // only if it is still answering the current question. One started before the
  // last invalidation is fetching data we already know to be wrong, and one
  // from a previous scope belongs to another account or language.
  const joinable = entry.inflight
    && entry.inflight.generation === generation
    && entry.inflight.startedTick > entry.invalidatedTick
  if (joinable) {
    return {
      value: entry.hasValue ? entry.value : undefined,
      status: entry.hasValue ? 'revalidating' : 'loading',
      promise: entry.inflight.promise,
    }
  }

  entry.seq += 1
  const seq = entry.seq
  const startedGeneration = generation
  const startedTick = tick()

  // The fetcher runs NOW, synchronously, not a microtask later: the request
  // should be on the wire the moment a screen asks for it. Its own throw is
  // caught here so `query` itself can never throw at a call site.
  let raw
  try {
    raw = Promise.resolve(fetcher())
  } catch (error) {
    raw = Promise.reject(error)
  }

  const promise = raw.then(
    (value) => settle(key, entry, { seq, startedGeneration, startedTick, now, ok: true, value }),
    (error) => settle(key, entry, { seq, startedGeneration, startedTick, ok: false, error }),
  )

  entry.inflight = { promise, seq, generation: startedGeneration, startedTick }

  return {
    value: entry.hasValue ? entry.value : undefined,
    status: entry.hasValue ? 'revalidating' : 'loading',
    promise,
  }
}

function settle(key, entry, { seq, startedGeneration, startedTick, now, ok, value, error }) {
  if (entry.inflight && entry.inflight.seq === seq) entry.inflight = null

  // The scope moved on while this was in the air: it is answering a question
  // about a different account or language. Dropping it is the whole reason the
  // generation exists.
  if (startedGeneration !== generation) {
    return { ok: false, stale: true, error: error || null }
  }

  // Something invalidated this key AFTER the request went out, so the response
  // — however fresh it looks — predates the change that made the key wrong.
  // Storing it would mark stale data as current and stop the revalidation that
  // is already under way from being seen as necessary.
  if (startedTick <= entry.invalidatedTick) {
    return { ok: false, stale: true, error: error || null }
  }

  // A newer response already landed. Requests do not come back in the order
  // they went out, and without this an older revalidation would quietly
  // overwrite a newer one — the shelf flicking back to its pre-unlock state a
  // second after it updated.
  if (seq < entry.settledSeq) {
    return { ok: false, stale: true, error: error || null }
  }

  if (!ok) {
    // A failed refresh must not destroy data the learner is looking at. The
    // value stays exactly as it was, still marked invalid, so the next read
    // tries again.
    return { ok: false, stale: false, error: error || null }
  }

  entry.settledSeq = seq
  entry.value = value
  entry.hasValue = true
  // Measured from when the request STARTED, not when it answered: a caller's
  // injected clock is the one the test reasons about, and dating the value
  // from the earlier moment errs toward refreshing sooner.
  entry.fetchedAt = typeof now === 'number' ? now : Date.now()
  entry.fetchedTick = tick()
  notify(key)
  return { ok: true, value }
}

// ── Test helpers (the cache is process-wide by design) ───────────────────

export function resetCache() {
  entries.clear()
  listeners.clear()
  scope = { userId: null, language: null }
  clock = 0
  generation = 0
}

export function cacheSize() {
  return entries.size
}

export function debugKeys() {
  return Array.from(entries.keys())
}
