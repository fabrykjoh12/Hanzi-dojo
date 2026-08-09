// The native status bar, kept in step with the app's theme.
//
// `@capacitor/status-bar` has been a dependency since the Capacitor scaffold
// landed and had zero call sites: the bar kept whatever appearance the OS gave
// it, so a learner in dark mode got dark icons on the app's near-black
// background — invisible — and switching the theme in Settings changed
// everything on screen except the clock.
//
// Two rules, both deliberate:
//
// 1. **Style only. Never a background colour, never an overlay toggle.**
//    Both `setBackgroundColor()` and `setOverlaysWebView()` are documented as
//    unavailable on Android 15+, and this app targets SDK 36. Android is
//    edge-to-edge whether we ask for it or not, so the bar is transparent by
//    definition and the only thing left to control is whether its icons are
//    drawn light or dark. The app already draws under it: `viewport-fit=cover`
//    in index.html, `contentInset: "never"` on iOS, and the top
//    `env(safe-area-inset-top)` padding in App.jsx's <main>. Painting a
//    coloured strip behind the clock would fight all three.
//
// 2. **The mapping is inverted, so it is a tested function rather than a
//    guess at the call site.** Capacitor's `Style.Dark` means "light text, for
//    a dark background" — the opposite of what the name reads like. Writing
//    `Style[theme]` would be wrong in both directions and would look right.

// The plugin's string values, hard-coded rather than imported, so this module
// stays pure and loadable in a test and on the web.
export const STATUS_BAR_STYLE = { dark: 'DARK', light: 'LIGHT', default: 'DEFAULT' }

// App theme → the style string the bar needs.
//   'dark'  → the app's background is near-black → the bar needs LIGHT icons →
//             Capacitor calls that DARK.
//   'light' → the app's background is paper      → the bar needs DARK icons →
//             Capacitor calls that LIGHT.
export function statusBarStyleFor(theme) {
  return theme === 'dark' ? STATUS_BAR_STYLE.dark : STATUS_BAR_STYLE.light
}

// Push the style at the native bar. No-op everywhere except the app: the
// import is dynamic so the web bundle never carries the plugin, and every
// failure is swallowed — a status bar that did not repaint must not be able
// to break a screen.
export function syncStatusBar(theme, { native } = {}) {
  if (native === false) return Promise.resolve(false)
  return import('@capacitor/status-bar')
    .then(({ StatusBar }) => StatusBar.setStyle({ style: statusBarStyleFor(theme) }))
    .then(() => true)
    .catch(() => false)
}
