// Offline storage layer — one small IndexedDB database, no dependencies.
//
// Why IndexedDB and not localStorage: localStorage is banned in this codebase
// (and is synchronous + tiny). IndexedDB is the right tool for offline data and
// for storing audio blobs so pronunciation replays without a network — even on
// iOS, where the service worker deliberately bypasses ranged media requests.
//
// Cache helpers degrade safely: if IndexedDB is missing or throws, every
// helper resolves to a harmless default (null / [] / false) and the app keeps
// working exactly as it does online. Offline features are strictly additive —
// they never sit in front of the normal online code path.
//
// Stores:
//   cache   { k, v }          arbitrary JSON snapshots (queues, story lists…)
//   outbox  { id++, op }      writes made offline, replayed when back online
//   audio   { path, blob }    full audio files saved for offline playback
//   prefs   { k, v }          durable local prefs/progress — NOT wiped by
//                             "Clear downloads" (unlike `cache`)

const DB_NAME = 'hanzi-offline'
const DB_VERSION = 3
const HAS_IDB = typeof indexedDB !== 'undefined'

let dbPromise = null

function openDb() {
  if (!HAS_IDB) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'k' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'path' })
      if (!db.objectStoreNames.contains('reviews')) db.createObjectStore('reviews', { keyPath: 'opId' })
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'k' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

// Run a transaction on one store and resolve when it commits. `fn(store)` may
// return a request whose `.result` is passed back. Any failure resolves to
// `fallback` so callers never have to try/catch.
function tx(storeName, mode, fn, fallback) {
  return openDb().then((db) => {
    if (!db) return fallback
    return new Promise((resolve) => {
      let out = fallback
      let t
      try {
        t = db.transaction(storeName, mode)
      } catch {
        resolve(fallback)
        return
      }
      const store = t.objectStore(storeName)
      let req
      try {
        req = fn(store)
      } catch {
        resolve(fallback)
        return
      }
      if (req) req.onsuccess = () => { out = req.result }
      t.oncomplete = () => resolve(out === undefined ? fallback : out)
      t.onerror = () => resolve(fallback)
      t.onabort = () => resolve(fallback)
    })
  }).catch(() => fallback)
}

export function offlineAvailable() {
  return HAS_IDB
}

// ── JSON snapshot cache ──────────────────────────────────────────────────────
export function cacheSet(key, value) {
  return tx('cache', 'readwrite', (s) => s.put({ k: key, v: value }), null)
}

export function cacheGet(key) {
  return tx('cache', 'readonly', (s) => s.get(key), null).then((row) => (row ? row.v : null))
}

export function cacheDelete(key) {
  return tx('cache', 'readwrite', (s) => s.delete(key), null)
}

// ── Durable prefs/progress (survives "Clear downloads") ─────────────────────
export function prefsSet(key, value) {
  return tx('prefs', 'readwrite', (s) => s.put({ k: key, v: value }), null)
}

export function prefsGet(key) {
  return tx('prefs', 'readonly', (s) => s.get(key), null).then((row) => (row ? row.v : null))
}

// Patch a prefs object without disturbing fields we were not asked to change.
// Pure and separately tested: the readers share one prefs object, so a careless
// whole-object write is how one reader's setting silently erases another's.
export function mergePrefs(saved, patch) {
  const base = (saved && typeof saved === 'object') ? saved : {}
  return { ...base, ...patch }
}

// Read-modify-write a prefs object. Degrades like every other helper here: if
// IndexedDB is missing, prefsGet resolves null and prefsSet is a no-op.
export function prefsMerge(key, patch) {
  return prefsGet(key).then(saved => prefsSet(key, mergePrefs(saved, patch)))
}

// ── Outbox (offline writes awaiting replay) ─────────────────────────────────
export function outboxAdd(op) {
  return tx('outbox', 'readwrite', (s) => s.add({ op, ts: nowStamp() }), null)
}

export function outboxAll() {
  return tx('outbox', 'readonly', (s) => s.getAll(), []).then((rows) => rows || [])
}

export function outboxDelete(id) {
  return tx('outbox', 'readwrite', (s) => s.delete(id), null)
}

export function outboxCount() {
  return tx('outbox', 'readonly', (s) => s.count(), 0).then((n) => n || 0)
}

// Account deletion only: queued writes for an account that no longer exists
// would fail on every future replay, so they go too. Never call this on the
// ordinary path — clearDownloads() deliberately leaves the outbox alone.
export function outboxClear(userId) {
  if (!userId) return Promise.resolve(false)
  return tx('outbox', 'readwrite', store => {
    store.getAll().onsuccess = event => {
      for (const row of event.target.result) {
        const owners = [row.op?.userId, row.op?.event?.user_id].filter(Boolean)
        if (owners.length && owners.every(owner => owner === userId)) store.delete(row.id)
      }
    }
  }, null)
}

// ── Audio blob store (offline pronunciation, incl. iOS) ─────────────────────
export function audioPut(path, blob) {
  if (!path || !blob) return Promise.resolve(null)
  return tx('audio', 'readwrite', (s) => s.put({ path, blob }), null)
}

export function audioGet(path) {
  return tx('audio', 'readonly', (s) => s.get(path), null).then((row) => (row ? row.blob : null))
}

export function audioHas(path) {
  return tx('audio', 'readonly', (s) => s.getKey ? s.getKey(path) : s.get(path), null).then(Boolean)
}

