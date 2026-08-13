// The opening of the red packet, as a spec rather than as a CSS file.
//
// P14-5E. The interaction is: tap → the packet lifts → the flap opens → the cards
// fan up out of it → the Study session takes the screen. This module is the
// timing and the geometry of that, as a pure function of elapsed milliseconds, so
// the lab, a future production implementation and a test all animate the SAME
// thing. Nothing here imports React or touches the DOM.
//
// ── The rules it encodes ──────────────────────────────────────────────────
//
//   · Satisfying but QUICK. 640ms end to end. Under ~450 the flap reads as a
//     glitch; over ~800 the learner is waiting for an animation to finish
//     before they can start work, which is the opposite of what Home is for.
//   · One gesture, four beats, overlapping. Lift, open, fan, hand off — each
//     starts before the one before it has finished, because a strictly
//     sequential chain of four is what makes a 640ms animation FEEL like two
//     seconds.
//   · Nothing bounces, nothing sparkles, nothing rains. The packet is a piece of
//     lacquered paper: it lifts, it opens, the cards come out.
//   · Reduced motion is not a shortened version of this. It is a different,
//     honest thing: a 120ms cross-fade with no rotation and no travel, because
//     the point of the setting is that objects do not fly around.
//
// The phases below are also the storyboard: rendering `packetFrame` at each
// phase boundary produces the keyframes a designer reviews.

export const OPEN_MS = 640
export const REDUCED_MS = 120

// Start and end are absolute ms within the one gesture, so the overlaps are
// visible at a glance rather than buried in four separate delays.
export const OPEN_PHASES = [
  { key: 'lift', label: 'Packet lifts', start: 0, end: 180 },
  { key: 'flap', label: 'Flap opens', start: 90, end: 400 },
  { key: 'fan', label: 'Cards fan up', start: 260, end: 560 },
  { key: 'handoff', label: 'Hands off to Study', start: 480, end: 640 },
]

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

// The one easing in the gesture: fast out of the gate, settled at the end. A
// spring or an overshoot would be the "bouncing" the brief rules out.
export function easeOut(t) {
  const x = clamp01(t)
  return 1 - Math.pow(1 - x, 3)
}

// How far through a named phase the gesture is at time `ms`, eased. 0 before it
// starts, 1 after it ends — so a caller can read every phase at every frame and
// never has to know the order.
export function phaseProgress(key, ms) {
  const phase = OPEN_PHASES.find(p => p.key === key)
  if (!phase) return 0
  const span = phase.end - phase.start
  if (span <= 0) return ms >= phase.end ? 1 : 0
  return easeOut((ms - phase.start) / span)
}

// The geometry of one frame. Everything a renderer needs and nothing about how
// it draws it: a lift in px, a flap angle in degrees, and one entry per card.
//
// `reduced` collapses the whole thing to opacity. The packet does not move, the
// flap does not turn and the cards do not travel — they are simply there, then
// the session is.
export function packetFrame(ms, { reduced = false, cards = 3 } = {}) {
  const duration = reduced ? REDUCED_MS : OPEN_MS
  const t = clamp01(ms / duration)
  if (reduced) {
    return {
      reduced: true, t, duration,
      lift: 0, flapAngle: 0, packetFade: 1 - t,
      cards: Array.from({ length: cards }, () => ({ rise: 0, tilt: 0, opacity: t })),
      handoff: t,
      done: ms >= duration,
    }
  }
  const lifted = phaseProgress('lift', ms)
  const opened = phaseProgress('flap', ms)
  const fanned = phaseProgress('fan', ms)
  const handoff = phaseProgress('handoff', ms)
  return {
    reduced: false, t, duration,
    // Small. The packet is on a page, not thrown in the air.
    // `|| 0` throughout: `-6 * 0` is negative zero, which renders identically and
    // compares unequal to 0, so it would quietly break any spec that pins the
    // resting frame.
    lift: -6 * lifted || 0,
    // Away from the viewer and up, hinged at its own top edge.
    flapAngle: -64 * opened || 0,
    packetFade: 1,
    // The middle card leads and rises furthest; the outer two trail it and lean
    // apart. A fan in which every card does the same thing is a stack sliding.
    cards: Array.from({ length: cards }, (unused, i) => {
      const middle = (cards - 1) / 2
      const offset = i - middle
      const lag = Math.abs(offset) * 0.12
      const p = easeOut(clamp01((fanned - lag) / (1 - lag || 1)))
      return {
        rise: -(26 - Math.abs(offset) * 5) * p || 0,
        tilt: offset * 9 * p || 0,
        opacity: clamp01(p * 2.2),
      }
    }),
    handoff,
    done: ms >= duration,
  }
}

// The frames a review looks at: the boundary of every phase, plus the end.
export function storyboardFrames() {
  const stops = [0]
  for (const p of OPEN_PHASES) {
    if (!stops.includes(p.start)) stops.push(p.start)
    if (!stops.includes(p.end)) stops.push(p.end)
  }
  return stops.sort((a, b) => a - b)
}
