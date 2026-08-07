// Is browser speech recognition actually usable here?
//
// Checking for the constructor alone is not enough. iOS's WKWebView — which
// is what the App Store build runs — exposes `webkitSpeechRecognition` while
// providing no working implementation, and Android's WebView is the same. So
// a constructor-only check makes the Speaking drill *look* available in the
// store apps and then fail on the first tap, which is worse than an honest
// "not supported here" screen.
//
// Web Speech in the native apps needs a real native plugin; until that ships
// (PRE-RELEASE-CHECKLIST §5) the drill declares itself unavailable there.

import { isNativeApp } from './nativeShell'

export function speechRecognitionCtor(win) {
  const w = win || (typeof window !== 'undefined' ? window : null)
  if (!w) return null
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

// `native` is injected for testing; it defaults to the real shell check.
export function speechRecognitionSupported({ ctor, native } = {}) {
  const hasCtor = ctor === undefined ? Boolean(speechRecognitionCtor()) : Boolean(ctor)
  const inNativeShell = native === undefined ? isNativeApp() : Boolean(native)
  if (inNativeShell) return false
  return hasCtor
}

// What a recognition error actually means for the learner. The Web Speech
// spec's two "not allowed" codes are routinely confused:
//   not-allowed          → the user (or the OS) refused the microphone
//   service-not-allowed  → the recognition SERVICE is unavailable, which is
//                          what an unsupported/embedded browser reports —
//                          telling that user to unblock their mic is a
//                          dead end, because the mic was never the problem.
export function speechErrorKind(error) {
  if (error === 'not-allowed') return 'denied'
  if (error === 'service-not-allowed') return 'unsupported'
  if (error === 'audio-capture') return 'no-mic'
  return 'other'
}
