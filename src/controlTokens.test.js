import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  TAP_MIN, BUTTON_HEIGHT, BUTTON_SIZES, BUTTON_VARIANTS,
  buttonStyle, buttonInk, lacquerSurface,
  ICON_BUTTON_VARIANTS, iconButtonStyle, iconInk,
  rowStyle, rowDivider, ROW_TITLE, ROW_SUPPORTING, holdLayout,
  CHIP_HEIGHT, CHIP_STATE_NAMES, chipStyle, chipState,
  SEGMENTED_HEIGHT, SEGMENTED_PAD,
  segmentedTrackStyle, segmentStyle, segmentedKeyIndex,
} from './controlTokens'
import { RADIUS } from './shape'
import { TYPE, UI_SIZES } from './typeScale'

// The variant matrix, asserted as a matrix.
//
// These specs are cheap on purpose: they run in the node environment with no
// renderer, so the whole cross-product of variant × state is checked in
// milliseconds. The DOM half — roles, labels, what happens when you click a
// disabled thing — is controls.test.jsx.

const ALL_VARIANTS = ['primary', 'secondary', 'ghost', 'destructive', 'lacquer']

describe('the tap-target floor', () => {
  it('is 44, and it is not a suggestion', () => {
    // WCAG 2.5.5 and Apple's HIG both land on 44. The census found nine icon
    // buttons whose size came from padding alone and were therefore 14–32px —
    // every one of them a close, a back or a speaker, which is what a thumb
    // reaches for most.
    expect(TAP_MIN).toBe(44)
  })

  it('is the smallest thing any control in this file can be', () => {
    const heights = [
      ...BUTTON_SIZES.map(s => BUTTON_HEIGHT[s]),
      parseFloat(iconButtonStyle('ghost').width),
      parseFloat(iconButtonStyle('ghost').height),
      parseFloat(rowStyle().minHeight),
      parseFloat(segmentedTrackStyle().minHeight),
    ]
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(TAP_MIN)
  })

  it('exempts only Chip, and says why in one place', () => {
    // Stories' level filters are 34px and Stories is frozen (the composition is
    // device-approved). A 44px chip would be a redesign of a screen this phase
    // may not touch. The number is named so the phase that owns Stories can
    // raise it in one edit rather than hunting for it.
    expect(CHIP_HEIGHT).toBe(34)
    expect(CHIP_HEIGHT).toBeLessThan(TAP_MIN)
  })
})

describe('button variants', () => {
  it('is exactly the four the brief named', () => {
    expect(BUTTON_VARIANTS).toEqual(ALL_VARIANTS)
  })

  it('returns null for a variant it does not have, rather than an unstyled box', () => {
    for (const bad of ['danger', 'tertiary', 'plum', '', null]) {
      expect(buttonStyle(bad), String(bad)).toBe(null)
      expect(buttonInk(bad), String(bad)).toBe(null)
    }
  })

  it('defaults to primary when the variant is omitted', () => {
    // `undefined` means "not passed" and takes the default; every OTHER unknown
    // value is a typo and gets null. Conflating the two would make a misspelled
    // variant silently render the brand's most important button.
    expect(buttonStyle()).toEqual(buttonStyle('primary'))
    expect(buttonStyle(undefined)).toEqual(buttonStyle('primary'))
  })

  it('fills only primary and destructive — the palette rule, in code', () => {
    // canFillButton() in palette.js says the brand acts and so does delete.
    // Gold, plum, blue and coral are atmosphere; if one of them ever appears
    // here the app has stopped being red.
    expect(buttonStyle('primary').background).toBe('var(--primary-fill)')
    expect(buttonStyle('destructive').background).toBe('var(--danger-fill)')
    expect(buttonStyle('ghost').background).toBe('transparent')
    expect(buttonStyle('secondary').background).toBe('var(--surface)')
    for (const v of ALL_VARIANTS) {
      const bg = buttonStyle(v).background
      for (const forbidden of ['--gold', '--plum', '--blue', '--coral']) {
        expect(bg, v + ' is filled with ' + forbidden).not.toContain(forbidden)
      }
    }
  })

  it('puts white on the filled variants and themed ink on the rest', () => {
    expect(buttonStyle('primary').color).toBe('#fff')
    expect(buttonStyle('destructive').color).toBe('#fff')
    expect(buttonStyle('secondary').color).toBe('var(--text)')
    expect(buttonStyle('ghost').color).toBe('var(--text-secondary)')
  })

  it('darkens on hover, and only when it can be pressed', () => {
    expect(buttonStyle('primary', { hovered: true }).background).toBe('var(--primary-pressed)')
    expect(buttonStyle('destructive', { hovered: true }).background).toBe('var(--danger-pressed)')
    // A disabled button that still reacted to the pointer would be lying.
    expect(buttonStyle('primary', { hovered: true, disabled: true }).background).toBe('var(--surface-3)')
    expect(buttonStyle('primary', { hovered: true, loading: true }).background).toBe('var(--surface-3)')
  })
})

