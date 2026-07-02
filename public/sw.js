/* Hanzi-dojo service worker — runtime caching for offline resilience.
 *
 * Strategy:
 *  - navigations            → network-first, fall back to cached app shell
 *  - same-origin assets     → cache-first (JS/CSS/images/icons)
 *  - Google Fonts           → cache-first
 *  - Supabase audio bucket  → cache-first (offline pronunciation replay)
 *  - Supabase REST / other  → network-only (never serve stale user data)
 *
 * This file is served verbatim from /public (no bundler transform). Plain JS.
 */

// v5: adds push notification handling (opt-in daily review reminders) — no
// caching behavior changed, the bump just gives the new SW code a clean
// install/activate cycle.
var VERSION = 'v5'
var SHELL_CACHE = 'hanzi-shell-' + VERSION
var ASSET_CACHE = 'hanzi-assets-' + VERSION
var AUDIO_CACHE = 'hanzi-audio-' + VERSION
var KEEP = [SHELL_CACHE, ASSET_CACHE, AUDIO_CACHE]

// Cache-first caches grow forever without a cap: every deploy adds new hashed
// bundles, every studied word adds an MP3. Oldest entries (insertion order)
// are evicted past these limits.
var CACHE_LIMITS = {}
CACHE_LIMITS[ASSET_CACHE] = 80
CACHE_LIMITS[AUDIO_CACHE] = 400

function trimCache(cacheName) {
  var max = CACHE_LIMITS[cacheName]
  if (!max) return Promise.resolve()
  return caches.open(cacheName).then(function (cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= max) return null
      return Promise.all(keys.slice(0, keys.length - max).map(function (k) {
        return cache.delete(k)
      }))
    })
  })
}

// Scope-relative shell URL (works under /Hanzi-dojo/ and /).
var SHELL_URL = new URL('./index.html', self.registration.scope).toString()

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll([self.registration.scope, SHELL_URL]).catch(function () { /* ignore */ })
    }).then(function () { return self.skipWaiting() })
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (KEEP.indexOf(k) === -1) return caches.delete(k)
        return null
      }))
    }).then(function () { return self.clients.claim() })
  )
})

function isFont(url) {
  return url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1
}
function isAudio(url) {
  return url.indexOf('/storage/v1/object/public/audio/') !== -1
}
function isSupabaseRest(url) {
  return url.indexOf('/rest/v1/') !== -1 || url.indexOf('/auth/v1/') !== -1
}

// Cache-first: serve from cache, else fetch and store a copy (then trim the
// cache back under its cap, oldest-first).
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit
      return fetch(request).then(function (resp) {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          cache.put(request, resp.clone()).then(function () { return trimCache(cacheName) })
        }
        return resp
      })
    })
  })
}

self.addEventListener('fetch', function (event) {
  var request = event.request
  if (request.method !== 'GET') return

  var url = request.url

  // Never intercept Supabase data/auth — always go to the network.
  if (isSupabaseRest(url)) return

  // App navigations: network-first with cached-shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(SHELL_URL).then(function (hit) {
          return hit || caches.match(self.registration.scope)
        })
      })
    )
    return
  }

  if (isAudio(url)) {
    // Ranged media requests must go straight to the network: a cached FULL
    // response to a ranged request breaks Safari/iOS playback, and a cached
    // PARTIAL response (opaque, so its 206 status is invisible here) would
    // poison every subsequent play of this file. Only full, un-ranged
    // responses are safe to cache — Chrome's first fetch has no Range header,
    // so offline replay still works there.
    if (request.headers.get('range')) return
    event.respondWith(cacheFirst(request, AUDIO_CACHE))
    return
  }
  if (isFont(url)) { event.respondWith(cacheFirst(request, ASSET_CACHE)); return }

  // Same-origin static assets (hashed JS/CSS, icons, background images).
  if (url.indexOf(self.location.origin) === 0) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
  }
})

// Opt-in daily review reminder (product review item #16). The payload is
// sent as JSON by send-review-reminders.mjs: { title, body, url }.
self.addEventListener('push', function (event) {
  var data = { title: 'Reviews waiting', body: 'You have cards due for review.', url: '/' }
  if (event.data) {
    try { data = Object.assign(data, event.data.json()) } catch { /* keep defaults */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './pwa-192.png',
      badge: './pwa-192.png',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var target = new URL(event.notification.data && event.notification.data.url || './', self.registration.scope).toString()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i += 1) {
        if (clients[i].url === target && 'focus' in clients[i]) return clients[i].focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return null
    })
  )
})
