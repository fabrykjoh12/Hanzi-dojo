// The opening of the red packet, as a spec rather than as a CSS file.
//
// P14-5E round 3. The interaction is: tap → the packet compresses and lifts →
// its cavity opens → two cards rise out of it on staggered timing → they fan →
// the Study session takes the screen. This module is the timing and the geometry
// of that, as a pure function of elapsed milliseconds, so the lab, a future
// production implementation and a test all animate the SAME thing. Nothing here
// imports React or touches the DOM.
//
// ── The rules it encodes ──────────────────────────────────────────────────
//
//   · Satisfying but QUICK. 650ms end to end. Under ~450 the opening reads as a
//     glitch; over ~800 the learner is waiting for an animation to finish before
//     they can start work, which is the opposite of what Home is for.
//   · Five beats, overlapping. A strictly sequential chain is what makes a 650ms
//     animation FEEL like two seconds, so each beat starts at or before the end
//     of the one before it and there is never dead air.
//   · The first beat is a PRESS, not a jump. The object compresses slightly and
//     recovers inside 120ms — the same physical idea as the lacquer button's
//     pressed state — and only then leaves the page.
//   · Nothing bounces, nothing sparkles, nothing rains.
//   · Reduced motion is not a shortened version of this. It is a different,
//     honest thing: a 120ms cross-fade with no rotation and no travel, because
//     the point of the setting is that objects do not fly around.
//
// The phases below are also the storyboard: rendering `packetFrame` at each
// phase boundary produces the keyframes a designer reviews.

export const OPEN_MS = 650
export const REDUCED_MS = 120

// Start and end are absolute ms within the one gesture, so the overlaps are
// visible at a glance rather than buried in five separate delays.
export const OPEN_PHASES = [
  { key: 'press', label: 'Compress and lift', start: 0, end: 120 },
  { key: 'open', label: 'Cavity opens', start: 120, end: 280 },
  { key: 'rise', label: 'Cards rise', start: 230, end: 430 },
  { key: 'fan', label: 'Cards fan', start: 350, end: 520 },
  { key: 'handoff', label: 'Into Study', start: 520, end: 650 },
]

// How far each card travels and how far it leans, per card index. Asymmetric on
// purpose: two cards that rise the same distance at the same angle are one card
// drawn twice.
const RISE = [19, 24]
const LEAN = [-7.5, 5]
const LAG = [0, 0.18]

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

// The one easing in the gesture: fast out of the gate, settled at the end. A
// spring or an overshoot would be the "bouncing" the brief rules out.
export function easeOut(t) {
  const x = clamp01(t)
  return 1 - Math.pow(1 - x, 3)
}

// Raw position inside a phase, 0 before it starts and 1 after it ends. Separate
// from the eased version because a beat that has to go out AND come back — the
// press — needs the linear parameter, and easing something twice is how a
// timing curve quietly becomes a different curve.
export function phaseLinear(key, ms) {
  const phase = OPEN_PHASES.find(p => p.key === key)
  if (!phase) return 0
  const span = phase.end - phase.start
  if (span <= 0) return ms >= phase.end ? 1 : 0
  return clamp01((ms - phase.start) / span)
}

export function phaseProgress(key, ms) {
  return easeOut(phaseLinear(key, ms))
}

// The geometry of one frame. Everything a renderer needs and nothing about how
// it draws it.
export function packetFrame(ms, { reduced = false, cards = 2 } = {}) {
  const duration = reduced ? REDUCED_MS : OPEN_MS
  const t = clamp01(ms / duration)
  if (reduced) {
    return {
      reduced: true, t, duration,
      lift: 0, compress: 0, open: 0, packetFade: 1 - t,
      cards: Array.from({ length: cards }, () => ({ rise: 0, tilt: 0, opacity: 1 })),
      handoff: t,
      done: ms >= duration,
    }
  }
  const pressLin = phaseLinear('press', ms)
  const riseLin = phaseLinear('rise', ms)
  const fanLin = phaseLinear('fan', ms)
  return {
    reduced: false, t, duration,
    // Small. The packet is on a page, not thrown in the air.
    // `|| 0` throughout: `-6 * 0` is negative zero, which renders identically
    // and compares unequal to 0, so it would quietly break any spec that pins
    // the resting frame.
    lift: -6 * easeOut(pressLin) || 0,
    // Out and back inside the press: nothing is compressed at either end of it.
    compress: Math.sin(Math.PI * pressLin),
    open: phaseProgress('open', ms),
    packetFade: 1,
    cards: Array.from({ length: cards }, (unused, i) => {
      const lag = LAG[i % LAG.length]
      const p = easeOut(clamp01((riseLin - lag) / (1 - lag)))
      const f = easeOut(clamp01((fanLin - lag * 0.6) / (1 - lag * 0.6)))
      return {
        rise: -(RISE[i % RISE.length]) * p || 0,
        tilt: LEAN[i % LEAN.length] * f || 0,
        opacity: 1,
      }
    }),
    handoff: phaseProgress('handoff', ms),
    done: ms >= duration,
  }
}

// The frames a review looks at: the boundary of every phase, plus the end — and
// the middle of the press, which is the one beat whose extreme is not at a
// boundary. A storyboard of boundaries alone shows the compression at 0 both
// times and reads as if it never happens.
export function storyboardFrames() {
  const press = OPEN_PHASES[0]
  const stops = [0, Math.round((press.start + press.end) / 2)]
  for (const p of OPEN_PHASES) {
    if (!stops.includes(p.start)) stops.push(p.start)
    if (!stops.includes(p.end)) stops.push(p.end)
  }
  return stops.sort((a, b) => a - b)
}
