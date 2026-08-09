// What a navigation should look like, decided by the model.
//
// The rule this file exists to enforce: motion is a property of the TRANSITION,
// not of the screen. A screen does not get to know how it arrived — it is the
// difference between the previous NavState and the next one that says whether
// something was pushed, popped, presented, dismissed, or whether the learner
// simply changed tab. One animation per navigation, on one element.
//
// Pure, so every rule below is tested in the fast node environment. The shell
// half — finding the element and calling Web Animations — is useNavMotion.js.
//
// ── Why only the ENTERING layer is animated ──────────────────────────────
//
// The layer being left is already gone by the time we could animate it: a tab
// root is put behind `display: none` by <Activity>, and a pushed screen is
// unmounted. Animating it out would mean keeping it alive and stacking the two
// layers, which turns every pushed screen into an absolutely-positioned
// scroller — a real layout change, on every screen, for a 240ms effect.
//
// The View Transitions API is the honest way to get the outgoing half (it
// snapshots the old DOM for you), and it is the natural fit here. It needs the
// DOM update to happen inside its callback, i.e. `flushSync`. That is safe on
// the forward path, which is always an event handler, but NOT on the way back:
// a POP arrives as a location change and is adopted in an effect, where
// flushSync warns and de-opts. Back and forward looking different is worse than
// both looking simple, so this ships enter-motion for both and the outgoing
// half is recorded as follow-up work rather than half-done.
//
// ── Why the tab panes never get a transform ──────────────────────────────
//
// A transform on an element makes it the containing block for `position: fixed`
// descendants. The story reader is the one root-side screen built out of fixed
// bars, so a transform on the Stories pane would re-anchor them mid-animation.
// The kinds that land on a pane (a tab change, a dismissal) are the two the
// spec asks to keep subtle anyway, so this costs nothing — and NO_TRANSFORM
// covers the transitional case where a `full` view is still rendered inside its
// root (navShell.INLINE_VIEWS).

import { visibleEntry } from './navStack'
import { overlayScreen } from './navShell'

// One curve. It is the same ease-out the rest of the app already moves on
// (.hd-press, .hd-rise), which is most of why a new transition reads as part of
// the app rather than as an effect bolted onto it.
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

// Distances are small on purpose: enough to say which direction the hierarchy
// went, not enough to make the learner wait for it. Durations are the budget a
// tap can absorb before it starts to feel like latency.
export const MOTION = {
  // A detail screen arrives from the direction it is filed in.
  push: { opacity: 0, transform: 'translate3d(18px, 0, 0)', duration: 240 },
  // Going back is the same move in reverse: the screen behind was to the left.
  pop: { opacity: 0, transform: 'translate3d(-14px, 0, 0)', duration: 220 },
  // A flow comes from outside the hierarchy, so it rises rather than slides —
  // deliberately unlike a push, because it is not one.
  present: { opacity: 0, transform: 'translate3d(0, 20px, 0)', duration: 280 },
  // Coming back out of a flow: the shell is where it always was. Nothing should
  // travel; it just returns.
  dismiss: { opacity: 0.55, transform: null, duration: 180 },
  // Tabs are peers. Sliding them like stack pages would claim an order between
  // them that does not exist, so this is a settle, not a move.
  tab: { opacity: 0.62, transform: null, duration: 150 },
}

// Views that must never be transformed by the shell — see the header note.
export const NO_TRANSFORM_VIEWS = ['reader']

// The difference between two NavStates, named.
export function transitionFor(prev, next) {
  if (!prev || !next || prev === next) return 'none'

  const hadOverlay = Boolean(prev.overlay)
  const hasOverlay = Boolean(next.overlay)

  if (!hadOverlay && hasOverlay) return 'present'
  if (hadOverlay && !hasOverlay) return 'dismiss'

  if (hadOverlay && hasOverlay) {
    const before = prev.overlay.stack.length
    const after = next.overlay.stack.length
    if (after > before) return 'push'
    if (after < before) return 'pop'
    // Same depth, different screen: one flow replaced by another. Treat it as a
    // fresh presentation rather than as movement within a stack that did not
    // move.
    const top = next.overlay.stack[after - 1]
    const was = prev.overlay.stack[before - 1]
    return top && was && top.view !== was.view ? 'present' : 'none'
  }

  if (prev.activeTab !== next.activeTab) return 'tab'

  const before = (prev.stacks[prev.activeTab] || []).length
  const after = (next.stacks[next.activeTab] || []).length
  if (after > before) return 'push'
  if (after < before) return 'pop'
  return 'none'
}

// Which element the transition happens on. Whatever just became visible: the
// overlay when one is on top, otherwise the tab root itself — including the
// transitional case where a root renders its own detail screen.
export function layerFor(state) {
  return overlayScreen(state) ? 'overlay' : 'tab'
}

export function selectorFor(state) {
  if (layerFor(state) === 'overlay') return '[data-nav-layer="overlay"]'
  return '[data-tab-root="' + state.activeTab + '"]'
}

// The whole decision, in one object the shell can hand to `Element.animate`.
// Null means "do not animate": nothing moved, or the learner asked for less
// motion. Reduced motion is answered with no animation at all rather than a
// shortened one — the CSS catch-all in index.css cannot neutralise a Web
// Animations animation, so this is the only place that check can live.
export function motionPlan(prev, next, { reducedMotion = false } = {}) {
  const kind = transitionFor(prev, next)
  if (kind === 'none') return null
  if (reducedMotion) return null

  const spec = MOTION[kind]
  if (!spec) return null

  const top = visibleEntry(next)
  const blocked = NO_TRANSFORM_VIEWS.indexOf(top && top.view) !== -1
  const transform = blocked ? null : spec.transform

  const from = { opacity: spec.opacity }
  const to = { opacity: 1 }
  if (transform) {
    from.transform = transform
    to.transform = 'translate3d(0, 0, 0)'
  }

  return {
    kind,
    layer: layerFor(next),
    selector: selectorFor(next),
    keyframes: [from, to],
    // `fill: 'none'` matters: the element must be left with its own styles when
    // the animation ends, not pinned to the last keyframe.
    options: { duration: spec.duration, easing: EASE, fill: 'none' },
  }
}
