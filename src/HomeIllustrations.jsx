// The Home illustration system.
//
// The hero wears its landscape (HeroLandscape): one continuous tonal
// cinnabar environment — calm mist bands across the full width, a moon-gate
// courtyard wall, mountains and bamboo gathered lower-right — generated once
// and committed via the art-fetch pipeline (data/manhua/home-hero.art.json
// carries its provenance). No celestial disc: the horizon band outside the
// card owns the sun and moon. The composition's own quiet upper-left is the
// text zone, so the UI reads as layered on an environment, not beside an
// image. Like cover art, it does not re-theme.
//
// The Then-read fallback family below stays code-drawn: flat desk objects on
// world-tinted grounds (storyArt.js), mixed via color-mix into existing
// surface colours so the dawn→dusk system stays the base.

import heroLandscape from './assets/home-hero-r2-2.webp'

const PAPER = '#FBF5E9'

function mix(tint, pct, into) {
  return 'color-mix(in srgb, ' + tint + ' ' + pct + '%, ' + into + ')'
}

// ── The hero's landscape ────────────────────────────────────────────────────
// Full-bleed across the panel; biased slightly low so the gate survives the
// wider desktop crop while the quiet upper field stays under the text at
// every aspect the hero takes. Decorative and inert.
export function HeroLandscape() {
  return (
    <img
      src={heroLandscape}
      alt=""
      aria-hidden="true"
      data-hero-art=""
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: '100% 62%',
        pointerEvents: 'none', userSelect: 'none',
      }}
    />
  )
}

// ── The Then-read fallback family ───────────────────────────────────────────
// A coverless story wears one of four desk objects — book, cards, teacup,
// folded paper — on a ground mixed from its world tint, with the same
// supporting arc. Which one is deterministic per story (storyArt.js).

function TileBook({ deep }) {
  return (
    <>
      <rect x="10" y="17" width="34" height="22" rx="3" fill={deep} />
      <path d="M13 20 Q20 16.5 27 19.5 V36 Q20 33 13 36 Z" fill={PAPER} />
      <path d="M41 20 Q34 16.5 27 19.5 V36 Q34 33 41 36 Z" fill={PAPER} opacity="0.88" />
    </>
  )
}

function TileCards({ deep }) {
  return (
    <>
      <rect x="15" y="17" width="26" height="18" rx="3" fill={deep} transform="rotate(-6 28 26)" />
      <rect x="14" y="20" width="26" height="18" rx="3" fill={PAPER} transform="rotate(4 27 29)" />
      <rect x="20" y="26" width="12" height="2.5" rx="1.25" fill="rgba(0,0,0,0.16)" transform="rotate(4 27 29)" />
    </>
  )
}

function TileTeacup({ deep }) {
  return (
    <>
      <ellipse cx="27" cy="38" rx="12" ry="2" fill="rgba(0,0,0,0.12)" />
      <path d="M17 26 H37 L34.5 36 Q27 40.5 19.5 36 Z" fill={PAPER} />
      <ellipse cx="27" cy="26" rx="10" ry="2.5" fill={deep} />
      <path d="M27 20 C24 16.5 30 14 27 10" fill="none" stroke={deep} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
    </>
  )
}

function TilePaper({ deep }) {
  return (
    <>
      <rect x="19" y="12" width="22" height="28" rx="3" fill={deep} transform="rotate(6 30 26)" />
      <rect x="16" y="14" width="22" height="28" rx="3" fill={PAPER} />
      <path d="M38 14 L38 23 L29 14 Z" fill={deep} />
      <rect x="21" y="30" width="12" height="2.5" rx="1.25" fill="rgba(0,0,0,0.14)" />
    </>
  )
}

const TILE_ART = { book: TileBook, cards: TileCards, teacup: TileTeacup, paper: TilePaper }

export function StoryFallbackTile({ tint, variant, style }) {
  const Art = TILE_ART[variant] || TileBook
  const deep = mix(tint, 72, 'var(--text)')
  return (
    <svg
      aria-hidden="true"
      data-story-tile={variant}
      viewBox="0 0 54 54"
      style={{ width: '54px', height: '54px', borderRadius: '12px', flexShrink: 0, display: 'block', ...style }}
    >
      <rect x="0" y="0" width="54" height="54" fill={mix(tint, 16, 'var(--surface-2)')} />
      <circle cx="46" cy="50" r="26" fill="none" stroke={mix(tint, 55, 'var(--surface-2)')} strokeWidth="1.5" opacity="0.6" />
      <Art deep={deep} />
    </svg>
  )
}