describe('button sizes', () => {
  it('is two, at 44 and 52', () => {
    expect(BUTTON_SIZES).toEqual(['md', 'lg'])
    expect(BUTTON_HEIGHT.md).toBe(44)
    expect(BUTTON_HEIGHT.lg).toBe(52)
  })

  it('falls back to md rather than to zero height', () => {
    expect(buttonStyle('primary', { size: 'enormous' }).minHeight).toBe('44px')
  })

  it('steps the size up for lg and leaves the weight alone', () => {
    // A bigger button is a bigger word, not a bolder one.
    const md = buttonStyle('primary', { size: 'md' })
    const lg = buttonStyle('primary', { size: 'lg' })
    expect(md.fontSize).toBe(TYPE.label.fontSize)
    expect(lg.fontSize).toBe(TYPE.titleCard.fontSize)
    expect(lg.fontWeight).toBe(md.fontWeight)
  })

  it('stretches only when asked', () => {
    expect(buttonStyle('primary').width).toBe('auto')
    expect(buttonStyle('primary', { full: true }).width).toBe('100%')
  })

  it('never wraps to two lines and changes its own height', () => {
    expect(buttonStyle('primary').whiteSpace).toBe('nowrap')
  })
})

describe('disabled, once, for every variant', () => {
  it('drops the accent and takes the muted ink', () => {
    for (const v of ALL_VARIANTS) {
      const s = buttonStyle(v, { disabled: true })
      expect(s.color, v).toBe('var(--text-muted)')
      expect(s.cursor, v).toBe('default')
      expect(buttonInk(v, { disabled: true }), v).toBe('var(--text-muted)')
    }
  })

  it('flattens a filled button and leaves a ghost a ghost', () => {
    // A ghost that grew a box to say "no" would be the only control in the app
    // that changes shape when disabled.
    for (const v of ['primary', 'secondary', 'destructive']) {
      expect(buttonStyle(v, { disabled: true }).background, v).toBe('var(--surface-3)')
    }
    expect(buttonStyle('ghost', { disabled: true }).background).toBe('transparent')
    expect(buttonStyle('ghost', { disabled: true }).border).toBe('none')
  })

  it('does not reuse --locked, which was 2.52:1 under white', () => {
    // ui.jsx filled a disabled primary with --locked and kept the label white.
    // WCAG exempts disabled controls from contrast, so that was legal and still
    // nearly unreadable. --text-muted on --surface-3 measures 5.22:1 in light
    // and 4.39:1 in dark (palette.test.js has the arithmetic).
    for (const v of ALL_VARIANTS) {
      const s = JSON.stringify(buttonStyle(v, { disabled: true }))
      expect(s, v).not.toContain('--locked')
    }
  })
})

describe('loading', () => {
  it('is a kind of disabled — a second tap must not send it twice', () => {
    for (const v of ALL_VARIANTS) {
      expect(buttonStyle(v, { loading: true })).toEqual(buttonStyle(v, { disabled: true }))
    }
  })
})

