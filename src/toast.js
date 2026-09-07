// Fire-and-forget UI toast, decoupled from the component tree so plain modules
// can celebrate moments without prop drilling. Rendered by <Toasts /> mounted
// in App.
//
// detail: { title, body?, kind?: 'seal' | 'info' | 'warn', accent? }
//
// THERE IS NO QUEUE, AND THAT IS THE TRAP. toast() dispatches a DOM event; if
// no <Toasts /> is listening at that instant the event is simply lost, with no
// error and nothing in the console. App returns a shell containing <Toasts />
// only on the ordinary signed-in routes — onboarding, the trust pages, the
// public reading assessment, a public story link and the password-recovery
// screen all return earlier — so "dispatch it when the app is ready" is not the
// same as "dispatch it where something will draw it".
//
// So a caller that must not lose its message asks first. The count below is
// maintained by <Toasts />'s own listener effect, in the same place that adds
// and removes the window listener, which is what keeps it from drifting away
// from the truth it reports.
export function toast(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('hd-toast', { detail }))
}

let listening = 0

// Called by <Toasts /> as it starts and stops listening. Not for general use.
export function registerToastListener() {
  listening += 1
  return () => { listening = Math.max(0, listening - 1) }
}

// Would a toast dispatched right now reach a stack that can draw it?
export function toastsAreListening() {
  return listening > 0
}
