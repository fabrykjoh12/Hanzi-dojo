/**
 * @vitest-environment jsdom
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  NAV_GLYPHS, IDENTITY_GLYPHS, ALL_GLYPHS, GLYPH_SIZES, NAV_GLYPH_PX, navGlyphPx,
} from './navGlyphFamily'
import {
  HomeGlyph, StoriesGlyph, CardsGlyph, PracticeGlyph, MoreGlyph, ProfileGlyph,
} from './navGlyphs'
import { NAV_ICON_PX } from './navEmphasis'

// What the P14-3 family DECLARES. jsdom has no layout and no SVG geometry engine,
// so everything here is a statement about the markup: six glyphs across two sets,
// one viewBox, two states, no raster, no colour that is not a token, nothing
// focusable.
//
// The geometry claims — nothing escapes the viewBox, active and inactive share a
// bounding box, the family's ink is balanced — need `getBBox()` and a canvas, and
// live in tests/e2e/nav-glyphs.spec.js.

// Resolved from the project root, not from `import.meta.url`: this file runs in
// jsdom, where `import.meta.url` is an http:// URL and `new URL(…)` hands
// readFileSync something it refuses. Vitest's cwd is the repo root.
const SRC = fs.readFileSync(path.resolve('src/navGlyphs.jsx'), 'utf8')
// The production bar, in shipping order. Cards is `study` and it is CENTRED — this
// list is the bar, not a proposal about it.
const NAV_KEYS = ['home', 'stories', 'study', 'practice', 'more']

function svgOf(ui) {
  const { container } = render(ui)
  const svg = container.querySelector('svg')
  expect(svg).toBeTruthy()
  return svg
}

describe('the family', () => {
  it('covers the production bar, in shipping order', () => {
    expect(NAV_GLYPHS.map(g => g.key)).toEqual(NAV_KEYS)
    // `study`, not `cards` — the key is the app's view key (navConfig.js), and a
    // rename here would silently unhook the tab it belongs to.
    expect(NAV_GLYPHS.every(g => typeof g.Glyph === 'function')).toBe(true)
    expect(NAV_GLYPHS.every(g => typeof g.label === 'string' && g.label.length > 0)).toBe(true)
    expect(NAV_GLYPHS.map(g => g.label)).toEqual(['Home', 'Stories', 'Cards', 'Practice', 'More'])
  })

  it('keeps Profile OUT of the navigation set', () => {
    // The whole point of the split. Profile is reached the way it is reached today;
    // installing it as a tab would mean removing More, which is a navigation
    // change. A tray mapping over NAV_GLYPHS must not be able to pick it up.
    expect(NAV_GLYPHS.map(g => g.key)).not.toContain('profile')
    expect(IDENTITY_GLYPHS.map(g => g.key)).toEqual(['profile'])
    expect(NAV_GLYPHS.some(g => g.Glyph === ProfileGlyph)).toBe(false)
    expect(ALL_GLYPHS).toHaveLength(6)
  })

  it('exports exactly the six components the two sets list', () => {
    const named = [HomeGlyph, StoriesGlyph, CardsGlyph, PracticeGlyph, MoreGlyph, ProfileGlyph]
    const byName = (a, b) => a.name.localeCompare(b.name)
    expect(ALL_GLYPHS.map(g => g.Glyph).sort(byName)).toEqual(named.sort(byName))
  })

  it('has a nav size for every tab and none for Profile', () => {
    // The ramp lived in navGlyphFamily as a recommendation for one commit; P14-4
    // adopted it, so navEmphasis.NAV_ICON_PX is the single copy and this module
    // re-exports it. Profile is not a tab, so it has no nav size.
    for (const key of NAV_KEYS) {
      expect(NAV_GLYPH_PX[key], key + ' has no nav size').toBeGreaterThan(0)
      expect(navGlyphPx(key)).toBe(NAV_GLYPH_PX[key])
    }
    expect(NAV_GLYPH_PX.profile).toBeUndefined()
    expect(NAV_GLYPH_PX).toBe(NAV_ICON_PX)
  })

  it('draws every glyph in both states at every size', () => {
    for (const { key, Glyph } of ALL_GLYPHS) {
      for (const size of GLYPH_SIZES) {
        for (const active of [false, true]) {
          const svg = svgOf(<Glyph size={size} active={active} />)
          expect(svg.getAttribute('width'), key).toBe(String(size))
          expect(svg.getAttribute('height'), key).toBe(String(size))
          // Something was actually drawn, in both states.
          expect(svg.querySelectorAll('path, rect, circle').length, key).toBeGreaterThan(1)
        }
      }
    }
  })

  it('shares one viewBox across the family, both states and every size', () => {
    const seen = new Set()
    for (const { Glyph } of ALL_GLYPHS) {
      for (const size of GLYPH_SIZES) {
        for (const active of [false, true]) {
          seen.add(svgOf(<Glyph size={size} active={active} />).getAttribute('viewBox'))
        }
      }
    }
    // One box for the whole family — optical size is a property of the drawing,
    // not of the size prop.
    expect([...seen]).toEqual(['0 0 32 32'])
  })

  it('renders a different treatment when selected, from the same silhouette', () => {
    for (const { key, Glyph } of ALL_GLYPHS) {
      const off = svgOf(<Glyph active={false} />).innerHTML
      const on = svgOf(<Glyph active />).innerHTML
      expect(off, key + ' looks identical selected').not.toBe(on)
      // The selected state paints tones; the resting state paints one colour.
      expect(on, key + ' has no tones').toMatch(/var\(--primary/)
    }
  })

  it('keeps the resting glyph in whatever colour it is handed', () => {
    for (const { key, Glyph } of ALL_GLYPHS) {
      const svg = svgOf(<Glyph active={false} color="var(--text-muted)" />)
      expect(svg.innerHTML, key).toContain('var(--text-muted)')
      // And the default is inheritable, so a bar can colour a whole column.
      expect(svgOf(<Glyph active={false} />).innerHTML, key).toContain('currentColor')
    }
  })
})

describe('accessibility', () => {
  it('never announces itself and never takes focus', () => {
    // The navigation's label is the accessible name (navConfig.js). A glyph with
    // its own title would read the destination twice, and a focusable <svg> is an
    // extra tab stop between every pair of tabs.
    for (const { key, Glyph } of ALL_GLYPHS) {
      for (const active of [false, true]) {
        const svg = svgOf(<Glyph active={active} />)
        expect(svg.getAttribute('aria-hidden'), key).toBe('true')
        expect(svg.getAttribute('focusable'), key).toBe('false')
        expect(svg.hasAttribute('tabindex'), key).toBe(false)
        expect(svg.querySelector('title, desc'), key).toBeNull()
      }
    }
  })
})

describe('the source rules', () => {
  it('embeds no raster and reaches for no network', () => {
    expect(SRC).not.toMatch(/<image\b/)
    expect(SRC).not.toMatch(/xlink:href|href=["']http/)
    expect(SRC).not.toMatch(/data:image/)
    // A CDN font or an <img> in a nav icon is a frame the bar cannot afford, and
    // hanzi-writer's runtime character data is the app's ONE remote asset.
    expect(SRC).not.toMatch(/url\(\s*['"]?(https?:)?\/\//)
  })

  it('uses no colour that is not a token', () => {
    // The brief: no inline hardcoded colours that bypass the approved system. The
    // only literals allowed are the mask's own black and white, which are not
    // colours — they are "keep this" and "cut this".
    const fills = [...SRC.matchAll(/(?:fill|stroke)=(?:"([^"]*)"|\{([A-Z_]+)\})/g)]
      .map(m => m[1] ?? m[2])
    expect(fills.length).toBeGreaterThan(10)
    const MASK_SENTINELS = new Set(['#fff', '#000'])
    const TONES = new Set(['LIT', 'FACE', 'SHADE', 'PLUM'])
    for (const f of fills) {
      if (f === 'none' || MASK_SENTINELS.has(f) || TONES.has(f)) continue
      expect(f, 'literal colour in navGlyphs.jsx').toMatch(/^(currentColor|var\(--[a-z-]+\))$/)
    }
    // And every tone name resolves to a token, never to a hex.
    for (const m of SRC.matchAll(/^const (LIT|FACE|SHADE|PLUM) = (.+)$/gm)) {
      expect(m[2], m[1]).toMatch(/^'var\(--[a-z-]+\)'/)
    }
  })

  it('draws no gradient and no blur', () => {
    // Rule 4: dimension comes from planes. A gradient at 20px is mud, and a
    // filter is a compositing cost on every scroll of every screen.
    // Matched on markup, not prose — the file's own comments explain WHY there
    // is no gradient, so a bare /gradient/ would fail on the explanation.
    expect(SRC).not.toMatch(/<(linear|radial)Gradient|filter=|feGaussian|<filter\b/)
  })

  it('branches on `active` exactly once', () => {
    // Rule 3 is only true if there is one place it CAN be broken. Five glyphs each
    // deciding what "selected" means is how a family drifts.
    const branches = [...SRC.matchAll(/\bactive\s*\?/g)]
    expect(branches.length).toBe(1)
  })
})

describe('the sizes the bar can ask for', () => {
  it('covers the current bar’s whole range', () => {
    // NAV_ICON_PX runs 20 (More) to 27.5 (Cards). The gallery has to bracket it or
    // it is not evidence about the bar.
    expect(Math.min(...GLYPH_SIZES)).toBeLessThanOrEqual(20)
    expect(Math.max(...GLYPH_SIZES)).toBeGreaterThanOrEqual(28)
  })

  it('accepts a fractional size without rounding it', () => {
    // 23.5 is a real value on the bar (Practice), and the tray hands it straight
    // to the glyph.
    expect(svgOf(<PracticeGlyph size={23.5} active />).getAttribute('width')).toBe('23.5')
    expect(svgOf(<CardsGlyph size={26} active />).getAttribute('width')).toBe('26')
  })

  it('brackets the ramp the bar actually uses', () => {
    const wanted = Object.values(NAV_ICON_PX)
    expect(Math.min(...GLYPH_SIZES)).toBeLessThanOrEqual(Math.min(...wanted))
    expect(Math.max(...GLYPH_SIZES)).toBeGreaterThanOrEqual(Math.max(...wanted))
  })
})
