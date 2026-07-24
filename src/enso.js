// Geometry for the ensō progress ring — the brand mark turned into a working
// instrument. The logo is a vermillion brush circle; Home draws that same
// circle and closes it as the day's queue is cleared.
//
// Pure functions only (no React), so the shapes are unit-testable and the
// component stays a thin renderer.

// A point on a circle. 0° is 12 o'clock and angles run clockwise, which is how
// a right-handed brush stroke actually travels.
export function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

// Brush width along the stroke: the brush lands with pressure, holds, then
// lifts into a thin tail. `t` runs 0 → 1 across the sweep.
export function taper(t) {
  const landing = Math.min(1, t / 0.06) // the press-down at the start
  const lift = 1 - 0.58 * Math.pow(t, 1.4) // the gradual lift toward the tail
  return Math.max(0.1, landing * lift)
}

// A hand-drawn circle is never perfectly round. A sub-pixel wobble is the
// difference between "brush stroke" and "SVG progress ring".
export function wobble(t, amount = 0.011) {
  return 1 + amount * Math.sin(t * Math.PI * 2 * 2.3 + 0.9)
}

// The ensō itself: a closed outline of a tapered band, walked out along the
// thick edge and back along the thin one. Returns an SVG path `d`.
export function brushRingPath({
  cx = 50, cy = 50, r = 38, width = 9,
  startDeg = -18, sweepDeg = 336, steps = 120,
} = {}) {
  const outer = []
  const inner = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const deg = startDeg + sweepDeg * t
    const w = (width * taper(t)) / 2
    const rr = r * wobble(t)
    outer.push(polar(cx, cy, rr + w, deg))
    inner.push(polar(cx, cy, rr - w, deg))
  }
  const fmt = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`
  const forward = outer.map((p, i) => (i === 0 ? `M ${fmt(p)}` : `L ${fmt(p)}`))
  const back = inner.reverse().map(p => `L ${fmt(p)}`)
  return [...forward, ...back, 'Z'].join(' ')
}

// Clamp to [0, 1] — a fraction is the ring's only input, so guard it here
// rather than at every call site.
export function clamp01(n) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

// How far through today the learner is: cards already cleared today over
// everything today asked of them. An empty day counts as complete — a learner
// with nothing due has finished, not failed.
export function dojoProgress({ done = 0, remaining = 0 } = {}) {
  const cleared = Math.max(0, done)
  const left = Math.max(0, remaining)
  const planned = cleared + left
  return { done: cleared, remaining: left, planned, pct: planned === 0 ? 1 : clamp01(cleared / planned) }
}
