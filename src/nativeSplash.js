// The platform launch image — the one the OS shows before a single line of our
// JavaScript has run.
//
// It is configured with `launchAutoHide: false` (capacitor.config.json), which
// is the whole point: the default hides it on a 500 ms timer, so on any launch
// slower than that the learner watched the launch image disappear and a blank
// WebView appear in its place. Holding it until *we* say so means the handoff
// happens at a moment we control — when SplashIntro.jsx has painted the same
// mark on the same background, so nothing visibly changes at the seam.
//
// Everything here is best-effort and silent. A splash that failed to hide would
// be a black screen, so the caller also arms a fallback; a splash that failed to
// hide *twice* is not something an error toast can help with.

// Hide immediately — the web overlay is already covering the same pixels, so a
// cross-fade here would fade one identical image into another.
const FADE_OUT_MS = 0

export function hideNativeSplash({ native } = {}) {
  if (native === false) return Promise.resolve(false)
  return import('@capacitor/splash-screen')
    .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: FADE_OUT_MS }))
    .then(() => true)
    .catch(() => false)
}
