// Offline storage layer — one small IndexedDB database, no dependencies.
//
// Why IndexedDB and not localStorage: localStorage is banned in this codebase
// (and is synchronous + tiny). IndexedDB is the right tool for offline data and
// for storing audio blobs so pronunciation replays without a network — even on
// iOS, where the service worker deliberately bypasses ranged media requests.
//
// EVERYTHING here degrades safely: if IndexedDB is missing or throws, every
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
const DB_VERSION = 2
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