// ── Storage management (Settings) ───────────────────────────────────────────
export function audioCount() {
  return tx('audio', 'readonly', (s) => s.count(), 0).then((n) => n || 0)
}

// Remove downloaded audio + cached snapshots. Deliberately leaves the outbox
// intact so unsynced offline writes are never lost.
export function clearDownloads() {
  return Promise.all([
    tx('cache', 'readwrite', (s) => s.clear(), null),
    tx('audio', 'readwrite', (s) => s.clear(), null),
  ])
}

// { usage, quota } bytes from the Storage API, or null if unsupported.
export function estimateStorage() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().catch(() => null)
    }
  } catch { /* noop */ }
  return Promise.resolve(null)
}

// Date.now is fine at runtime (the scripting ban on it is a workflow-script
// constraint, not a browser one). Guarded so it can't throw.
function nowStamp() {
  try { return Date.now() } catch { return 0 }
}

// Review intents are learner writes, not disposable cache. Unlike cache helpers,
// they MUST reject a failed transaction so Study never advances on a false save.
function reviewTransaction(mode, work) {
  return openDb().then(db => {
    if (!db) throw new Error('Device storage is unavailable. Please enable storage and try again.')
    return new Promise((resolve, reject) => {
      let result
      let failure
      let transaction
      try {
        transaction = db.transaction('reviews', mode)
        work(transaction.objectStore('reviews'), value => { result = value }, error => {
          failure = error
          transaction.abort()
        })
      } catch (error) {
        if (transaction) transaction.abort()
        reject(error)
        return
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(failure || transaction.error || new Error('Review could not be saved on this device.'))
      transaction.onabort = () => reject(failure || transaction.error || new Error('Review save was interrupted.'))
    })
  })
}

export function reviewRetiredIds(row) {
  return [...new Set([...(row?.retiredCardIds || []), row?.retiredCardId].filter(Boolean))]
}

export function sameReviewVersion(a, b) {
  return !!a && !!b && a.opId === b.opId && a.userId === b.userId &&
    a.version === b.version && a.status === b.status && a.ordinal === b.ordinal &&
    a.card?.id === b.card?.id && a.card?.revision === b.card?.revision
}

export function reviewRecords(userId) {
  if (!userId) return Promise.resolve([])
  return reviewTransaction('readonly', (store, done) => {
    store.getAll().onsuccess = event => done(event.target.result.filter(row => row.userId === userId))
  }).catch(() => [])
}

export function reviewCreate(intent) {
  return reviewTransaction('readwrite', (store, done, fail) => {
    store.getAll().onsuccess = event => {
      const rows = event.target.result
      const existing = rows.find(row => row.opId === intent.opId)
      if (existing) {
        if (existing.userId !== intent.userId) { fail(new Error('REVIEW_CONFLICT: review belongs to a different account.')); return }
        done(existing) // Retry always uses the ORIGINAL immutable intent.
        return
      }
      const conflicts = rows.some(row => row.userId === intent.userId && row.intent.vocabId === intent.vocabId && (
        row.status === 'pending' || row.status === 'undo_pending' || row.status === 'conflict' ||
        (row.card && (!intent.cardId || row.card.id !== intent.cardId || Number(row.card.revision) > Number(intent.expected?.revision || 0))) ||
        (intent.cardId && reviewRetiredIds(row).includes(intent.cardId))
      ))
      if (conflicts) { fail(new Error('REVIEW_CONFLICT: this word has a newer or unfinished review. Return Home to refresh.')); return }
      const ordinal = Math.max(0, ...rows.map(row => Number(row.ordinal || row.createdAt || 0))) + 1
      const row = { opId: intent.opId, userId: intent.userId, intent, status: 'pending', version: 0, ordinal, createdAt: Date.now(), card: null }
      store.add(row)
      done(row)
    }
  })
}

// Compare and swap inside ONE read/write transaction. A late network response
// can never overwrite an Undo request, reset tombstone, or newer receipt.
export function reviewUpdate(opId, userId, patch, expected) {
  return reviewTransaction('readwrite', (store, done) => {
    store.get(opId).onsuccess = event => {
      const row = event.target.result
      if (!row || row.userId !== userId) { done(null); return }
      if (!sameReviewVersion(row, expected)) { done(row); return }
      const next = { ...row, ...patch, opId: row.opId, userId: row.userId, intent: row.intent, ordinal: row.ordinal, version: (row.version || 0) + 1 }
      store.put(next)
      done(next)
    }
  })
}

export function reviewDeleteMany(rows, userId) {
  return reviewTransaction('readwrite', (store, done) => {
    for (const expected of rows) {
      store.get(expected.opId).onsuccess = event => {
        const current = event.target.result
        if (current?.userId === userId && sameReviewVersion(current, expected) &&
          !['pending', 'undo_pending', 'retired'].includes(current.status) && reviewRetiredIds(current).length === 0) store.delete(current.opId)
      }
    }
    done(true)
  })
}

// Account deletion only. Ordinary download clearing must keep review intents.
export function reviewClear(userId) {
  if (!userId) return Promise.resolve(false)
  return reviewTransaction('readwrite', (store, done) => {
    store.getAll().onsuccess = event => {
      for (const row of event.target.result) if (row.userId === userId) store.delete(row.opId)
      done(true)
    }
  }).catch(() => false)
}
