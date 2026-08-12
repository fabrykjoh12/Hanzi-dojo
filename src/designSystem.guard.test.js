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

describe('--hairline is never used as a divider', () => {
  // It is a WHITE inset top highlight with a name that reads like a separator.
  // Used as a border it draws nothing visible on a light surface — the bug that
  // shipped on Home in P10-C3 and had to be found by measuring pixels.
  it('appears in no border declaration', () => {
    for (const [f, src] of CODE) {
      expect(src.replace(/\s+/g, ' '), f + ' uses --hairline as a border')
        .not.toMatch(/border[A-Za-z]*\s*:\s*[^;,}]*var\(--hairline\)/)
    }
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
  const SIZE_BUDGET = 46
  const RADIUS_BUDGET = 34

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

describe('the CSS token layer', () => {
  const css = readFileSync(new URL('./index.css', SRC), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('names divider and inset-highlight separately, in both themes', () => {
    expect((css.match(/--inset-highlight:/g) || []).length).toBe(2)
    expect((css.match(/--divider:/g) || []).length).toBe(2)
  })

  it('keeps --hairline as a deprecated alias so 33 call sites still work', () => {
    // Renaming the token AND its uses inside a foundation commit would be a
    // 15-file diff. The alias is the seam; P14-2 removes it.
    expect((css.match(/--hairline:/g) || []).length).toBe(2)
  })

  it('defines every accent role in both themes', () => {
    for (const t of ['primary', 'primary-bright', 'primary-pressed', 'primary-soft',
      'burgundy', 'gold', 'gold-bright', 'plum', 'blue', 'coral', 'locked']) {
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
