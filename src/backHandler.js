// Where the Android hardware back button asks what to do.
//
// The problem this solves is an ordering one. `NativeShellBridge` registers the
// one `backButton` listener, and it must stay registered from the moment the
// app boots — it also carries deep links and OAuth/magic-link callbacks, which
// arrive long before anyone is signed in. But the answer to "what does Back
// mean right now" lives in the navigation model, which only exists once the
// authenticated shell is mounted. The bridge is a SIBLING of <App/> in
// main.jsx, so it cannot read a context App provides, and moving it inside the
// shell would break every auth link that lands on the sign-in screen.
//
// So the bridge keeps the listener and the shell lends it an answer. This
// registry holds ONE callback — never a copy of the navigation state, which
// would be the second source of truth the whole model exists to avoid. When no
// shell is mounted (Landing, Onboarding, the password-reset screen) there is no
// handler, and the bridge falls back to the original path-based behaviour.

let handler = null

// Returns an unregister, so a shell that unmounts (sign-out) takes its answer
// with it rather than leaving a stale closure behind.
export function setBackHandler(fn) {
  if (typeof fn !== 'function') return () => {}
  handler = fn
  return () => { if (handler === fn) handler = null }
}

export function hasBackHandler() {
  return handler !== null
}

// 'handled' — the shell dealt with it, do nothing else.
// 'exit'    — the shell says this is the way out of the app.
// null      — no shell mounted; the caller uses its own fallback.
export function runBackHandler() {
  if (!handler) return null
  try {
    const result = handler()
    return result === 'exit' ? 'exit' : 'handled'
  } catch {
    // A throwing handler must not wedge the back button. Fall through to the
    // caller's fallback, which is always safe.
    return null
  }
}

// Tests only — the registry is process-wide by design.
export function resetBackHandler() {
  handler = null
}