describe('the icon button', () => {
  it('has two variants and returns null for anything else', () => {
    expect(ICON_BUTTON_VARIANTS).toEqual(['ghost', 'solid'])
    for (const bad of ['filled', 'accent', '', null]) expect(iconButtonStyle(bad)).toBe(null)
  })

  it('is 44x44 by width and height, never by padding', () => {
    // The census's finding, in one assertion: padding around a glyph is how the
    // app got 30x30 buttons, because nobody adds it up. The number you type has
    // to be the number you get.
    for (const v of ICON_BUTTON_VARIANTS) {
      const s = iconButtonStyle(v)
      expect(s.width, v).toBe('44px')
      expect(s.height, v).toBe('44px')
      expect(s.padding, v).toBe(0)
      expect(s.boxSizing, v).toBe('border-box')
    }
  })

  it('paints nothing in the ghost variant, which is what makes it safe to grow', () => {
    // A transparent 44x44 over a transparent 30x30 is the same picture with a
    // bigger target — the glyph does not move and no pixel changes colour.
    const s = iconButtonStyle('ghost')
    expect(s.background).toBe('transparent')
    expect(s.border).toBe('none')
  })

  it('gives solid a real shell, for chrome over a busy ground', () => {
    const s = iconButtonStyle('solid')
    expect(s.background).toBe('var(--surface)')
    expect(s.border).toBe('1px solid var(--border)')
  })

  it('takes the control radius, or a pill when asked', () => {
    expect(iconButtonStyle('ghost').borderRadius).toBe(RADIUS.control + 'px')
    expect(iconButtonStyle('ghost', { round: true }).borderRadius).toBe('999px')
  })

  it('never shrinks in a flex row', () => {
    // A 44px target inside a tight header that flex-shrank to 31px is not a
    // 44px target.
    expect(iconButtonStyle('ghost').flexShrink).toBe(0)
  })

  it('tints its glyph from the state, and allows one named override', () => {
    expect(iconInk()).toBe('var(--text-secondary)')
    expect(iconInk({ disabled: true })).toBe('var(--text-faint)')
    expect(iconInk({ tone: 'var(--primary)' })).toBe('var(--primary)')
    // Disabled beats the override — otherwise a red disabled icon reads live.
    expect(iconInk({ disabled: true, tone: 'var(--primary)' })).toBe('var(--text-faint)')
  })
})

describe('holdLayout — a bigger target that moves nothing', () => {
  it('gives back half the growth, as a negative margin', () => {
    // A 28x28 close button becomes a 44x44 target whose layout box is still
    // 28x28: 44 - 2*8 = 28.
    expect(holdLayout(28)).toEqual({ margin: '-8px' })
    expect(holdLayout(30)).toEqual({ margin: '-7px' })
    expect(holdLayout(32)).toEqual({ margin: '-6px' })
    expect(holdLayout(24)).toEqual({ margin: '-10px' })
  })

  it('reproduces the margins three files worked out by hand', () => {
    // AppBar.jsx uses -10px around a 24px mark, MobileNav.jsx -8px around 28,
    // Grammar.jsx -8px around 28. The formula is what they were computing.
    expect(holdLayout(24).margin).toBe('-10px')
    expect(holdLayout(28).margin).toBe('-8px')
  })

  it('returns null when the control is already big enough', () => {
    // So a caller cannot use this to SHRINK a target that was already correct.
    expect(holdLayout(44)).toBe(null)
    expect(holdLayout(48)).toBe(null)
  })

  it('rounds toward the larger layout box on an odd difference', () => {
    // 44 - 29 = 15; half is 7.5. 7 leaves a 30px box (one spare pixel), 8 would
    // leave 28 and pull the neighbouring content in.
    expect(holdLayout(29)).toEqual({ margin: '-7px' })
    expect(holdLayout(43)).toEqual({ margin: '-0px' })
  })

  it('refuses nonsense rather than emitting NaNpx', () => {
    for (const bad of [null, undefined, '28', NaN, Infinity, {}]) {
      expect(holdLayout(bad), String(bad)).toBe(null)
    }
  })
})

