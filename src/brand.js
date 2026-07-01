// Single source of truth for the app's name and wordmark styling, so every
// placement (sidebar, auth, onboarding) reads identically. The wordmark font is
// Poppins — a clean geometric sans that pairs with the ensō brush-circle logo.

export const BRAND_NAME = 'Hanzi Dojo'

export const BRAND_FONT = "'Poppins', 'Inter', sans-serif"

// Brush-script face for the big brand moments (login / onboarding hero). Evokes
// the ensō brush-circle logo. Kept off the small sidebar chrome where a clean
// sans stays more legible.
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

// Inline style for the large brush wordmark on hero screens.
export function heroWordmarkStyle(fontSize = '44px') {
  return {
    fontFamily: BRAND_BRUSH_FONT,
    fontSize,
    fontWeight: 400,
    color: BRAND_INK,
    whiteSpace: 'nowrap',
    lineHeight: 1.05,
  }
}
