// Single source of truth for the app's name and wordmark styling, so every
// placement (sidebar, auth, onboarding) reads identically. The wordmark font is
// Poppins — a clean geometric sans that pairs with the ensō brush-circle logo.

export const BRAND_NAME = 'Hanzi Dojo'

export const BRAND_FONT = "'Poppins', 'Inter', sans-serif"

// (Retired) brush-script face — its Latin letterforms read thin and uneven for
// the "Hanzi Dojo" wordmark, so the hero moments now use the clean Poppins
// wordmark below. Kept exported for back-compat; no longer referenced.
export const BRAND_BRUSH_FONT = "'Nanum Brush Script', 'Poppins', cursive"

// The brand red from the ensō logo — used to tint the brush wordmark.
export const BRAND_INK = '#B83A24'

// Inline style for the small, chrome wordmark (sidebar). Clean geometric sans.
export function wordmarkStyle(fontSize = '18px') {
  return {
    fontFamily: BRAND_FONT,
    fontSize,
    fontWeight: 600,
    letterSpacing: '-0.4px',
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    lineHeight: 1.1,
  }
}

// Inline style for the large wordmark on hero screens (login / onboarding /
// landing). A clean, tightly-tracked Poppins bold — modern and legible, letting
// the red ensō logo carry the brand color rather than a hard-to-read script.
export function heroWordmarkStyle(fontSize = '44px') {
  return {
    fontFamily: BRAND_FONT,
    fontSize,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    lineHeight: 1.1,
  }
}