describe('the row', () => {
  it('clears the tap floor and sizes from minHeight, not from a fixed height', () => {
    // A two-line row has to be able to grow. A fixed height would clip the
    // supporting text at the first long subtitle.
    const s = rowStyle()
    expect(s.minHeight).toBe('44px')
    expect(s.height).toBe(undefined)
  })

  it('draws its divider ABOVE, with --divider and never with --hairline', () => {
    // --hairline is a white inset highlight with a name that reads like a
    // separator, so as a border it draws nothing at all on a light surface.
    // That bug shipped on Home in P10-C3 and again in KnownWords.jsx.
    const s = rowStyle({ divider: true })
    expect(s.borderTop).toBe('1px solid var(--divider)')
    expect(s.borderBottom).toBe(undefined)
    expect(JSON.stringify(s)).not.toContain('--hairline')
  })

  it('kills the user-agent border on the other three sides first', () => {
    // A bare `borderTop` on a <button> leaves the browser's default border on
    // bottom, left and right — a grey box around every row.
    const s = rowStyle({ divider: true })
    expect(s.border).toBe('none')
  })

  it('draws no line by default, so a lone row wears none', () => {
    expect(rowStyle().borderTop).toBe('none')
    expect(rowStyle({ divider: false }).borderTop).toBe('none')
  })

  it('only reacts to the pointer when it actually does something', () => {
    expect(rowStyle({ hovered: true, interactive: false }).background).toBe('transparent')
    expect(rowStyle({ hovered: true, interactive: true }).background).toBe('var(--surface-2)')
    expect(rowStyle({ hovered: true, interactive: true, disabled: true }).background).toBe('transparent')
    expect(rowStyle({ interactive: true }).cursor).toBe('pointer')
    expect(rowStyle({ interactive: false }).cursor).toBe('default')
  })

  it('titles and subtitles come from the type scale, in the right order', () => {
    expect(ROW_TITLE.fontSize).toBe(TYPE.titleCard.fontSize)
    expect(ROW_TITLE.color).toBe('var(--text)')
    expect(ROW_SUPPORTING.fontSize).toBe(TYPE.bodySecondary.fontSize)
    expect(ROW_SUPPORTING.color).toBe('var(--text-muted)')
    expect(parseFloat(ROW_SUPPORTING.fontSize)).toBeLessThan(parseFloat(ROW_TITLE.fontSize))
  })
})

describe('rowDivider — "above, except the first", in one place', () => {
  it('draws above every row but the first', () => {
    expect([0, 1, 2, 3].map(rowDivider)).toEqual([false, true, true, true])
  })

  it('draws nothing for a list of one', () => {
    // The single-row case is where a hand-rolled list gets a stray line that
    // then doubles up with the container's own rounded edge.
    expect(rowDivider(0)).toBe(false)
  })

  it('needs no list length, which is the point of drawing above', () => {
    // A `.map()` often does not have the length to hand, and the version that
    // needs it is the version that gets the last row wrong.
    expect(rowDivider.length).toBe(1)
  })

  it('is false for nonsense rather than throwing', () => {
    for (const bad of [null, undefined, '1', 1.5, -1, NaN, {}]) {
      expect(rowDivider(bad), String(bad)).toBe(false)
    }
  })
})

describe('the chip', () => {
  it('has exactly four states', () => {
    expect(CHIP_STATE_NAMES).toEqual(['passive', 'selectable', 'selected', 'disabled'])
  })

  it('resolves its state in a fixed precedence: disabled, then selected', () => {
    expect(chipState({})).toBe('passive')
    expect(chipState({ selectable: true })).toBe('selectable')
    expect(chipState({ selectable: true, selected: true })).toBe('selected')
    expect(chipState({ selectable: true, selected: true, disabled: true })).toBe('disabled')
    // A selected-but-disabled chip must read disabled, or a locked filter looks
    // like the active one.
    expect(chipState({ selected: true, disabled: true })).toBe('disabled')
  })

  it('fills a selected chip with the brand, not a tint', () => {
    const s = chipStyle({ selectable: true, selected: true })
    expect(s.background).toBe('var(--primary-fill)')
    expect(s.color).toBe('#fff')
  })

  it('gives a passive chip no pointer, because a label is not a control', () => {
    expect(chipStyle({}).cursor).toBe('default')
    expect(chipStyle({ selectable: true }).cursor).toBe('pointer')
    expect(chipStyle({ selectable: true, disabled: true }).cursor).toBe('default')
  })

  it('is a pill, in every state', () => {
    for (const opts of [{}, { selectable: true }, { selectable: true, selected: true }, { disabled: true }]) {
      expect(chipStyle(opts).borderRadius).toBe('999px')
    }
  })
})

