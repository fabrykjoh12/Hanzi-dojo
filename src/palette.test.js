import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  VERMILION, GOLD, PLUM, BLUE, CORAL, STATUS,
  role, ROLE_NAMES, ACTION_ROLES, canFillButton,
} from './palette'
import { languageTheme } from './languageTheme'

// The palette, and the two things about it that are easy to get wrong: contrast,
// and scope creep.
//
// Every value here is a candidate until it has been measured. Revision 1 of the
// P13 doc proposed --text-muted #847C72 and --text-faint #A9A198; both FAIL AA
// on the light ground (3.88:1 and 2.40:1) and would have shipped unreadable
// metadata across the whole app. These specs are why that did not happen.

// ── sRGB relative luminance and WCAG contrast, from the spec ────────────────
function channel(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function luminance(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// The grounds the tokens are measured against — read from index.css rather than
// duplicated here, so a token edit cannot silently invalidate these specs.
// Comments are stripped FIRST. The prose in index.css cites token names with
// their colons ("AA on --bg: 16.64 / …"), which a naive matcher happily reads as
// a declaration — it did, and it returned a sentence instead of a hex.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
function cssVar(name, dark) {
  // Everything before the dark block is light; from it onward is dark. Later
  // declarations win in CSS, so read the last one in scope.
  const darkAt = css.indexOf(':root[data-theme="dark"]')
  const scope = dark ? css.slice(darkAt) : css.slice(0, darkAt)
  const hits = [...scope.matchAll(new RegExp('--' + name + ':\\s*([^;]+);', 'g'))]
  return hits.length ? hits[hits.length - 1][1].trim() : null
}

const LIGHT_BG = cssVar('bg', false)
const DARK_BG = cssVar('bg', true)

describe('the grounds', () => {
  it('are the Lacquer values — warm paper and a warm near-black', () => {
    expect(LIGHT_BG).toBe('#FAF8F5')
    expect(DARK_BG).toBe('#100D0E')
  })

  it('the dark ground is warmer than it is cool — a lacquer box, not a dashboard', () => {
    // The old ground was #0F1115: blue-leaning (B > R). The new one leans red.
    const h = DARK_BG.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const b = parseInt(h.slice(4, 6), 16)
    expect(r).toBeGreaterThan(b)
  })
})

// ── The text ramp: monotonic, and every step readable ON EVERY GROUND ───────
describe('the text ramp', () => {
  const NAMES = ['text', 'text-secondary', 'text-muted', 'text-faint']
  // A ramp is only as good as its WORST ground. The first version of these specs
  // measured against --bg alone and passed; the contrast-legibility e2e then
  // found --text-faint at 4.36:1 on --surface-2 and 3.88:1 on --surface-3, which
  // is where eyebrows and the recap's Today/Tomorrow actually sit. Panels are
  // where the faint tokens live, so panels are what has to be measured.
  const GROUNDS = ['bg', 'surface', 'surface-2', 'surface-3']

  for (const [label, dark] of [['light', false], ['dark', true]]) {
    for (const ground of GROUNDS) {
      it('is monotonic in ' + label + ' on --' + ground + ' — faint really is the faintest', () => {
        // The bug this replaces: --text-faint (#6B6B72, 5.06:1) was DARKER than
        // --text-muted (#71717A, 4.62:1) in light, and the same inversion
        // existed in dark. The token named "faint" carried MORE emphasis than
        // the one named "muted", so the name lied and anyone reaching for
        // de-emphasis got the opposite.
        //
        // Checked per-ground rather than once, because the fix for the AA
        // failure above was to lift the two lowest steps — and lifting only
        // `faint` would have made it overtake `muted` and re-invert the ramp.
        const g = cssVar(ground, dark)
        const ratios = NAMES.map(n => contrast(cssVar(n, dark), g))
        for (let i = 1; i < ratios.length; i += 1) {
          expect(ratios[i], NAMES[i] + ' (' + ratios[i].toFixed(2) + ') vs ' + NAMES[i - 1] + ' (' + ratios[i - 1].toFixed(2) + ')')
            .toBeLessThan(ratios[i - 1])
        }
      })

      it('passes AA at every step in ' + label + ' on --' + ground, () => {
        const g = cssVar(ground, dark)
        for (const n of NAMES) {
          const c = contrast(cssVar(n, dark), g)
          expect(c, n + ' = ' + cssVar(n, dark) + ' on --' + ground + ' → ' + c.toFixed(2) + ':1')
            .toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

// ── The brand, in both themes ──────────────────────────────────────────────
describe('vermilion', () => {
  it('keeps #B83A24 as the anchor — the icon, the wordmark and every hero', () => {
    expect(VERMILION.base).toBe('#B83A24')
    expect(role('primary', false)).toBe('#B83A24')
  })

  it('agrees with the Chinese language accent', () => {
    // Two separate concepts that happen to share a value: `primary` is the
    // brand's interactive colour, `accentHex` is this language's identity. A new
    // language changes the second and never the first — but while Chinese is
    // the product, a disagreement here would mean two reds on one screen.
    expect(languageTheme('chinese').accentHex).toBe(VERMILION.base)
  })

  it('is LIFTED for dark, not darkened', () => {
    expect(luminance(VERMILION.dark)).toBeGreaterThan(luminance(VERMILION.base))
  })

  it('fixes a real contrast failure in dark mode', () => {
    // The whole reason the dark value is not the base value.
    expect(contrast(VERMILION.base, DARK_BG)).toBeLessThan(4.5)
    expect(contrast(VERMILION.dark, DARK_BG)).toBeGreaterThanOrEqual(4.5)
  })

  it('reads as text on the light ground too', () => {
    expect(contrast(VERMILION.base, LIGHT_BG)).toBeGreaterThanOrEqual(4.5)
  })
})

// ── Supporting hues ────────────────────────────────────────────────────────
describe('the supporting hues', () => {
  it('all lift for dark rather than darkening', () => {
    for (const [name, pair] of [
      ['gold', [GOLD.base, GOLD.dark]],
      ['plum', [PLUM.base, PLUM.dark]],
      ['blue', [BLUE.base, BLUE.dark]],
      ['coral', [CORAL.base, CORAL.dark]],
      ['success', [STATUS.success, STATUS.successDark]],
      ['warning', [STATUS.warning, STATUS.warningDark]],
      ['error', [STATUS.error, STATUS.errorDark]],
    ]) {
      expect(luminance(pair[1]), name + ' dark is not lifted').toBeGreaterThan(luminance(pair[0]))
    }
  })

  it('are all readable on the dark ground', () => {
    for (const h of [VERMILION.dark, GOLD.dark, PLUM.dark, BLUE.dark, STATUS.successDark, STATUS.warningDark, STATUS.errorDark]) {
      expect(contrast(h, DARK_BG), h).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('records which light values are NOT safe as small text', () => {
    // Gold is 2.86:1 on the light ground. That is not a defect — gold is a
    // reward OBJECT colour (fills, rings, marks), and this spec exists so
    // nobody discovers it by shipping a gold caption. Anything below 3:1 here
    // must never carry light-mode body text.
    expect(contrast(GOLD.base, LIGHT_BG)).toBeLessThan(3)
    // These three are fine at large sizes but not for body copy.
    for (const h of [BLUE.base, STATUS.success, STATUS.warning]) {
      const c = contrast(h, LIGHT_BG)
      expect(c).toBeGreaterThanOrEqual(3)
      expect(c).toBeLessThan(4.5)
    }
    // And these two are safe anywhere.
    for (const h of [VERMILION.base, PLUM.base, STATUS.error]) {
      expect(contrast(h, LIGHT_BG)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps locked genuinely desaturated rather than a faded accent', () => {
    for (const h of [STATUS.locked, STATUS.lockedDark]) {
      const x = h.replace('#', '')
      const r = parseInt(x.slice(0, 2), 16)
      const g = parseInt(x.slice(2, 4), 16)
      const b = parseInt(x.slice(4, 6), 16)
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      expect(spread, h + ' is too colourful for a locked state').toBeLessThan(24)
    }
  })
})

// ── Scope: only the brand may act ──────────────────────────────────────────
describe('role scope', () => {
  it('resolves every named role in both themes', () => {
    for (const name of ROLE_NAMES) {
      expect(role(name, false), name).toMatch(/^(#|rgba)/)
      expect(role(name, true), name).toMatch(/^(#|rgba)/)
    }
  })

  it('returns null for a name it does not know, rather than guessing', () => {
    for (const bad of ['jade', 'sage', 'primary2', '', null, undefined]) {
      expect(role(bad)).toBe(null)
    }
  })

  it('lets only the brand and destructive fill a button', () => {
    // The rule that keeps the app red: the moment a Stories CTA is plum, the
    // brand stops being the brand. Atmosphere and icon faces, never actions.
    expect(ACTION_ROLES).toEqual(['primary', 'primary-bright', 'primary-pressed', 'error'])
    for (const name of ['plum', 'blue', 'gold', 'coral', 'success', 'warning', 'locked']) {
      expect(canFillButton(name), name + ' must not fill a button').toBe(false)
    }
    for (const name of ACTION_ROLES) expect(canFillButton(name)).toBe(true)
  })

  it('has no jade and no sage anywhere in it', () => {
    const src = readFileSync(new URL('./palette.js', import.meta.url), 'utf8')
    for (const gone of ['6E8466', '5C7155', 'A8B5A1', '0E7A63', '2CC49A']) {
      expect(src, gone + ' is back').not.toContain(gone)
    }
  })
})

// ── The warm accent lift (P14-5C) ──────────────────────────────────────────
describe('inkWarm — an accent that stays red in the dark', () => {
  // Home leads with accent marks on the page ground: the step eyebrow at 10.5px,
  // the secondary action, the ticks, the level rail. `ink` (30% toward white)
  // fails AA there, and `inkStrong` (40% toward white) clears AA by turning the
  // brand red into salmon — which the P14-5C brief rules out by name. The warm
  // lift has to do both: keep the hue, clear the bar.
  const CHINESE = '#B83A24'

  function mix(a, b, pct) {
    const p = pct / 100;
    const ch = (h, i) => parseInt(h.replace('#', '').slice(i * 2, i * 2 + 2), 16)
    const out = [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * p))
    return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('')
  }

  it('is a no-op in light mode — the light theme must not move', () => {
    expect(cssVar('ink-warm-pct', false)).toBe('0%')
  })

  it('clears AA for small text on every dark ground it is used on', () => {
    const pct = parseFloat(cssVar('ink-warm-pct', true))
    // `--ink-warm` is declared once, in the light block, and cascades into dark
    // — only the percentage is themed. Reading it from the dark scope returns
    // null, which is how this test first failed.
    const lifted = mix(CHINESE, cssVar('ink-warm', false), pct)
    for (const ground of ['bg', 'surface']) {
      const ratio = contrast(lifted, cssVar(ground, true))
      expect(ratio, 'inkWarm on --' + ground + ' is ' + ratio.toFixed(2)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('stays a RED — the failure mode it exists to prevent is pink', () => {
    const warm = mix(CHINESE, cssVar('ink-warm', false), parseFloat(cssVar('ink-warm-pct', true)))
    const white = mix(CHINESE, '#FFFFFF', parseFloat(cssVar('ink-strong-pct', true)))
    const sat = (hex) => {
      const [r, g, b] = [0, 1, 2].map(i => parseInt(hex.replace('#', '').slice(i * 2, i * 2 + 2), 16))
      const max = Math.max(r, g, b); const min = Math.min(r, g, b)
      return max === 0 ? 0 : (max - min) / max
    }
    // Both are legible; only one of them is still the brand's colour.
    expect(sat(warm)).toBeGreaterThan(sat(white))
    expect(sat(warm)).toBeGreaterThan(0.55)
  })
})
