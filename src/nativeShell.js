// Native-app shell logic for the Capacitor wrapper (CLAUDE.md §1: the product
// ships as store apps wrapping this same SPA). Pure decisions live here so they
// are testable; the listeners that consume them live in NativeShellBridge.jsx.

// Hosts whose links may open the app (universal links). Anything else is a
// foreign URL and must NOT be routed into the SPA.
export const APP_LINK_HOSTS = ['hanzi-dojo.com', 'www.hanzi-dojo.com']

// The custom URL scheme registered by the native shells (OAuth/magic-link
// callbacks land here once the auth work in PRE-RELEASE-CHECKLIST §0b ships).
export const APP_URL_SCHEME = 'com.hanzidojo.app'

// True when running inside the Capacitor native shell. Reads the global the
// native runtime injects, so the web bundle needs no Capacitor import and the
// check is safe in every browser, test and SSR-less context.
export function isNativeApp() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : undefined
    return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
  } catch {
    return false
  }
}

// Map a deep-link URL (universal link or custom scheme) to an in-app route,
// or null when the URL is not ours. Never throws on garbage input.
export function routeFromDeepLink(url) {
  if (typeof url !== 'string' || !url) return null
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const protocol = parsed.protocol.replace(/:$/, '')
  if (protocol === 'https' || protocol === 'http') {
    if (!APP_LINK_HOSTS.includes(parsed.hostname)) return null
    return (parsed.pathname || '/') + parsed.search + parsed.hash
  }
  if (protocol === APP_URL_SCHEME) {
    // For a custom scheme the first path segment parses as the URL host:
    // com.hanzidojo.app://read/abc → host 'read', pathname '/abc'.
    const path = '/' + parsed.host + (parsed.pathname || '')
    return (path === '/' ? '/' : path.replace(/\/$/, '')) + parsed.search + parsed.hash
  }
  return null
}

// Android hardware back: go back through history when there is history to go
// back through, otherwise step to Home, and only exit the app from Home.
export function backAction(pathname, canGoBack) {
  const atRoot = pathname === '/' || pathname === ''
  if (atRoot) return 'exit'
  if (canGoBack) return 'back'
  return 'home'
}