describe('the segmented control', () => {
  it('is a 44-tall track so each segment clears the floor', () => {
    // 44 = 4 padding + 36 segment + 4 padding. The SEGMENT is 36 and the TARGET
    // is the track, which is what a finger hits.
    expect(SEGMENTED_HEIGHT).toBe(TAP_MIN)
    expect(segmentedTrackStyle().minHeight).toBe('44px')
    expect(segmentedTrackStyle().padding).toBe(SEGMENTED_PAD + 'px')
    expect(parseFloat(segmentStyle().minHeight)).toBe(SEGMENTED_HEIGHT - SEGMENTED_PAD * 2 - 2)
  })

  it('lifts the selected segment onto a surface rather than tinting it', () => {
    // A tint has to compete with whatever the track is sitting on. A lift never
    // does — it is the same move .dict-tabs already made in index.css.
    const on = segmentStyle({ selected: true })
    const off = segmentStyle({ selected: false })
    expect(on.background).toBe('var(--surface)')
    expect(on.boxShadow).toBe('var(--shadow-1)')
    expect(on.color).toBe('var(--text)')
    expect(off.background).toBe('transparent')
    expect(off.boxShadow).toBe('none')
    expect(off.color).toBe('var(--text-muted)')
  })

  it('does not let the selected segment also react to hover', () => {
    expect(segmentStyle({ selected: true, hovered: true }).background).toBe('var(--surface)')
    expect(segmentStyle({ selected: false, hovered: true }).background).toBe('var(--surface-3)')
    expect(segmentStyle({ selected: false, hovered: true, disabled: true }).background).toBe('transparent')
  })

  it('lets segments share the width without any one of them overflowing', () => {
    expect(segmentStyle().flex).toBe(1)
    expect(segmentStyle().minWidth).toBe(0)
  })
})

describe('segmentedKeyIndex — the radio-group keyboard contract', () => {
  it('moves forward and backward on both axes', () => {
    expect(segmentedKeyIndex('ArrowRight', 0, 3)).toBe(1)
    expect(segmentedKeyIndex('ArrowDown', 0, 3)).toBe(1)
    expect(segmentedKeyIndex('ArrowLeft', 1, 3)).toBe(0)
    expect(segmentedKeyIndex('ArrowUp', 1, 3)).toBe(0)
  })

  it('wraps at both ends, which is what a radio group does', () => {
    expect(segmentedKeyIndex('ArrowRight', 2, 3)).toBe(0)
    expect(segmentedKeyIndex('ArrowLeft', 0, 3)).toBe(2)
  })

  it('jumps to the ends on Home and End', () => {
    expect(segmentedKeyIndex('Home', 2, 3)).toBe(0)
    expect(segmentedKeyIndex('End', 0, 3)).toBe(2)
  })

  it('returns null for every other key, so nothing is swallowed', () => {
    // Returning 0 for an unknown key would silently reset the selection, and
    // preventDefault-ing Tab would trap the user in the control.
    for (const k of ['Tab', 'Enter', ' ', 'Escape', 'a', 'PageUp', '']) {
      expect(segmentedKeyIndex(k, 1, 3), k).toBe(null)
    }
  })

  it('is a no-op on a group of one and refuses nonsense', () => {
    expect(segmentedKeyIndex('ArrowRight', 0, 1)).toBe(0)
    expect(segmentedKeyIndex('ArrowRight', 0, 0)).toBe(null)
    expect(segmentedKeyIndex('ArrowRight', null, 3)).toBe(null)
    expect(segmentedKeyIndex('ArrowRight', 0, null)).toBe(null)
  })
})

