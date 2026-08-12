// Radius and elevation — P14-0, docs/P13-VISUAL-DIRECTION-AUDIT.md §8.
//
// The census found 16 distinct radii painted on surfaces (3, 8, 9, 10, 11, 12,
// 13, 14, 15, 16, 18, 20, 22, 26, 50, 999) and 13 distinct shadow declarations
// where the tokens define two. Neither number is a design decision; both are
// what happens when each component picks for itself.
//
// Five radii, four surface levels, three shadows.
//
// P14-0 defines them. The sweep that applies them is P14-2.

// ── Radius ──────────────────────────────────────────────────────────────────
// The pairs that matter: `hero` (26) and `control` (12) are the study card and
// its grade buttons, which is the one relationship in the app that is already
// right — the scale is built outward from it rather than over it.
export const RADIUS = {
  sm: 8,        // chips, badges, small tints, inline marks
  control: 12,  // buttons, inputs, icon shells, segmented thumbs
  card: 18,     // cards, rows-as-objects, sheet top corners
  hero: 26,     // the hero panel, the study card, modal cards
  pill: 999,    // pills, avatars, progress tracks
}

export const RADIUS_NAMES = Object.keys(RADIUS)

// `px` for the inline style props that want a string.
export function radius(name) {
  const r = RADIUS[name]
  return r === undefined ? null : (r === 999 ? '999px' : r + 'px')
}

// ── Elevation ───────────────────────────────────────────────────────────────
// Three, and each one answers a different question.
//
//   flat      the answer is "none". Named so that "no shadow" is a decision
//             somebody made rather than an omission.
//   raised    one conceptual object resting on the page. --shadow-1.
//   floating  a thing above the page that the page can see under: sheets,
//             popovers, the nav tray, modals. --shadow-2.
//
// Both real values stay in CSS custom properties because they differ per theme
// (dark needs far more opacity to read at all). This module names them; it does
// not redefine them.
export const ELEVATION = {
  flat: 'none',
  raised: 'var(--shadow-1)',
  floating: 'var(--shadow-2)',
}

export const ELEVATION_NAMES = Object.keys(ELEVATION)

// ── Surface levels ──────────────────────────────────────────────────────────
// The rule this encodes, which is the one P10 arrived at and P13 restated:
//
//   A bounded surface should represent ONE meaningful object or ONE coherent
//   interaction. Otherwise use spacing, a heading and a divider.
//
// `page` is the default and most content should sit on it. `grouped` is for a
// run of related rows sharing a ground with no border — the alternative to
// giving each row its own box. `raised` is the only level that draws a border
// AND a shadow, and it is the one that makes the "this is one object" promise.
export const SURFACE = {
  page: {
    background: 'var(--bg)',
  },
  grouped: {
    background: 'var(--surface-2)',
  },
  raised: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: ELEVATION.raised,
  },
  floating: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: ELEVATION.floating,
  },
}

export const SURFACE_NAMES = Object.keys(SURFACE)

// A surface at a named level and radius, as one style object.
//   <div style={{ ...surface('raised', 'card'), padding: '16px' }}>
export function surface(level = 'raised', radiusName = 'card') {
  const base = SURFACE[level]
  if (!base) return null
  const r = radius(radiusName)
  return r ? { ...base, borderRadius: r } : { ...base }
}
