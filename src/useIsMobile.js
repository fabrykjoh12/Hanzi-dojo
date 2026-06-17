import { useSyncExternalStore } from 'react'

// Shared responsive breakpoint. The sidebar becomes a bottom navigation bar
// at or below this width (see CLAUDE.md — mobile layout).
export const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`

// Returns true when the viewport is at or below MOBILE_BREAKPOINT.
// Backed by matchMedia via useSyncExternalStore so it stays in sync with
// resize/orientation changes without a setState-in-effect.
export default function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function subscribe(callback) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  return false
}
