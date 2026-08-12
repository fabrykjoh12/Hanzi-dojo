// The semantic colour palette — P14-0, the "Lacquer" direction approved in
// docs/P13-VISUAL-DIRECTION-AUDIT.md §4.
//
// ── What this file is for ────────────────────────────────────────────────────
// Neutrals live in index.css as CSS custom properties, because they have to
// change with the theme and CSS is what does that. ACCENTS live here, because
// they are used in three ways a CSS variable cannot serve:
//
//   1. inside `color-mix(in srgb, <accent> 11%, var(--surface))` — the tint rule
//      (CLAUDE.md §5), which needs a real colour, not a var reference, in the
//      places where the mix is built by string concatenation;
//   2. as an argument to ink() / heroGround() / heroShadow(), which are JS;
//   3. as a raw hex on white-on-accent text, where the whole point is that it
//      does NOT theme.
//
// ── The hierarchy, stated once ──────────────────────────────────────────────
// Vermilion is the brand. Gold is the reward. Plum is the story. Blue is the
// practice. Coral is the energy. Everything else is paper and ink.
//
// Each supporting hue has ONE job, listed on its own line below. Two rules keep
// the brand red, and they are the difference between "a red app with accents"
// and "a rainbow":
//
//   · Only `primary` may fill a button. Plum and blue are atmosphere, icon
//     faces and marks — never an action. The moment a Stories CTA is plum, the
//     brand stops being red.
//   · Gold means reward and nothing else. Not "highlight", not "premium", not
//     "warning" — reward. Warning has its own token.
//
// ── What this file is NOT ───────────────────────────────────────────────────
// It is not the per-language accent. `languageTheme.js` still owns that, and
// Chinese still resolves to #B83A24 — the same value `primary` carries here.
// They agree today by construction (see the test), and they are separate
// concepts: `primary` is "the brand's interactive colour", `accentHex` is "this
// language's identity". A future language changes the second, never the first.
//
// P14-0 defines these. Applying them to screens is P14-5 onward.

// ── The vermilion family ────────────────────────────────────────────────────
// The anchor is unchanged: #B83A24 is the colour in the app icon, the wordmark
// and every hero since the product had one.
//
// `dark` is LIFTED, not darkened. #B83A24 on the dark ground measures about
// 3.1:1 — it fails AA for text and reads muddy as a fill. #E4573A reaches about
// 5.4:1 on #100D0E. This is the same correction --ink-lift-pct already applies
// at runtime; having it as an explicit value means a dimensional icon's tones
// can be authored rather than derived.
export const VERMILION = {
  base: '#B83A24',
  bright: '#D84B32',        // hover/emphasis, gradient top stop, icon top facet
  pressed: '#8F2D1D',
  soft: '#F7E8E3',          // selected ground, tint base (light)
  burgundy: '#5E2430',      // depth: hero shadow, dark-mode ground cast
  dark: '#E4573A',          // the same brand, lifted for the dark ground
  darkBright: '#F06A4C',
  darkPressed: '#C0432C',
  darkSoft: 'rgba(228, 87, 58, 0.15)',
  darkBurgundy: '#3A1620',
}

// ── Supporting hues, one job each ───────────────────────────────────────────
export const GOLD = {
  // Reward, mastery, level unlock, celebration. Nothing else.
  base: '#C08A2E',
  bright: '#D6A13A',        // gradient top stop, reward highlight
  dark: '#E3B24E',
  darkBright: '#F5C868',
}

export const PLUM = {
  // Stories: heading atmosphere, per-series accents, story icon faces.
  // Never an action.
  base: '#7651A8',
  dark: '#A585D8',
}

export const BLUE = {
  // Practice, Listening, utility learning interactions. Never an action.
  base: '#4777B8',
  dark: '#6D9BE8',
}

export const CORAL = {
  // Secondary energetic highlight, selected dimensional icon faces,
  // occasional emphasis. The one hue with a deliberately loose brief — which
  // is why it is last and why it takes no structural job at all.
  base: '#E8664A',
  dark: '#FF7F63',
}

// ── Status ──────────────────────────────────────────────────────────────────
// Unchanged values, named. `success` has 72 uses in src/ today and `error` 57;
// re-picking them would be a change with no argument behind it.
export const STATUS = {
  success: '#2F9E6D',
  successDark: '#34D399',
  warning: '#D97706',       // weak-word counts, attention — NOT reward
  warningDark: '#F0A93B',
  error: '#DC2626',
  errorDark: '#F87171',
  locked: '#A8A29E',        // genuinely desaturated, never a low-opacity accent
  lockedDark: '#4A524E',
}

// ── Resolving a role for the current theme ──────────────────────────────────
// One function rather than one ternary per call site. `dark` is a boolean the
// caller already has (useTheme / the profile's theme), so this stays pure and
// testable and reaches for nothing.
//
// Roles are the names the rest of the app should use. A screen asking for
// `role('primary', dark)` cannot accidentally get plum.
const ROLES = {
  primary: [VERMILION.base, VERMILION.dark],
  'primary-bright': [VERMILION.bright, VERMILION.darkBright],
  'primary-pressed': [VERMILION.pressed, VERMILION.darkPressed],
  'primary-soft': [VERMILION.soft, VERMILION.darkSoft],
  burgundy: [VERMILION.burgundy, VERMILION.darkBurgundy],
  gold: [GOLD.base, GOLD.dark],
  'gold-bright': [GOLD.bright, GOLD.darkBright],
  plum: [PLUM.base, PLUM.dark],
  blue: [BLUE.base, BLUE.dark],
  coral: [CORAL.base, CORAL.dark],
  success: [STATUS.success, STATUS.successDark],
  warning: [STATUS.warning, STATUS.warningDark],
  error: [STATUS.error, STATUS.errorDark],
  locked: [STATUS.locked, STATUS.lockedDark],
}

export const ROLE_NAMES = Object.keys(ROLES)

export function role(name, dark = false) {
  const pair = ROLES[name]
  if (!pair) return null
  return dark ? pair[1] : pair[0]
}

// Which roles may fill a button. Exported so the check is a value a test can
// assert against rather than a sentence in a comment.
export const ACTION_ROLES = ['primary', 'primary-bright', 'primary-pressed', 'error']

export function canFillButton(name) {
  return ACTION_ROLES.indexOf(name) !== -1
}
