// The trust pages a SIGNED-IN learner must be able to reach from inside the app.
//
// Why this is a module and not three literals in Settings.jsx: App Store
// guideline 5.1.1(i) wants the privacy policy linked in the App Store Connect
// metadata AND inside the app, and until FAB-19 the only links to /privacy were
// on the sign-up screen (Auth.jsx) and the public landing footer (Landing.jsx) —
// both unreachable once you have an account. That is a cheap, common rejection,
// and the kind of thing that silently rots when a route is renamed. Keeping the
// list here with a spec that resolves every path through routes.trustPageKey()
// means a rename breaks a test instead of breaking review.
//
// These navigate IN-APP: App.jsx renders trust pages before the session check,
// so /privacy works signed-in, and staying in the webview beats bouncing the
// learner into Safari. The signup screen deliberately does the opposite
// (externalLink.legalLinkProps) because navigating away there would discard a
// half-filled form.

export const LEGAL_LINKS = [
  { path: '/privacy', label: 'Privacy Policy' },
  { path: '/terms', label: 'Terms of Use' },
  { path: '/support', label: 'Support & Contact' },
]

// Just the paths — handy for specs and for anything that needs to check
// reachability without caring about the labels.
export function legalLinkPaths() {
  return LEGAL_LINKS.map(link => link.path)
}
