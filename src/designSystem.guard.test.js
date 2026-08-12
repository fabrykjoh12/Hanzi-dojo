import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// The ratchet.
//
// P14-0 defines the systems; P14-2 sweeps the app onto them. In between there is
// a long window where a new screen could quietly add a 15px / #8A8A8A /
// radius-11 and nobody would notice — which is how the codebase reached 60 type
// styles, 16 radii and ~100 hardcoded hexes in the first place.
//
// Two kinds of check here, and the difference matters:
//
//   BANS      things that must never come back. Hard zero.
//   BUDGETS   the count that exists today, which may only go DOWN. Each number
//             below is a measurement, not a target. P14-2 edits them downward as
//             it migrates files; raising one needs a reason in the commit.
//
// Static on purpose (reading source text): this has to catch a value when it is
// typed, not when a screen happens to render.

const SRC = new URL('./', import.meta.url)

// The modules that DEFINE colour. Their hexes are the tokens, so counting them
// as violations would penalise the very thing this phase exists to build.
const TOKEN_MODULES = new Set([
  'palette.js',        // P14-0's semantic palette
  'designTokens.js',   // hero ground / flat panel / on-hero text
  'languageTheme.js',  // per-language identity (CLAUDE.md §1)
  'gradePalette.js',   // the four grade colours
  'cardMarker.js',     // new-vs-review band tones
  'manhuaTokens.js',   // the manhua reader's own palette
])

// The P14-1 control layer. Not a colour module — it names roles and holds no
// values of its own — but listed so the intent is written down: these are the
// files a screen should import a control FROM, and controlTokens.test.js already
// asserts that they carry no hex at all.
const CONTROL_MODULES = new Set(['controls.jsx', 'controlTokens.js'])

const files = readdirSync(SRC)
  .filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
  .filter(f => !f.includes('.test.'))

function read(f) {
  return readFileSync(new URL('./' + f, SRC), 'utf8')
}

// Comments are not code. Several files now carry doc comments naming the hexes
// P14-0 REMOVED; counting those as uses would make the guard permanently red.
function code(f) {
  return read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
}

const CODE = new Map(files.map(f => [f, code(f)]))

// ── BANS ────────────────────────────────────────────────────────────────────

describe('the sage brand identity is gone for good', () => {
  // Sage #6E8466 was an undeclared fourth brand colour, hardcoded in 11 files as
  // the fill of the app's most important CTAs, while the identity accent was
  // vermilion. That is the thing that must never come back.
  //
  // ONE documented exception: Kana.jsx still uses #5C7155 for its
  // "lesson cleared" tick and the cleared-syllable tint. That is a SUCCESS
  // colour, not a brand colour, and Kana is a frozen-track screen (CLAUDE.md
  // §1) — remapping it would change visual meaning on a screen we are not
  // supposed to be spending work on. It is listed here so it is a recorded
  // decision rather than a leak.
  const SAGE_SUCCESS_EXCEPTION = { file: 'Kana.jsx', value: '5C7155' }

  it('never appears as a brand fill anywhere', () => {
    for (const [f, src] of CODE) {
      for (const gone of ['6E8466', 'A8B5A1', '110,132,102', '110, 132, 102']) {
        expect(src, f + ' still contains ' + gone).not.toContain(gone)
      }
    }
  })

  it('survives only as Kana\'s success tick, and only there', () => {
    for (const [f, src] of CODE) {
      if (f === SAGE_SUCCESS_EXCEPTION.file) continue
      expect(src, f + ' contains ' + SAGE_SUCCESS_EXCEPTION.value)
        .not.toContain(SAGE_SUCCESS_EXCEPTION.value)
    }
    expect(CODE.get(SAGE_SUCCESS_EXCEPTION.file)).toContain(SAGE_SUCCESS_EXCEPTION.value)
  })

  it('and jade never arrives — the revision-1 proposal was withdrawn', () => {
    for (const [f, src] of CODE) {
      for (const gone of ['0E7A63', '2CC49A', '0A6252', '23A481', 'E4F2ED']) {
        expect(src, f + ' contains jade ' + gone).not.toContain(gone)
      }
    }
  })
})

