// "The app has something real to show." One boolean, published once per app
// run, so the launch overlay can wait for content instead of guessing.
//
// Why a module and not React state: SplashIntro is a *sibling* of App in
// main.jsx, not a child — it deliberately covers whatever App is doing, which
// means it cannot be handed a prop or read a context that App provides.
// Module scope also survives a remount, which matters because readiness is a
// property of the app run, not of a component instance.
//
// Deliberately one-way. Nothing sets it back to false: an app that has painted
// its first screen has launched, and a later sign-out or navigation is not a
// second launch.

let ready = false
const listeners = new Set()

export function isAppReady() {
  return ready
}

// Called by App.jsx the moment the session/profile bootstrap settles — success,
// empty account, or failure alike. All three are "we know what to draw now",
// and a failed bootstrap must lift the splash too, or a learner on a dead
// network stares at a logo.
export function markAppReady() {
  if (ready) return
  ready = true
  listeners.forEach((fn) => {
    try { fn() } catch { /* a bad listener must not block the others */ }
  })
}

// Subscribe. Fires immediately if readiness has already happened, so a late
// subscriber can never miss the one event it exists for. Returns an
// unsubscribe.
export function onAppReady(fn) {
  if (typeof fn !== 'function') return () => {}
  if (ready) {
    fn()
    return () => {}
  }
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Tests only — the flag is process-wide by design.
export function resetAppReady() {
  ready = false
  listeners.clear()
}
