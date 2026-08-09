// The drawn silhouette of a manhua balloon, generated in PIXEL SPACE.
//
// The first version drew one near-circular path in a 100×100 viewBox and
// stretched it over the content box with preserveAspectRatio="none". That
// looked right for a wide, one-line balloon — but an ellipse's edge pulls in
// fast near its top and bottom, and the pull-in scales with the box. As soon
// as pinyin scaffolding made a balloon tall (a brand-new learner gets a ruby
// row over every word), the rectangular text block's first line started OUTSIDE
// the drawn curve: on a 224×160 balloon the ellipse at the first line's height
// begins ~42px in, while the text began at the 20px padding.
//
// So the silhouette is now generated from the box's real pixel size:
//   · an irregular rounded shape whose corner radii are CAPPED in pixels, so a
//     taller balloon grows straighter sides instead of a wider curve — the
//     shape hugs its words at any content height;
//   · every wobble bulges OUTWARD from that base shape, never inward, so the
//     fixed paddings are a mathematical guarantee, not a hopeful margin;
//   · corner radii and bulges are jittered from a per-bubble seed, so no two
//     balloons on a page are the same shape — hand-lettered, not a UI card.
//
// Pure — no React, no DOM. ManhuaBubble measures its box and draws whatever
// this returns; every geometric decision is testable here.

// A corner may never curve further than this many pixels into the box. The
// fixed paddings below are derived from it (see contentFitsBalloon): with the
// content rect's corner at (padLeft, padTop) and a quarter-circle corner of
// radius r ≤ CORNER_MAX, the corner-fit inequality
//   (1 - padLeft/r)² + (1 - padTop/r)² ≤ 1
// holds for every radius up to the cap, so the text block always sits inside
// the drawn ink.
export const CORNER_MAX = 48

// The balloon's text paddings, in px: top / horizontal / bottom. These are the
// values the corner cap above was solved for — change either together and rerun
// the containment sweep in manhuaBalloon.test.js.
export const SPEECH_INSETS = { top: 13, right: 20, bottom: 15, left: 20 }
export const THOUGHT_INSETS = { top: 15, right: 22, bottom: 17, left: 22 }

export function balloonInsets(kind) {
  return kind === 'thought' ? THOUGHT_INSETS : SPEECH_INSETS
}

// The CSS padding shorthand for a balloon of this kind.
export function balloonPadding(kind) {
  const i = balloonInsets(kind)
  return i.top + 'px ' + i.right + 'px ' + i.bottom + 'px'
}

// Deterministic per-bubble randomness (mulberry32). A balloon must not change
// shape between renders, so the seed is the beat index — stable for the life
// of the episode.
function rng(seed) {
  let s = ((seed + 1) * 2654435761) >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Sample points clockwise along a rounded rectangle drawn 1px inside the box
// (the stroke is centred on the path). Corner arcs always get 3 segments —
// a chord across a whole quarter-circle would cut up to 0.3·r inside the true
// arc, which is exactly the corner the text block's own corner sits in.
function perimeterPoints(w, h, corners, step) {
  const x0 = 1
  const y0 = 1
  const x1 = w - 1
  const y1 = h - 1
  const [tl, tr, br, bl] = corners
  const pts = []

  const line = (ax, ay, bx, by) => {
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.round(len / step))
    for (let i = 0; i < n; i += 1) {
      pts.push({ x: ax + (bx - ax) * (i / n), y: ay + (by - ay) * (i / n) })
    }
  }
  // A quarter arc from angle a0 to a0+90°, centre (cx, cy), 3 segments,
  // excluding its final point (the next primitive starts there).
  const arc = (cx, cy, r, a0) => {
    for (let i = 0; i < 3; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 3)
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
  }

  line(x0 + tl, y0, x1 - tr, y0)
  arc(x1 - tr, y0 + tr, tr, -Math.PI / 2)
  line(x1, y0 + tr, x1, y1 - br)
  arc(x1 - br, y1 - br, br, 0)
  line(x1 - br, y1, x0 + bl, y1)
  arc(x0 + bl, y1 - bl, bl, Math.PI / 2)
  line(x0, y1 - bl, x0, y0 + tl)
  arc(x0 + tl, y0 + tl, tl, Math.PI)
  return pts
}

