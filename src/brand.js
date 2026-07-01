// Single source of truth for the app's name and wordmark styling, so every
// placement (sidebar, auth, onboarding) reads identically. The wordmark font is
// Poppins — a clean geometric sans that pairs with the ensō brush-circle logo.

export const BRAND_NAME = 'Hanzi Dojo'

export const BRAND_FONT = "'Poppins', 'Inter', sans-serif"

// Inline style for the wordmark text. Pass a fontSize to scale it.
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
