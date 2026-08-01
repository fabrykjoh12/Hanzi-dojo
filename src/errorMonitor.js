// Privacy-conscious client error monitoring. Unhandled exceptions, unhandled
// promise rejections, and render crashes (via ErrorBoundary) become
// 'client_error' analytics events, so production failures are visible on the
// dashboard's data instead of vanishing into users' consoles.
//
// Privacy rules (same contract as all analytics — see analytics.js):
//   - only the error NAME, a truncated message, and the route are recorded —
//     never stack traces (they can embed URLs/tokens), never typed text.
//   - sanitizeProps caps every string at 40 chars as a hard backstop.
//   - capped per app-load so an error loop can't flood the events table.

import { track, EVENTS } from './analytics'

const MAX_REPORTS = 5
let reported = 0

// Pure: shape an Error-ish value + route into safe event props. Exported for
// tests. `source` is 'window' | 'promise' | 'boundary'.
export function errorEventProps(err, source, pathname) {
  const name = err && err.name ? String(err.name) : 'Error'
  const rawMessage = err && err.message != null ? String(err.message) : String(err || 'unknown')
  return {
    source: String(source || 'window').slice(0, 20),
    error_name: name.slice(0, 40),
    message: rawMessage.slice(0, 40),
    route: ('/' + String(pathname || '').split('/').filter(Boolean).join('/')).slice(0, 40),
  }
}

// Report one error (rate-capped). Never throws.
export function reportClientError(err, source) {
  try {
    if (reported >= MAX_REPORTS) return
    reported += 1
    const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : ''
    track(EVENTS.CLIENT_ERROR, errorEventProps(err, source, pathname))
  } catch { /* monitoring must never break the app */ }
}

// Install the global handlers once. Returns an uninstaller (used by tests).
let installed = false
export function installErrorMonitoring() {
  if (installed || typeof window === 'undefined') return () => {}
  installed = true
  const onError = (event) => { reportClientError(event.error || event.message, 'window') }
  const onRejection = (event) => { reportClientError(event.reason, 'promise') }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    installed = false
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

// Test hook.
export function _resetErrorMonitorForTests() {
  reported = 0
  installed = false
}
