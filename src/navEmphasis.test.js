import { describe, it, expect } from 'vitest'
import { MOBILE_NAV_HEIGHT } from './navMetrics'
import {
  NAV_ICON_PX, CARDS_SHELL, NAV_COLUMN,
  navIconPx, navColumnHeight, navColumnFits, iconRowStyle, cardsShellStyle,
} from './navEmphasis'

// The bar's hierarchy is arithmetic, so it can be asserted. What these specs are
// really protecting is the flashcard: every pixel the bar takes is a pixel
// `studyLayout` cannot give the card, and a container is exactly the kind of
// change that grows a bar by four pixels and nobody notices for a build.

describe('the column fits inside the bar', () => {
  it('costs less than the bar minus its own border', () => {
    // 3.5 + 34 + 2 + 13 + 3.5 = 56, inside 58 − 1.
    expect(navColumnHeight()).toBe(56)
    expect(navColumnFits()).toBe(true)
    expect(navColumnHeight()).toBeLessThanOrEqual(MOBILE_NAV_HEIGHT - 1)
  })

  it('does not change the bar height to make room for the container', () => {
    // The number the whole P8 geometry pass settled. If a redesign needs it to
    // move, that is a decision, not a side effect.
    expect(MOBILE_NAV_HEIGHT).toBe(58)
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
    expect(rest.background).toBe('var(--surface-2)')
    expect(rest.border).toBe('1px solid transparent')
    expect(rest.boxSizing).toBe('border-box')
    expect(on.width).toBe(rest.width)
    expect(on.height).toBe(rest.height)
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

  it('puts Cards in the 27–28px band the brief asked for, and the peers at 20–22', () => {
    expect(NAV_ICON_PX.study).toBeGreaterThanOrEqual(27)
    expect(NAV_ICON_PX.study).toBeLessThanOrEqual(28)
    for (const key of ['practice', 'home', 'stories', 'more']) {
      expect(NAV_ICON_PX[key], key).toBeGreaterThanOrEqual(20)
      expect(NAV_ICON_PX[key], key).toBeLessThanOrEqual(22)
    }
  })

  it('holds Home and Stories at the same reference weight', () => {
    expect(NAV_ICON_PX.home).toBe(NAV_ICON_PX.stories)
  })

  it('keeps Practice below the reference pair', () => {
    // Optical size, not CSS size: Practice is four forms, so it also draws with
    // a lighter stroke and smaller tiles (NavIcons.jsx). This assertion is only
    // the half of it that is a number here.
    expect(NAV_ICON_PX.practice).toBeLessThan(NAV_ICON_PX.home)
  })

  it('falls back to the reference size for an unknown tab', () => {
    expect(navIconPx('nope')).toBe(NAV_ICON_PX.home)
    expect(navIconPx('study')).toBe(27.5)
  })
})
