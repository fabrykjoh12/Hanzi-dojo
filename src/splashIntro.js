// The launch animation's timing and the decision to play it at all.
//
// Kept out of the component because "when does this appear and for how long"
// is the part with actual rules in it — and a splash that overstays is the
// difference between a launch that feels crafted and one that feels slow.

// The two colours the platform launch images are painted with (read straight
// off Splash.imageset). The web animation continues from the native one, so a
// mismatch here shows up as a flash at the handoff — the single most obvious
// tell that a splash is fake.
export const SPLASH_BG = { light: '#FAFAF8', dark: '#0F1115' }

// Long enough for the brush stroke to read as drawn rather than blinked into
// existence, short enough that nobody waits on it. The whole thing is under a
// second and a half, and it plays over work the app is doing anyway (session
// and profile fetches), so it usually costs nothing at all.
const DRAW_MS = 850
const HOLD_MS = 220
const FADE_MS = 320

// Someone who has asked their phone to reduce motion should not be shown a
// drawing animation. They still get the mark — appearing, not performing — so
// the launch does not look broken compared to what everyone else describes.
const REDUCED_HOLD_MS = 240
const REDUCED_FADE_MS = 200

export function splashPlan({ native, reducedMotion } = {}) {
  // Web only ever gets this if someone installs the PWA, and the browser has
  // already shown its own loading affordance by then. On the web an intro
  // animation is just latency someone did not ask for.
  if (!native) return { show: false, drawMs: 0, holdMs: 0, fadeMs: 0 }
  if (reducedMotion) return { show: true, drawMs: 0, holdMs: REDUCED_HOLD_MS, fadeMs: REDUCED_FADE_MS }
  return { show: true, drawMs: DRAW_MS, holdMs: HOLD_MS, fadeMs: FADE_MS }
}

// When the fade should start, and when the overlay can leave the tree.
export function splashFadeAtMs(plan) {
  return plan.show ? plan.drawMs + plan.holdMs : 0
}

export function splashDoneAtMs(plan) {
  return plan.show ? plan.drawMs + plan.holdMs + plan.fadeMs : 0
}

export function prefersReducedMotion(win) {
  const w = win || (typeof window !== 'undefined' ? window : null)
  if (!w || typeof w.matchMedia !== 'function') return false
  try {
    return w.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
