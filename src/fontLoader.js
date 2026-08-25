// On-demand web fonts for the languages that need one.
//
// index.html ships the UI faces plus Noto Sans SC, because Chinese is the
// product and its hanzi are on screen at first paint. A full CJK family is the
// most expensive thing the page loads, so the paused tracks' fonts are NOT in
// that stylesheet — a learner who will never open a Japanese screen should not
// pay for Noto Sans JP on every cold start. When a grandfathered track does
// become active, its font is fetched here and the screen renders exactly as
// before (CLAUDE.md §1: frozen means untouched, not broken).

import { languageTheme } from './languageTheme'
import { isNativeApp } from './nativeShell'

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?family='

// The stylesheet URL a language needs, or null when its faces are already in
// the base stylesheet. Pure — the fetching itself is the caller's job.
//
// `native` is injected for testing; it defaults to the real shell check. In the
// store apps this ALWAYS returns null: the app bundles its own faces
// (src/webfonts.css) and must not contact fonts.googleapis.com at all (FAB-19
// F4). Only the paused Japanese track declares a webFont, so in practice this
// affects a grandfathered learner on that track — their Chinese-equivalent
// faces come from the platform's own CJK font instead of Google's. The track
// keeps working, which is what CLAUDE.md §1 asks of a frozen track; it just
// stops reaching the network to do it.
export function fontHrefFor(language, { native } = {}) {
  const inNativeShell = native === undefined ? isNativeApp() : Boolean(native)
  if (inNativeShell) return null
  const spec = languageTheme(language).webFont
  if (!spec) return null
  return GOOGLE_FONTS_BASE + spec + '&display=swap'
}

// Whether this href has already been requested — idempotent, so switching back
// and forth between tracks never injects a second <link>.
export function fontAlreadyLoaded(doc, href) {
  if (!doc || typeof doc.querySelector !== 'function') return true
  return Boolean(doc.querySelector('link[data-hd-font="' + href + '"]'))
}

// Fetch the language's font if it needs one. Best-effort in every direction:
// a missing document, a blocked CDN or a thrown DOM call must never break a
// screen — the text still renders in the system fallback.
export function ensureLanguageFont(language, doc, opts) {
  const target = doc || (typeof document !== 'undefined' ? document : null)
  const href = fontHrefFor(language, opts || {})
  if (!href || !target) return false
  try {
    if (fontAlreadyLoaded(target, href)) return false
    const link = target.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-hd-font', href)
    target.head.appendChild(link)
    return true
  } catch {
    return false
  }
}
