// Haptic feedback, strictly best-effort.
//
// Two haptics, and deliberately only two. A phone that buzzes at everything
// stops meaning anything, so this module offers exactly one "you pressed it"
// tick and one "that landed" confirmation, and the call sites are counted:
//
//   tapFeedback()     — a card graded, a tab selected, a first-run card flipped
//   successFeedback() — a session finished, a chapter unlocked
//
// Nothing else gets one. Navigation, scrolling, opening a sheet, typing: no.
//
// ── Why this file changed ────────────────────────────────────────────────
// It used to be `navigator.vibrate()` alone, with a comment conceding that iOS
// WKWebView implements no Vibration API and that "real iOS haptics would need
// the @capacitor/haptics native plugin; not worth a dependency for this". That
// was the wrong call for a product that ships as an iPhone app: it meant the
// single most-repeated action in the app — grading a card — had no physical
// feedback at all on the flagship platform, and a flat glass tap is most of
// what makes a webview feel like a webview.
//
// The plugin is now the native path and `navigator.vibrate` stays as the web
// fallback, so browser behaviour is byte-for-byte what it was.

import { isNativeApp } from './nativeShell'

// One memoised import for the app's whole life. The first grade of a session
// pays for the module; every later one is a resolved-promise hit. Held even on
// failure (as null) so a device without the plugin does not retry the import
// on every single card.
let pluginPromise = null

function haptics() {
  if (pluginPromise) return pluginPromise
  pluginPromise = import('@capacitor/haptics')
    .then((mod) => mod)
    .catch(() => null)
  return pluginPromise
}

// The web path, unchanged: Android browsers and Android WebViews implement
// this; iOS Safari and WKWebView do not, which is exactly why the native path
// above exists.
function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch { /* never let feedback break the interaction it decorates */ }
}

// Fire-and-forget on purpose. Nothing in the UI may await a buzz — a grade must
// commit at finger speed whether or not the taptic engine answers.
//
// Both failure shapes are swallowed, and they are genuinely different: the
// plugin call can throw synchronously, and it can also hand back a promise that
// rejects later (its own web fallback does exactly that on a platform with no
// Vibration API). An unhandled rejection would be reported by errorMonitor.js
// as a client error, so the app would be filing bug reports about a phone
// declining to buzz.
function fire(useNative, webPattern) {
  if (!isNativeApp()) {
    vibrate(webPattern)
    return
  }
  haptics().then((mod) => {
    if (!mod) { vibrate(webPattern); return }
    try {
      const result = useNative(mod)
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch { /* a silent phone is an acceptable failure */ }
  }).catch(() => { /* the import itself is already caught in haptics() */ })
}

// A light tick — a card graded, a tab selected, a card flipped.
//
// ImpactStyle.Light rather than the selection generator: iOS's
// UISelectionFeedbackGenerator is subtler, but Capacitor only fires it when
// selectionStart() has already run (see Haptics.swift — selectionChanged() is
// a no-op without it), so a standalone tab tap would silently do nothing on
// the one platform the softer feel was for. One reliable tick beats a nicer
// one that is not there.
export function tapFeedback() {
  fire((mod) => mod.Haptics.impact({ style: mod.ImpactStyle.Light }), 10)
}

// A short double pulse — the moment something lands. Reserved for the two
// moments the app actually celebrates: a finished session and an unlocked
// chapter.
export function successFeedback() {
  fire((mod) => mod.Haptics.notification({ type: mod.NotificationType.Success }), [14, 60, 14])
}

// Tests only — the memoised import is process-wide by design.
export function resetHapticsPlugin() {
  pluginPromise = null
}
