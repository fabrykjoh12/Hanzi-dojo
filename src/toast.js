// Fire-and-forget UI toast, decoupled from the component tree so plain modules
// can celebrate moments without prop drilling. Rendered by <Toasts /> mounted
// in App.
//
// detail: { title, body?, kind?: 'seal' | 'info' | 'warn', accent? }
//
// `kind` picks the icon in <Toasts />. An unknown kind falls back to the seal's
// medal, which is why a refusal or a failure should name one: a medal on bad
// news reads as a celebration (CLAUDE.md §1).
export function toast(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('hd-toast', { detail }))
}
