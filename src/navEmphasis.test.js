import { describe, it, expect } from 'vitest'
import {
  MOBILE_NAV_HEIGHT, MOBILE_NAV_RESERVE, MOBILE_NAV_SPACE,
  NAV_TRAY_INSET, NAV_TRAY_FLOAT, NAV_TRAY_BOTTOM, NAV_TRAY_RADIUS_NAME,
} from './navMetrics'
import { RADIUS, ELEVATION } from './shape'
import {
  NAV_ICON_PX, CARDS_SHELL, NAV_COLUMN,
  navIconPx, navColumnHeight, navColumnFits, iconRowStyle, cardsShellStyle, navTrayStyle,
} from './navEmphasis'

// The bar's hierarchy is arithmetic, so it can be asserted. What these specs are
// really protecting is the flashcard: every pixel the bar takes is a pixel
// `studyLayout` cannot give the card, and a container is exactly the kind of
// change that grows a bar by four pixels and nobody notices for a build.

describe('the column fits inside the tray', () => {
  it('costs less than the tray minus its own borders', () => {
    // 4 + 34 + 2 + 13 + 4 = 57, inside 60 − 2. The tray has a border on both
    // edges now, not just the top, so the budget lost a pixel as the tray gained
    // two.
    expect(navColumnHeight()).toBe(57)
    expect(navColumnFits()).toBe(true)
    expect(navColumnHeight()).toBeLessThanOrEqual(MOBILE_NAV_HEIGHT - 2)
  })

  it('declares the tray height, and it is a decision rather than a side effect', () => {
    // P8 settled 58 for a flush bar; P14-4 makes it a floating tray at 60, the
    // bottom of the 60–64 the brief asked for. Every pixel here comes off the
    // flashcard, which is why it is not 64.
    expect(MOBILE_NAV_HEIGHT).toBe(60)
  })

  it('leaves the label a real line box', () => {
    // Small enough to buy the container its 34px, big enough to hold 10.5px
    // type without clipping descenders.
    expect(NAV_COLUMN.labelLine).toBeGreaterThanOrEqual(12)
    expect(NAV_COLUMN.labelLine).toBeLessThan(15.75)
  })
})

