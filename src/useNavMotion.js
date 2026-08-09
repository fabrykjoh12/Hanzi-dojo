import { useLayoutEffect, useRef } from 'react'
import { motionPlan } from './navMotion'

// The effectful half of navMotion.js: find the layer that just became visible
// and run the one animation the model asked for.
//
// Web Animations rather than a CSS class, for two reasons. A CSS animation
// cannot be re-triggered on an element that is already in the DOM without a
// key change or a reflow hack, and the tab roots must never be re-keyed —
// re-keying them is precisely the remount this whole phase removed. And a CSS
// animation restarts by itself whenever an element goes from `display: none`
// back to displayed, which is what <Activity> does on every tab show; that is
// the bug that took the automatic `.hd-rise` off every panel in the app. An
// imperative animation runs when we say it runs, exactly once.
function prefersReducedMotion() {
  try {
    return Boolean(
      typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
  } catch {
    // A blocked or absent matchMedia is not a reason to refuse to animate.
    return false
  }
}

export function useNavMotion(state) {
  const previous = useRef(null)
  const running = useRef(null)

  // Layout effect, not a passive one: the layer is in the DOM at its final
  // opacity by then, and waiting for paint would show that frame before the
  // animation could start from zero.
  useLayoutEffect(() => {
    const from = previous.current
    previous.current = state
    // The first commit is the app appearing, which the splash already owns.
    if (!from || !state) return

    const plan = motionPlan(from, state, { reducedMotion: prefersReducedMotion() })
    if (!plan) return

    const el = typeof document !== 'undefined' ? document.querySelector(plan.selector) : null
    // No element (a root not mounted yet) or no Web Animations (jsdom) — the
    // navigation still happened, it just happens without motion.
    if (!el || typeof el.animate !== 'function') return

    if (running.current) {
      try { running.current.cancel() } catch { /* already finished */ }
      running.current = null
    }
    try {
      running.current = el.animate(plan.keyframes, plan.options)
    } catch {
      running.current = null
    }
  }, [state])
}

export default useNavMotion
