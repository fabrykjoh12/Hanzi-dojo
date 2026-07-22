// Fire-and-forget UI toast, decoupled from the component tree so plain modules
// can celebrate moments without prop drilling. Rendered by <Toasts /> mounted
// in App.
//
// detail: { title, body?, kind?: 'seal', accent? }
export function toast(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('hd-toast', { detail }))
}