// ── The token contract ──────────────────────────────────────────────────────
describe('the controls name roles, never values', () => {
  const SRC = readFileSync(new URL('./controlTokens.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

  it('has no six-digit hex anywhere in it', () => {
    // A hardcoded neutral cannot theme (CLAUDE.md §5), and the guard's hex
    // budget is already at its ceiling — a new one would fail the build.
    expect(SRC).not.toMatch(/#[0-9A-Fa-f]{6}\b/)
  })

  it('allows exactly one literal colour: #fff on a filled ground', () => {
    // White on an accent is the one value that must NOT theme — the accent is
    // dark in both modes, so the label stays white in both.
    const literals = [...SRC.matchAll(/#[0-9A-Fa-f]{3}\b/g)].map(m => m[0])
    expect(new Set(literals)).toEqual(new Set(['#fff']))
  })

  it('has no rgba() — a tint must mix into the surface', () => {
    expect(SRC).not.toMatch(/rgba?\(/)
  })

  it('takes every colour it uses from a token that exists in both themes', () => {
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const used = new Set([...SRC.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]))
    expect(used.size).toBeGreaterThan(6)
    for (const token of used) {
      const hits = (css.match(new RegExp(token + ':', 'g')) || []).length
      expect(hits, token + ' is used by a control but declared ' + hits + ' time(s)')
        .toBeGreaterThanOrEqual(2)
    }
  })

  it('invents no font size outside the scale', () => {
    const sizes = new Set()
    for (const s of [
      buttonStyle('primary', { size: 'md' }), buttonStyle('primary', { size: 'lg' }),
      chipStyle({}), segmentStyle({}), ROW_TITLE, ROW_SUPPORTING,
    ]) sizes.add(parseFloat(s.fontSize))
    for (const size of sizes) expect(UI_SIZES, size + 'px is not in the scale').toContain(size)
  })

  it('invents no radius outside the scale', () => {
    const scale = new Set(Object.values(RADIUS).map(r => (r === 999 ? '999px' : r + 'px')))
    for (const s of [
      buttonStyle('primary'), iconButtonStyle('ghost'), iconButtonStyle('ghost', { round: true }),
      chipStyle({}), segmentedTrackStyle(), segmentStyle({}),
    ]) {
      expect([...scale], s.borderRadius + ' is not in the radius scale').toContain(s.borderRadius)
    }
  })

  it('reaches for nothing but the P14-0 token modules', () => {
    const imports = [...readFileSync(new URL('./controlTokens.js', import.meta.url), 'utf8')
      .matchAll(/from '([^']+)'/g)].map(m => m[1]).sort()
    expect(imports).toEqual(['./shape', './typeScale'])
  })
})

// ── The lacquer material (P14-5D) ───────────────────────────────────────────
describe('lacquer — a primary button made of material', () => {
  it('is the primary role, not a new colour', () => {
    // Same token as `primary`: this is a MATERIAL change, and the brand still
    // decides what colour an action is (palette.js canFillButton).
    const s = buttonStyle('lacquer')
    expect(s.background).toBe('var(--primary-fill)')
    expect(s.color).toBe('#fff')
  })

  it('keeps the button\'s geometry — a variant may not invent its own', () => {
    const lacquer = buttonStyle('lacquer', { size: 'lg' })
    const primary = buttonStyle('primary', { size: 'lg' })
    expect(lacquer.minHeight).toBe(primary.minHeight)
    expect(lacquer.borderRadius).toBe(primary.borderRadius)
    expect(lacquer.fontSize).toBe(primary.fontSize)
    expect(parseFloat(lacquer.minHeight)).toBeGreaterThanOrEqual(TAP_MIN)
  })

  it('paints light on the top edge and turns the bottom away', () => {
    const s = buttonStyle('lacquer')
    expect(s.backgroundImage).toContain('linear-gradient(180deg')
    expect(s.backgroundImage).toContain('var(--lacquer-lift)')
    expect(s.backgroundImage).toContain('var(--lacquer-depth)')
    expect(s.boxShadow).toContain('inset 0 1px 0 var(--inset-highlight)')
    expect(s.boxShadow).toContain('inset 0 -1px 0 var(--lacquer-edge)')
  })

  it('compresses under a finger and gives up its shadow', () => {
    const rest = buttonStyle('lacquer')
    const down = buttonStyle('lacquer', { pressed: true })
    expect(rest.transform).toBe('none')
    expect(down.transform).toBe('translateY(1px)')
    // The cast shadow goes; what is left is the inset that says "sunk".
    expect(down.boxShadow).not.toContain('var(--shadow-1)')
    expect(down.boxShadow).toContain('inset')
  })

  it('is not glossy — one highlight, and a gradient that spans one step', () => {
    // The failure mode is a Web-2.0 button: two specular bands, or a gradient so
    // wide the fill stops being the brand colour. Three stops, one lift, one depth.
    const s = lacquerSurface()
    expect((s.backgroundImage.match(/color-mix/g) || []).length).toBe(2)
    expect(s.backgroundImage).toContain('58%')
  })

  it('drops its material entirely when disabled', () => {
    const off = buttonStyle('lacquer', { disabled: true })
    expect(off.backgroundImage).toBeUndefined()
    expect(off.cursor).not.toBe('pointer')
  })
})
