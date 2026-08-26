// Single source of truth for the app's name and wordmark styling, so every
// placement (sidebar, auth, onboarding) reads identically. The wordmark font is
// Poppins — a clean geometric sans that pairs with the ensō brush-circle logo.

export const BRAND_NAME = 'Hanzi Dojo'

// The canonical public origin. Used for share links and absolute social-preview
// URLs so nothing points users at the raw GitHub Pages host. Auth redirects use
// the live origin (window.location.origin) instead, so dev/preview still work.
export const BRAND_URL = 'https://hanzi-dojo.com'

export const BRAND_FONT = "'Poppins', 'Inter', sans-serif"

// (Retired) brush-script face — its Latin letterforms read thin and uneven for
// the "Hanzi Dojo" wordmark, so the hero moments now use the clean Poppins
// wordmark below. Kept exported for back-compat; no longer referenced.
export const BRAND_BRUSH_FONT = "'Nanum Brush Script', 'Poppins', cursive"

// The brand red from the ensō logo — used to tint the brush wordmark.
export const BRAND_INK = '#B83A24'

// The support inbox. One constant so the trust pages, store listings and any
// future in-app mention can never drift apart on the address.
export const SUPPORT_EMAIL = 'support@hanzi-dojo.com'

// ── The data controller (GDPR Article 13) ────────────────────────────────────
//
// Hanzi Dojo is operated by a natural person, not a company: there is no AS and
// no enkeltpersonforetak. The controller is therefore that person, and the
// privacy notice names them.
//
// CONTROLLER_NAME is the owner's full legal name, confirmed 2026-08-26. It is
// rendered by the privacy notice and is the single source for the controller's
// identity, so anything else that has to name the controller later — App Store
// Connect, Play Console — reads it from here rather than repeating a literal.
// (The notice degrades gracefully if it is ever blanked: it then says the app is
// run by an individual based in Norway, which is true but less specific.)
//
// No postal address is published, and none is required: GDPR Art. 13(1)(a) asks
// for "the identity and the contact details of the controller" without
// specifying a street address, and SUPPORT_EMAIL is a real, monitored channel.
// (The EDPB transparency guidance that mentions a postal address is about the
// DPO's contact details, and Hanzi Dojo has no Art. 37 duty to appoint one.)
// The App Store's DSA trader disclosure is a separate matter — see
// docs/PRIVACY-AUDIT.md — and is handled in App Store Connect, not here.
export const CONTROLLER_NAME = 'Fabian Rykkelid Johnsen'
export const CONTROLLER_COUNTRY = 'Norway'

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