describe('--hairline is gone, and stays gone', () => {
  // The token whose VALUE was a white inset top highlight and whose NAME read
  // like a separator. Used as a border it drew nothing visible on a light
  // surface — a bug that shipped twice (Home in P10-C3, KnownWords found by this
  // very suite in P14-0). P14-0 split it into --inset-highlight and --divider
  // and kept --hairline as a deprecated alias; P14-2 deleted the alias.
  //
  // Both halves are asserted: the token is not declared, and nothing reads it.
  // The border-specific check is kept because it names the actual failure mode,
  // and because it is the one a future `--hairline: ...` would trip first.
  it('is declared nowhere and read nowhere', () => {
    for (const [f, src] of CODE) {
      expect(src, f + ' still reads var(--hairline)').not.toContain('var(--hairline)')
    }
  })

  it('appears in no border declaration', () => {
    for (const [f, src] of CODE) {
      expect(src.replace(/\s+/g, ' '), f + ' uses --hairline as a border')
        .not.toMatch(/border[A-Za-z]*\s*:\s*[^;,}]*var\(--hairline\)/)
    }
  })
})

describe('the control layer holds no values of its own', () => {
  it('carries no six-digit hex, so every colour themes', () => {
    for (const f of CONTROL_MODULES) {
      expect(CODE.get(f), f + ' has a hardcoded hex').not.toMatch(/#[0-9A-Fa-f]{6}\b/)
    }
  })

  it('reaches only for the P14-0 token modules and React', () => {
    const allowed = new Set(['react', './shape', './typeScale', './controlTokens'])
    for (const f of CONTROL_MODULES) {
      for (const m of read(f).matchAll(/from '([^']+)'/g)) {
        expect(allowed.has(m[1]), f + ' imports ' + m[1]).toBe(true)
      }
    }
  })
})

describe('every IconButton has an accessible name', () => {
  // The one rule a component cannot enforce on itself. `label` is required by
  // documentation and by every spec in controls.test.jsx, but a caller that
  // simply omits it still renders — an icon-only control that a screen reader
  // announces as "button" and nothing else. The census found existing ones; this
  // is what stops the new component growing its own.
  // Covers BOTH components of that name: controls.jsx's and
  // ReadingScaffold.jsx's (which the reader stack has used since P9 and which
  // already got this right). Either way the rule is the same.
  it('passes a label at every call site', () => {
    const missing = []
    for (const [f, src] of CODE) {
      // Arrows are neutralised BEFORE matching rather than allowed as an
      // alternation: `(?:[^>]|=>)*?` looks like it handles `(e) => {…}` and does
      // not, because the engine consumes the `=` with `[^>]` and then stops at
      // the `>`. Two earlier versions of this spec reported a correctly-labelled
      // button as missing for exactly that reason.
      const flat = src.replace(/=>/g, '=»')
      for (const m of flat.matchAll(/<IconButton\b([^>]*?)\/?>/g)) {
        if (!/\blabel\s*=/.test(m[1])) missing.push(f + ' → ' + m[1].slice(0, 60).replace(/\s+/g, ' '))
      }
    }
    expect(missing, 'IconButton without a label: ' + missing.join(' | ')).toEqual([])
  })
})

