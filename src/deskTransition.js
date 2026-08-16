// The Home → Study shared-object handoff.
//
// Home's desk card and Study's flashcard are the same learner object. When the
// desk is tapped, Home records where the card was on screen; Study, mounting
// with the prepared queue already in hand, plays a FLIP entrance from that
// rectangle to its own card's position — so the learner watches one card grow
// into the session, never a cut. The record is one-shot and short-lived: a
// stale rectangle (slow navigation, back-forward) must never animate.

const HANDOFF_MAX_AGE_MS = 800

let handoff = null

export function setDeskHandoff(rect, now = Date.now) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return
  handoff = { rect, at: now() }
}

export function takeDeskHandoff(now = Date.now) {
  if (!handoff) return null
  const { rect, at } = handoff
  handoff = null
  if (now() - at > HANDOFF_MAX_AGE_MS) return null
  return rect
}

// The inverted-transform start state for a FLIP from `from` to `to`
// (both DOMRect-likes). Applied with transform-origin: top left.
export function flipTransform(from, to) {
  if (!from || !to || !(to.width > 0) || !(to.height > 0)) return null
  return {
    x: from.left - to.left,
    y: from.top - to.top,
    sx: from.width / to.width,
    sy: from.height / to.height,
  }
}
