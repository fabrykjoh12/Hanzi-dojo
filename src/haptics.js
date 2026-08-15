// Haptic feedback, strictly best-effort.
//
// navigator.vibrate exists in Android WebViews and most Android browsers; iOS
// WKWebView has no web vibration API at all, so on iPhones these are silent
// no-ops — acceptable, because haptics here are seasoning, never signal.
// (Real iOS haptics would need the @capacitor/haptics native plugin; not
// worth a dependency for this.) Everything is try/caught: feedback must
// never be able to break the interaction it decorates.

function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch { /* never let feedback break the interaction */ }
}

// A light tick — card flips, selections.
export function tapFeedback() {
  vibrate(10)
}

// A short double pulse — the moment something lands (right answer).
export function successFeedback() {
  vibrate([14, 60, 14])
}
