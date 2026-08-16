// "This screen owns the whole viewport."
//
// The story reader is not a route — it opens INSIDE the `stories` view — so the
// shell cannot tell from `view` alone that the learner is reading. Rather than
// thread a callback down through Stories into six reader presentations, the
// reader declares itself focused and the shell listens.
//
// Deliberately a tiny module-level store rather than context: the only writer is
// whichever reader is mounted, the only readers are the shell chrome, and a
// context provider would have to wrap the entire app to serve two consumers.

import { useEffect, useState } from 'react'

let focused = false
const listeners = new Set()

export function isNavFocused() {
  return focused
}

export function setNavFocused(next) {
  const value = Boolean(next)
  if (value === focused) return
  focused = value
  listeners.forEach(fn => { try { fn(value) } catch { /* a bad listener must not break navigation */ } })
}

export function subscribeNavFocus(fn) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// Test/teardown hook — a leaked `true` would hide the navigation app-wide.
export function resetNavFocus() {
  focused = false
  listeners.clear()
}

// For the shell: re-renders when a screen enters or leaves focused mode.
export function useNavFocused() {
  const [value, setValue] = useState(isNavFocused)
  useEffect(() => subscribeNavFocus(setValue), [])
  return value
}

// For a focused screen: declares focus for as long as it is mounted, and
// releases it on unmount (including an unmount mid-transition).
export function useDeclareNavFocus(active = true) {
  useEffect(() => {
    if (!active) return undefined
    setNavFocused(true)
    return () => setNavFocused(false)
  }, [active])
}