// The full geometry, exposed so the tests can assert the invariants the
// containment proof rests on (corner cap, outward-only bulges) instead of
// trying to intersect Bézier curves.
export function balloonGeometry(width, height, kind, seed) {
  const w = Math.max(48, width || 0)
  const h = Math.max(40, height || 0)
  const thought = kind === 'thought'
  const rand = rng((seed || 0) + (thought ? 977 : 131))
  const rMax = Math.min(CORNER_MAX, Math.min(w, h) / 2 - 1)
  const base = Math.min(rMax, Math.min(w, h) * 0.46)
  const corners = [0, 0, 0, 0].map(() => Math.min(rMax, base * (0.85 + 0.3 * rand())))
  // Thought clouds are a chain of small puffs; speech is one taut skin with a
  // gentle hand-drawn waver.
  const step = thought ? 30 : 58
  const bumpLow = thought ? 5.5 : 1.6
  const bumpHigh = thought ? 9 : 3.4
  const points = perimeterPoints(w, h, corners, step)
  const bumps = points.map(() => bumpLow + (bumpHigh - bumpLow) * rand())
  return { w, h, corners, points, bumps, thought }
}

const f = (n) => Math.round(n * 10) / 10

// The SVG path. Each perimeter segment becomes one cubic curve whose control
// points sit OUTSIDE the segment (along its outward normal), so the ink can
// puff and waver without ever crossing into the padded text rect.
export function balloonPath(width, height, kind, seed) {
  const g = balloonGeometry(width, height, kind, seed)
  const pts = g.points
  const n = pts.length
  // Thought puffs turn harder at the joins; speech stays smooth.
  const t1 = g.thought ? 0.25 : 0.36
  const t2 = 1 - t1
  let d = 'M' + f(pts[0].x) + ' ' + f(pts[0].y)
  for (let i = 0; i < n; i += 1) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    const dx = q.x - p.x
    const dy = q.y - p.y
    const len = Math.hypot(dx, dy) || 1
    // Outward normal for a clockwise walk (SVG y grows downward).
    const nx = dy / len
    const ny = -dx / len
    const b = g.bumps[i]
    d += 'C' + f(p.x + dx * t1 + nx * b) + ' ' + f(p.y + dy * t1 + ny * b)
      + ' ' + f(p.x + dx * t2 + nx * b) + ' ' + f(p.y + dy * t2 + ny * b)
      + ' ' + f(q.x) + ' ' + f(q.y)
  }
  return d + 'Z'
}

// Does the padded content rect sit fully inside the balloon's base silhouette?
// Exact for the rounded rectangle (the bulges only ever add ink outside it, so
// this is conservative). The 1px allowances are the stroke's inner half.
export function contentFitsBalloon(width, height, kind, seed) {
  const g = balloonGeometry(width, height, kind, seed)
  const insets = balloonInsets(kind)
  const rect = {
    left: insets.left,
    top: insets.top,
    right: g.w - insets.right,
    bottom: g.h - insets.bottom,
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) return false
  const x0 = 1
  const y0 = 1
  const x1 = g.w - 1
  const y1 = g.h - 1
  if (rect.left < x0 || rect.top < y0 || rect.right > x1 || rect.bottom > y1) return false
  const [tl, tr, br, bl] = g.corners
  // u/v: how far the rect corner sits inside the arc's quadrant box, measured
  // toward the box corner. Outside the box (≤ 0) the straight edges govern and
  // the earlier bounds check already passed; inside it, the corner arc does.
  const insideCorner = (r, u, v) => {
    if (u <= 0 || v <= 0) return true
    return u * u + v * v <= (r - 1) * (r - 1)
  }
  return insideCorner(tl, (x0 + tl) - rect.left, (y0 + tl) - rect.top)
    && insideCorner(tr, rect.right - (x1 - tr), (y0 + tr) - rect.top)
    && insideCorner(br, rect.right - (x1 - br), rect.bottom - (y1 - br))
    && insideCorner(bl, (x0 + bl) - rect.left, rect.bottom - (y1 - bl))
}
