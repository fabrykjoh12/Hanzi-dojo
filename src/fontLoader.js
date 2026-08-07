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

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?family='

// The stylesheet URL a language needs, or null when its faces are already in
// the base stylesheet. Pure — the fetching itself is the caller's job.
export function fontHrefFor(language) {
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
export function ensureLanguageFont(language, doc) {
  const target = doc || (typeof document !== 'undefined' ? document : null)
  const href = fontHrefFor(language)
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
