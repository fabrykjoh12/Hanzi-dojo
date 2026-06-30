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

var VERSION = 'v2'
var SHELL_CACHE = 'hanzi-shell-' + VERSION
var ASSET_CACHE = 'hanzi-assets-' + VERSION
var AUDIO_CACHE = 'hanzi-audio-' + VERSION
var KEEP = [SHELL_CACHE, ASSET_CACHE, AUDIO_CACHE]

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

// Cache-first: serve from cache, else fetch and store a copy.
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit
      return fetch(request).then(function (resp) {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(request, resp.clone())
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

  if (isAudio(url)) { event.respondWith(cacheFirst(request, AUDIO_CACHE)); return }
  if (isFont(url)) { event.respondWith(cacheFirst(request, ASSET_CACHE)); return }

  // Same-origin static assets (hashed JS/CSS, icons, background images).
  if (url.indexOf(self.location.origin) === 0) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
  }
})
