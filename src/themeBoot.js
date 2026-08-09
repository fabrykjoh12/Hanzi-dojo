// Which theme the app wears on the very first frame.
//
// Why this exists: App.jsx used to start every launch at `light` and only
// learn the real answer from the *server* profile, several hundred
// milliseconds later. On a phone in dark mode that is a full-screen white
// flash on every single cold start — the loudest possible "this is a web page
// loading" signal, and the one thing the native launch image is supposed to
// prevent.
//
// The answer comes from two places, in order:
//   1. A deliberate choice the learner already made (remembered on the device,
//      so it survives the app being killed and applies before any network).
//   2. The operating system's own light/dark setting.
//
// The device copy is a CACHE, never the record: the profile column in Supabase
// is still the source of truth, and App.jsx overwrites this the moment the
// profile lands. That keeps the same account consistent across devices while
// making the local launch instant.
//
// index.html carries a four-line inline copy of `bootTheme` that runs before
// the stylesheet paints. It has to be duplicated — a module cannot run earlier
// than the bundle that contains it — so the rules live here, tested, and that
// script stays a transcription of them. If you change this function, change
// that script.

export const THEME_STORAGE_KEY = 'hd:theme'

export function isTheme(value) {
  return value === 'dark' || value === 'light'
}

// The whole decision, as data in and a theme out.
export function bootTheme({ stored, prefersDark } = {}) {
  if (isTheme(stored)) return stored
  return prefersDark ? 'dark' : 'light'
}

// ── Device edges (guarded, never assumed — CLAUDE.md §6.5) ────────────────

export function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function rememberTheme(theme) {
  if (!isTheme(theme)) return
  try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* storage blocked — the profile still holds it */ }
}

export function prefersDarkScheme(win) {
  const w = win || (typeof window !== 'undefined' ? window : null)
  if (!w || typeof w.matchMedia !== 'function') return false
  try {
    return w.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

// What App.jsx seeds its state with.
export function initialTheme(win) {
  return bootTheme({ stored: readStoredTheme(), prefersDark: prefersDarkScheme(win) })
}