describe('one value, one definition (P14-2)', () => {
  // The drift this phase exists to remove, in its purest form: designTokens.MICRO
  // and TYPE.eyebrow were the same four declarations written out twice, in two
  // files, by two phases. MICRO now derives from TYPE.eyebrow. This is what stops
  // anyone re-typing it.
  it('MICRO derives from TYPE.eyebrow rather than restating it', async () => {
    const { MICRO } = await import('./designTokens')
    const { TYPE } = await import('./typeScale')
    for (const k of ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform']) {
      expect(MICRO[k], 'MICRO.' + k).toBe(TYPE.eyebrow[k])
    }
    // And deliberately NOT lineHeight: MICRO's call sites have always inherited
    // theirs, and pulling 1.2 through would move seven labels for no reason.
    expect(MICRO.lineHeight).toBe(undefined)
  })

  it('designTokens.js states no type values of its own', () => {
    // Its remaining job is the hero ground, the hero shadow, the flat panel and
    // the on-hero text colours. A fontSize typed here would be a fifth scale.
    const src = CODE.get('designTokens.js')
    expect(src).not.toMatch(/fontSize:\s*'/)
    expect(src).not.toMatch(/fontWeight:\s*\d/)
  })
})

describe('the token modules stay pure', () => {
  it('reach for nothing — they are values', () => {
    for (const f of ['palette.js', 'typeScale.js', 'shape.js']) {
      const imports = [...read(f).matchAll(/from '([^']+)'/g)].map(m => m[1])
      expect(imports, f + ' should have no imports').toEqual([])
    }
  })

  it('decide nothing about layout', () => {
    // `lineHeight` is type, not layout, so it is explicitly allowed. Anything
    // that positions a box is not this layer's business.
    //
    // Matched as a property WITH A VALUE (`display: 'flex'`, `flex: 1`), not as
    // a bare name — because `TYPE.display` is a type role, and an earlier
    // version of this spec failed on the role name for looking like the CSS
    // property.
    // `display` and `position` take keyword values, so requiring a QUOTED value
    // separates the CSS property from this repo's own vocabulary — `TYPE.display`
    // is a type role and `WEIGHT.display` is 800, and both look like a
    // declaration to a looser matcher. The box properties can be numbers.
    const KEYWORD = ['display', 'position', 'grid']
    const BOX = ['margin', 'padding', 'width', 'height', 'flex']
    for (const f of ['palette.js', 'typeScale.js', 'shape.js']) {
      const src = CODE.get(f).replace(/lineHeight/g, '')
      for (const prop of KEYWORD) {
        expect(src, f + ' declares ' + prop).not.toMatch(new RegExp('\\b' + prop + '[A-Za-z]*:\\s*[\'"]', 'i'))
      }
      for (const prop of BOX) {
        expect(src, f + ' declares ' + prop).not.toMatch(new RegExp('\\b' + prop + '[A-Za-z]*:\\s*[\'"0-9]', 'i'))
      }
    }
  })

  it('carry no colour in the shape or type layers', () => {
    for (const f of ['typeScale.js', 'shape.js']) {
      expect(CODE.get(f), f + ' has a hex in it').not.toMatch(/#[0-9A-Fa-f]{3,8}\b/)
    }
  })
})

// ── BUDGETS ─────────────────────────────────────────────────────────────────

describe('hardcoded colour budget', () => {
  // 70 distinct hexes outside the token modules, measured at P14-0. Most are
  // legitimate for now: drill palettes, story tones, the offline bar, the
  // pre-CSS "site can't start" card, canvas share images, admin charts. Blindly
  // migrating them would change visual meaning, which P14-0 was told not to do.
  const HEX_BUDGET = 70

  it('has not grown past ' + HEX_BUDGET + ' distinct values outside the token modules', () => {
    const hexes = new Set()
    for (const [f, src] of CODE) {
      if (TOKEN_MODULES.has(f)) continue
      for (const m of src.matchAll(/#[0-9A-Fa-f]{6}\b/g)) hexes.add(m[0].toUpperCase())
    }
    expect([...hexes].sort().length,
      'distinct hardcoded hexes went up. Add a token in palette.js instead, or move this budget down with a reason.'
    ).toBeLessThanOrEqual(HEX_BUDGET)
  })
})

describe('neutral-grey budget', () => {
  // A "neutral" is a hex whose three channels sit within 12 of each other. Every
  // one of them is a value that CANNOT theme (CLAUDE.md §5) — a screen that will
  // look wrong in one of the two modes. 73 occurrences across 17 files at
  // P14-0. Some are legitimate and will stay:
  //
  //   supabase.js   the "site can't start" card, which renders before any CSS
  //   main.jsx      the theme-color meta tag, which is a browser API
  //   shareCard.js  canvas drawing for a share image — not themed UI
  //   NavIcons.jsx  #FFFFFF/#000000 inside SVG masks, which are not colours
  //   splashIntro.js the launch overlay, which paints before the app mounts
  //
  // The rest are the P14-2 sweep's job. This number may only go down.
  const NEUTRAL_BUDGET = 73

  it('has not grown past ' + NEUTRAL_BUDGET + ' occurrences', () => {
    let count = 0
    const perFile = new Map()
    for (const [f, src] of CODE) {
      for (const m of src.matchAll(/#([0-9A-Fa-f]{6})\b/g)) {
        const h = m[1]
        const r = parseInt(h.slice(0, 2), 16)
        const g = parseInt(h.slice(2, 4), 16)
        const b = parseInt(h.slice(4, 6), 16)
        if (Math.max(r, g, b) - Math.min(r, g, b) <= 12) {
          count += 1
          perFile.set(f, (perFile.get(f) || 0) + 1)
        }
      }
    }
    expect(count,
      'neutral hexes went up — they cannot theme. Worst offenders: '
      + [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0] + '×' + e[1]).join(', ')
    ).toBeLessThanOrEqual(NEUTRAL_BUDGET)
  })
})

describe('type and radius budgets', () => {
  // The census measured 60 distinct RENDERED type styles and 16 rendered radii
  // (tests/e2e are where rendered output is measured — these are the SOURCE
  // counts, which are the leading indicator).
  //
  // Both may only go down. P14-2 is what drives them.
  // P14-2 moved both DOWN: 46 → 34 sizes and 34 → 11 radii. The radius one is
  // now backed by a hard allow-list below, which is the stronger check; the
  // budget stays as the thing that notices a NEW value before anyone names it.
  //
  // 11 and not 10: the sweep initially snapped GradeRow's grade buttons from 16
  // to 18, flashcard-contract.spec.js caught it, and 16 was put back — Study is
  // the screen this phase was told to especially protect. The allow-list scopes
  // that 16 to GradeRow.jsx alone.
  const SIZE_BUDGET = 34
  const RADIUS_BUDGET = 11

  it('does not add new font sizes', () => {
    const sizes = new Set()
    for (const [f, src] of CODE) {
      if (f === 'typeScale.js') continue
      for (const m of src.matchAll(/fontSize:\s*'([\d.]+)px'/g)) sizes.add(m[1])
    }
    expect(sizes.size,
      'a new one-off font size appeared. Use a role from typeScale.js.'
    ).toBeLessThanOrEqual(SIZE_BUDGET)
  })

  it('does not add new radii', () => {
    const radii = new Set()
    for (const [f, src] of CODE) {
      if (f === 'shape.js') continue
      for (const m of src.matchAll(/borderRadius:\s*'([\d.]+)px'/g)) radii.add(m[1])
    }
    expect(radii.size,
      'a new one-off radius appeared. Use RADIUS from shape.js.'
    ).toBeLessThanOrEqual(RADIUS_BUDGET)
  })
})

describe('the four weights, enforced (P14-2)', () => {
  // typeScale.js declares 400 body · 600 label · 700 title · 800 display. The app
  // had TWELVE, including 550, 650, 750, 760, 780, 820 and 850 — and every one of
  // those renders IDENTICALLY, because only Inter 300/400/500/600 are bundled
  // (src/fonts.js) so anything >= 550 matches 600 and gets the same synthetic
  // emboldening. Measured in a browser: 550 through 900 all render at 290.39px
  // for the same string. Twelve declared weights, four rendered ones.
  //
  // So this is not a style preference. A 750 is a lie about what the screen
  // shows, and it becomes a visible bug the day the variable face lands.
  const ALLOWED = new Set(['400', '500', '600', '700', '800'])

  it('declares no weight outside the scale', () => {
    const bad = []
    for (const [f, src] of CODE) {
      for (const m of src.matchAll(/fontWeight:\s*(\d+)/g)) {
        if (!ALLOWED.has(m[1])) bad.push(f + ' → ' + m[1])
      }
      // Ternaries too: `fontWeight: on ? 750 : 600`.
      for (const m of src.matchAll(/fontWeight:\s*[^,;}\n]*?\?\s*(\d+)\s*:\s*(\d+)/g)) {
        for (const w of [m[1], m[2]]) if (!ALLOWED.has(w)) bad.push(f + ' → ' + w + ' (ternary)')
      }
    }
    expect([...new Set(bad)], 'off-scale font weight: ' + [...new Set(bad)].join(', ')).toEqual([])
  })

  it('keeps 500 only where it is content typography', () => {
    // The one weight outside typeScale's four that survives P14-2, on purpose:
    // it is a REAL loaded face (unlike 650/750/850), it renders distinctly, and
    // most of its uses are the language itself — a 110px Cyrillic letter, a 22px
    // word option in the reader's own face. Snapping those to 400 would be
    // forcing content type into a UI role, which the phase forbids.
    let n = 0
    for (const [, src] of CODE) n += (src.match(/fontWeight:\s*500\b/g) || []).length
    expect(n, '500 is documented at 24 sites; a new one needs a reason').toBeLessThanOrEqual(24)
  })
})

describe('the radius scale, enforced (P14-2)', () => {
  // Every single-value borderRadius in src/ is a scale value or one of five
  // documented keeps. This is a hard allow-list, not a budget — the app went
  // from 26 distinct radii to 13, and there is no longer any reason to type a 14.
  //
  // The keeps, each with its reason:
  //   3 4 5 6   below the scale's floor. Progress bars, dots, tiny tints —
  //             snapping a 3px bar to 8px would visibly change its shape.
  //   34        Listen's 108x108 hero object (P14-1 recorded it as bespoke).
  const SCALE = new Set(['8', '12', '18', '26', '999'])
  const KEEP = new Set(['3', '4', '5', '6', '34', '16'])
  // 16 has exactly ONE site: GradeRow's four grade buttons, pinned by
  // flashcard-contract.spec.js on the screen the phase was told to especially
  // protect. Anywhere else it is a regression, so it is scoped to that file.
  const KEEP_16_ONLY_IN = 'GradeRow.jsx'

  it('types no radius outside the scale or the documented keeps', () => {
    const bad = []
    for (const [f, src] of CODE) {
      for (const m of src.matchAll(/borderRadius:\s*'([\d.]+)px'/g)) {
        if (m[1] === '16' && f !== KEEP_16_ONLY_IN) { bad.push(f + ' → 16px (only ' + KEEP_16_ONLY_IN + ' may)'); continue }
        if (!SCALE.has(m[1]) && !KEEP.has(m[1])) bad.push(f + ' → ' + m[1] + 'px')
      }
    }
    expect([...new Set(bad)], 'off-scale radius: ' + [...new Set(bad)].join(', ')).toEqual([])
  })

  it('spells a circle one way', () => {
    // `50%` and `999px` are identical on a square, and every circle in the app was
    // square — but 999px stays a pill if the element ever grows, where 50% becomes
    // an ellipse. Twelve sites, one spelling.
    for (const [f, src] of CODE) {
      expect(src, f + " still uses borderRadius: '50%'").not.toContain("borderRadius: '50%'")
    }
  })

  it('hinges every bottom sheet on the same corner', () => {
    // Five sheets, three different tops (18 / 20 / 22). Now one.
    const tops = new Set()
    for (const [, src] of CODE) {
      for (const m of src.matchAll(/borderRadius:\s*'([\d]+px [\d]+px 0 0)'/g)) tops.add(m[1])
    }
    expect([...tops]).toEqual(['18px 18px 0 0'])
  })
})

describe('elevation comes from tokens (P14-2)', () => {
  // 44 distinct boxShadow declarations became 15, and 11 of those 15 are
  // deliberate keeps. The point is not the count: a literal `rgba(24,24,27,0.06)`
  // shadow is a near-black wash tuned for paper and INVISIBLE on the dark ground,
  // so every one of them was a dark-mode defect. The tokens flip per theme.
  const SHADOW_LITERAL_BUDGET = 11

  it('has no more than ' + SHADOW_LITERAL_BUDGET + ' bespoke shadow declarations left', () => {
    const bespoke = new Set()
    for (const [, src] of CODE) {
      for (const m of src.matchAll(/boxShadow:\s*'([^']*rgba?\([^']*)'/g)) bespoke.add(m[1])
    }
    expect(bespoke.size,
      'a new hardcoded shadow appeared. Use ELEVATION from shape.js — a literal rgba shadow cannot theme. Found: '
      + [...bespoke].join(' | ').slice(0, 400),
    ).toBeLessThanOrEqual(SHADOW_LITERAL_BUDGET)
  })

  it('names the sheet cast rather than re-deriving it', () => {
    // Five bottom sheets each hand-rolled an inverted shadow because both
    // --shadow-1 and --shadow-2 cast downward. One token now.
    let n = 0
    for (const [, src] of CODE) n += (src.match(/var\(--shadow-sheet\)/g) || []).length
    expect(n).toBeGreaterThanOrEqual(5)
  })
})

describe('the CSS token layer', () => {
  const css = readFileSync(new URL('./index.css', SRC), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('names divider and inset-highlight separately, in both themes', () => {
    expect((css.match(/--inset-highlight:/g) || []).length).toBe(2)
    expect((css.match(/--divider:/g) || []).length).toBe(2)
  })

  it('has retired --hairline entirely (P14-2)', () => {
    // P14-1 kept it as a deprecated alias so existing call sites survived the
    // foundation commit. By P14-2 there were two left, both the legitimate lit-
    // edge use, and both now name --inset-highlight. The token is gone; this is
    // what stops it coming back under its misleading name.
    expect((css.match(/--hairline/g) || []).length).toBe(0)
  })

  it('defines every accent role in both themes', () => {
    for (const t of ['primary', 'primary-bright', 'primary-pressed', 'primary-soft',
      'burgundy', 'gold', 'gold-bright', 'plum', 'blue', 'coral', 'locked']) {
      expect((css.match(new RegExp('--' + t + ':', 'g')) || []).length, '--' + t).toBe(2)
    }
  })

  it('defines the fill roles in both themes (P14-1)', () => {
    // A colour that CARRIES white text and a colour that IS text are different
    // jobs. Conflating them was a real AA failure: white on the dark-mode
    // --primary (#E4573A) is 3.67:1, on the app's most important control.
    for (const t of ['primary-fill', 'danger-fill', 'danger-pressed']) {
      expect((css.match(new RegExp('--' + t + ':', 'g')) || []).length, '--' + t).toBe(2)
    }
  })

  it('defines the full neutral ramp in both themes', () => {
    for (const t of ['bg', 'surface', 'surface-2', 'surface-3', 'border', 'border-strong',
      'text', 'text-secondary', 'text-muted', 'text-faint']) {
      expect((css.match(new RegExp('--' + t + ':', 'g')) || []).length, '--' + t)
        .toBeGreaterThanOrEqual(2)
    }
  })
})