describe('the Cards container', () => {
  it('is inside the range the device review asked for', () => {
    expect(CARDS_SHELL.width).toBeGreaterThanOrEqual(40)
    expect(CARDS_SHELL.width).toBeLessThanOrEqual(44)
    expect(CARDS_SHELL.height).toBeGreaterThanOrEqual(34)
    expect(CARDS_SHELL.height).toBeLessThanOrEqual(38)
  })

  it('holds the glyph with room on both axes', () => {
    // A container the glyph touches is not a container, it is a border.
    expect(CARDS_SHELL.width - NAV_ICON_PX.study).toBeGreaterThanOrEqual(8)
    expect(CARDS_SHELL.height - NAV_ICON_PX.study).toBeGreaterThanOrEqual(4)
  })

  it('is the row every other glyph is centred in, so the icons share a line', () => {
    expect(NAV_COLUMN.iconRow).toBe(CARDS_SHELL.height)
    expect(iconRowStyle().height).toBe(CARDS_SHELL.height + 'px')
  })

  it('stays a rounded rectangle, not a circle', () => {
    // A pill or a circle is the FAB this was explicitly not allowed to become.
    expect(CARDS_SHELL.radius).toBeLessThan(CARDS_SHELL.height / 2)
  })

  it('is a neutral surface step at rest, and the same size in both states', () => {
    const rest = cardsShellStyle({ active: false, accentHex: '#B83A24' })
    const on = cardsShellStyle({ active: true, accentHex: '#B83A24' })
    expect(rest.background).toContain('var(--surface-2)')
    expect(rest.background).not.toContain('#B83A24')
    expect(rest.border).toBe('1px solid transparent')
    expect(rest.boxSizing).toBe('border-box')
    expect(on.width).toBe(rest.width)
    expect(on.height).toBe(rest.height)
  })

  it('lands the resting container at the step device QA approved', () => {
    // It was a flat --surface-2 for one build and read as a second selected tab.
    // Mixing with `transparent` mixes the ALPHA, so this is a fraction of the
    // composite delta against the tray's ground — in both themes, from one number,
    // with no second colour to keep in step.
    //
    // 30% and not the original 55%: the 55% was calibrated against the old
    // translucent bar and composited to 5.5/255. On the opaque tray the same
    // declaration lands at 10.5, so the percentage moved to keep the RENDERED
    // value where the device review left it. nav-bar.spec.js measures the
    // composite and caps it at 9, which is what caught this.
    const rest = cardsShellStyle({ active: false, accentHex: '#B83A24' })
    expect(rest.background).toBe('color-mix(in srgb, var(--surface-2) 30%, transparent)')
    const pct = Number(/ (\d+)%/.exec(rest.background)[1])
    // 30% of the #FFFFFF→#F5F1EC step is 5.7/255; the band is what keeps it
    // present at all (>3) and quieter than the ~13 that failed on a device (<8).
    expect(pct * 19 / 100).toBeGreaterThan(3)
    expect(pct * 19 / 100).toBeLessThan(8)
  })

  it('keeps the two states unmistakable — hue, strength and edge all differ', () => {
    const rest = cardsShellStyle({ active: false, accentHex: '#B83A24' })
    const on = cardsShellStyle({ active: true, accentHex: '#B83A24' })
    // Hue: neutral token vs the accent.
    expect(rest.background).not.toBe(on.background)
    expect(on.background).toContain('#B83A24')
    expect(rest.background).toContain('var(--surface-2)')
    // Edge: only the selected one is drawn.
    expect(rest.border).not.toBe(on.border)
    expect(on.border).toContain('#B83A24')
    // Strength: the resting one is the only one that is part transparent.
    expect(rest.background).toContain('transparent')
    expect(on.background).not.toContain('transparent')
  })

  it('mixes the accent into a surface when active, never an alpha hex over it', () => {
    const on = cardsShellStyle({ active: true, accentHex: '#B83A24' })
    // CLAUDE.md §5: `accent + '14'` stays light in dark mode; a color-mix into
    // var(--surface) is what themes.
    expect(on.background).toBe('color-mix(in srgb, #B83A24 12%, var(--surface))')
    expect(on.border).toBe('1px solid color-mix(in srgb, #B83A24 26%, var(--surface))')
    expect(on.background).not.toMatch(/#B83A24[0-9A-Fa-f]{2}/)
  })

  it('keeps the tint restrained — a tint, not a block', () => {
    const pct = Number(/ (\d+)%/.exec(cardsShellStyle({ active: true, accentHex: '#B83A24' }).background)[1])
    expect(pct).toBeLessThanOrEqual(16)
  })
})

describe('the icon hierarchy', () => {
  it('makes Cards the largest and More the smallest', () => {
    const sizes = Object.values(NAV_ICON_PX)
    expect(NAV_ICON_PX.study).toBe(Math.max(...sizes))
    expect(NAV_ICON_PX.more).toBe(Math.min(...sizes))
  })

  it('is a gentle ramp, because the glyphs are now all one weight', () => {
    // The flat family needed 27.5 against 20–22 — a 1.89x area ratio — to make
    // Cards win, because its Practice grid out-inked its Cards glyph. The
    // dimensional family is drawn to one weight, so the ramp only has to express
    // hierarchy and not correct for the drawings.
    const sizes = Object.values(NAV_ICON_PX)
    const area = n => n * n
    const spread = area(Math.max(...sizes)) / area(Math.min(...sizes))
    expect(spread).toBeLessThan(1.6)
    // Ordered: Cards, then Stories, then the Practice/Home pair, then More.
    expect(NAV_ICON_PX.study).toBeGreaterThan(NAV_ICON_PX.stories)
    expect(NAV_ICON_PX.stories).toBeGreaterThan(NAV_ICON_PX.practice)
    expect(NAV_ICON_PX.practice).toBeGreaterThanOrEqual(NAV_ICON_PX.home)
    expect(NAV_ICON_PX.home).toBeGreaterThan(NAV_ICON_PX.more)
    // And no glyph is drawn bigger than the row it sits in.
    for (const key of Object.keys(NAV_ICON_PX)) {
      expect(NAV_ICON_PX[key], key).toBeLessThanOrEqual(NAV_COLUMN.iconRow)
    }
  })

  it('is whole pixels, so every glyph centres on the same line', () => {
    // Practice was 23.5 for one commit and CI caught what the local browser did
    // not: an odd half-pixel cannot be centred symmetrically in a 34px row, so the
    // box snaps to one side of the device-pixel grid and that glyph's centre drifts
    // an eighth of a pixel off the other four. Invisible, and still wrong — "every
    // icon on one centre line" has been true since P8 and should not need a
    // tolerance to stay true.
    for (const [key, px] of Object.entries(NAV_ICON_PX)) {
      expect(Number.isInteger(px), key + ' is ' + px).toBe(true)
    }
  })

  it('falls back to the reference size for an unknown tab', () => {
    expect(navIconPx('nope')).toBe(NAV_ICON_PX.home)
    expect(navIconPx('study')).toBe(26)
    expect(navIconPx('practice')).toBe(23)
  })
})

describe('the tray', () => {
  it('is inset from both edges and floats clear of the bottom', () => {
    const t = navTrayStyle()
    expect(t.position).toBe('fixed')
    expect(t.left).toBe(NAV_TRAY_INSET + 'px')
    expect(t.right).toBe(t.left)
    expect(NAV_TRAY_INSET).toBeGreaterThanOrEqual(10)
    expect(NAV_TRAY_INSET).toBeLessThanOrEqual(14)
    // The safe-area decision: the tray's bottom edge lands on the safe-area
    // boundary, with a float floor for devices that have no inset. `max`, never
    // a sum — a sum lifts the tray 40px on a modern iPhone.
    expect(t.bottom).toBe(NAV_TRAY_BOTTOM)
    expect(t.bottom).toBe('max(' + NAV_TRAY_FLOAT + 'px, env(safe-area-inset-bottom))')
    expect(t.bottom).not.toContain('+')
  })

  it('is rounded on all four corners, from the scale', () => {
    const t = navTrayStyle()
    // One radius, so all four corners are the same — the old bar had none.
    expect(t.borderRadius).toBe(RADIUS[NAV_TRAY_RADIUS_NAME] + 'px')
    expect(Object.keys(RADIUS)).toContain(NAV_TRAY_RADIUS_NAME)
    // Not a pill: half the tray's height would make it one.
    expect(RADIUS[NAV_TRAY_RADIUS_NAME]).toBeLessThan(MOBILE_NAV_HEIGHT / 2)
    expect(RADIUS[NAV_TRAY_RADIUS_NAME]).toBeGreaterThanOrEqual(16)
  })

  it('is solid, not glass, and carries no blur', () => {
    const t = navTrayStyle()
    expect(t.background).toBe('var(--surface)')
    expect(t.backdropFilter).toBeUndefined()
    expect(JSON.stringify(t)).not.toContain('glass')
    expect(JSON.stringify(t)).not.toContain('blur')
  })

  it('has an edge, a modest elevation and a lit top, all from tokens', () => {
    const t = navTrayStyle()
    expect(t.border).toBe('1px solid var(--border)')
    // `floating`, not `sheet`: there is page ground under the tray for it to cast
    // onto now, and `sheet` points the other way.
    expect(t.boxShadow).toContain(ELEVATION.floating)
    expect(t.boxShadow).not.toContain(ELEVATION.sheet)
    // The dark-mode answer: a black shadow on a near-black page does nothing, so
    // the top edge catches light instead.
    expect(t.boxShadow).toContain('inset 0 1px 0 var(--inset-highlight)')
    // No hardcoded rgba anywhere in it (CLAUDE.md §5) — it has to theme.
    expect(t.boxShadow).not.toMatch(/rgba?\(/)
  })

  it('never lets a tab paint over its corners', () => {
    expect(navTrayStyle().overflow).toBe('hidden')
  })

  it('claims the tray plus its float, and says so in one place', () => {
    expect(MOBILE_NAV_RESERVE).toBe(MOBILE_NAV_HEIGHT + NAV_TRAY_FLOAT)
    expect(MOBILE_NAV_SPACE).toBe('calc(' + MOBILE_NAV_HEIGHT + 'px + ' + NAV_TRAY_BOTTOM + ')')
    // The reservation is what keeps a 667px phone in studyLayout's `compact`
    // band: 667 − 66 = 601 against a COMPACT_MIN of 600. At a float of 8 it
    // would be 599 and Study would visibly change density.
    expect(667 - MOBILE_NAV_RESERVE).toBeGreaterThanOrEqual(600)
  })

  it('leaves every tab a real target at the narrowest phone', () => {
    // Five equal columns inside the tray's content box.
    const column = (320 - 2 * NAV_TRAY_INSET - 2) / 5
    expect(column).toBeGreaterThanOrEqual(44)
    // And the tab is as tall as the tray minus its borders.
    expect(MOBILE_NAV_HEIGHT - 2).toBeGreaterThanOrEqual(44)
  })
})
