import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  RADIUS, RADIUS_NAMES, radius,
  ELEVATION, ELEVATION_NAMES,
  SURFACE, SURFACE_NAMES, surface,
} from './shape'
import { TYPE, CONTENT_TYPE, TYPE_ROLES, WEIGHT, NUMERIC, UI_SIZES } from './typeScale'

// The systems that replace 16 radii, 13 shadows and 60 type styles. These specs
// are mostly about SIZE — a scale with twelve entries is not a scale, and the
// only way that stays true is if adding one costs a failing test.

describe('the radius scale', () => {
  it('is five values and no more', () => {
    expect(RADIUS_NAMES).toEqual(['sm', 'control', 'card', 'hero', 'pill'])
  })

  it('ascends, so the names mean something', () => {
    const v = RADIUS_NAMES.map(n => RADIUS[n])
    for (let i = 1; i < v.length; i += 1) expect(v[i]).toBeGreaterThan(v[i - 1])
  })

  it('keeps the one relationship the app already had right', () => {
    // The study card (26) and its grade buttons (12) are the best-resolved pair
    // in the app. The scale is built outward from them rather than over them.
    expect(RADIUS.hero).toBe(26)
    expect(RADIUS.control).toBe(12)
  })

  it('renders px, and the pill as a pill', () => {
    expect(radius('sm')).toBe('8px')
    expect(radius('card')).toBe('18px')
    expect(radius('pill')).toBe('999px')
  })

  it('returns null for a name it does not have, rather than 0px', () => {
    // A silent 0 would be a square corner nobody asked for.
    for (const bad of ['medium', 'large', '', null, undefined, 14]) {
      expect(radius(bad)).toBe(null)
    }
  })

  it('drops every arbitrary radius the census found', () => {
    // 3, 9, 10, 11, 13, 14, 15, 16, 20, 22 and 50 were all in use. None of them
    // survives as a named value.
    const kept = RADIUS_NAMES.map(n => RADIUS[n])
    for (const gone of [3, 9, 10, 11, 13, 14, 15, 16, 20, 22, 50]) {
      expect(kept, gone + 'px is back in the scale').not.toContain(gone)
    }
  })
})

describe('elevation', () => {
  it('is three heights plus one direction, and "flat" is one of them', () => {
    // Naming "none" is the point: no shadow becomes a decision somebody made
    // rather than something nobody got round to.
    //
    // `sheet` is not a fourth height. It is `floating` cast UPWARD, for the five
    // bottom sheets whose hand-rolled inverted shadows P14-2 replaced — every one
    // of which was a hardcoded neutral rgba, invisible on the dark ground.
    expect(ELEVATION_NAMES).toEqual(['flat', 'raised', 'floating', 'sheet'])
    expect(ELEVATION.flat).toBe('none')
  })

  it('defers every real value to CSS, because they differ per theme', () => {
    // A dark surface needs far more shadow opacity to read at all. Hardcoding a
    // shadow in JS is how a card ends up invisible in one theme.
    expect(ELEVATION.raised).toBe('var(--shadow-1)')
    expect(ELEVATION.floating).toBe('var(--shadow-2)')
    expect(ELEVATION.sheet).toBe('var(--shadow-sheet)')
    for (const name of ELEVATION_NAMES) {
      if (name === 'flat') continue
      expect(ELEVATION[name], name).toMatch(/^var\(--shadow-[a-z0-9]+\)$/)
    }
  })

  it('casts the sheet upward and the others downward', () => {
    // The whole reason it exists — asserted against index.css so a future edit
    // that "tidies" the negative offsets away fails here.
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
    const sheet = css.match(/--shadow-sheet:\s*([^;]+);/)
    expect(sheet, '--shadow-sheet is not declared').toBeTruthy()
    expect(sheet[1]).toContain('0 -')
    const one = css.match(/--shadow-1:\s*([^;]+);/)
    expect(one[1]).not.toContain('0 -')
  })
})

describe('surface levels', () => {
  it('is four, in order of how much they claim', () => {
    expect(SURFACE_NAMES).toEqual(['page', 'grouped', 'raised', 'floating'])
  })

  it('gives page and grouped no border and no shadow', () => {
    // The whole point of `grouped`: a run of rows sharing a ground, so each row
    // does not need its own box. A border here would defeat it.
    for (const level of ['page', 'grouped']) {
      expect(SURFACE[level].border).toBe(undefined)
      expect(SURFACE[level].boxShadow).toBe(undefined)
    }
  })

  it('makes only raised and floating draw an edge — the "one object" promise', () => {
    for (const level of ['raised', 'floating']) {
      expect(SURFACE[level].border).toBe('1px solid var(--border)')
      expect(SURFACE[level].boxShadow).toMatch(/^var\(--shadow-[12]\)$/)
    }
  })

  it('composes a level and a radius into one style object', () => {
    expect(surface('raised', 'card')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-1)',
      borderRadius: '18px',
    })
    expect(surface('page', 'sm').borderRadius).toBe('8px')
  })

  it('refuses an unknown level rather than returning a bare object', () => {
    for (const bad of ['card', 'panel', '', null]) expect(surface(bad)).toBe(null)
  })

  it('uses only semantic tokens — never a hardcoded neutral', () => {
    // CLAUDE.md §5: a hardcoded neutral hex is a bug, because it will not theme.
    const json = JSON.stringify(SURFACE)
    expect(json).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    expect(json).not.toMatch(/rgba?\(/)
  })
})

describe('the type scale', () => {
  it('is twelve UI roles', () => {
    expect(TYPE_ROLES).toEqual([
      'display', 'titleScreen', 'titleSection', 'titleCard',
      'body', 'bodySecondary', 'label', 'caption', 'eyebrow',
    ])
    // Nine UI roles plus three content roles is the twelve the doc promised.
    expect(TYPE_ROLES.length + Object.keys(CONTENT_TYPE).length).toBe(13)
  })

  it('uses four weights, not ten', () => {
    // The census found 400, 500, 550, 600, 650, 700, 750, 800, 820 and 850.
    // 550 and 820 are not visible differences; they are maintenance.
    expect(Object.values(WEIGHT).sort((a, b) => a - b)).toEqual([400, 600, 700, 800])
    const used = new Set(TYPE_ROLES.map(r => TYPE[r].fontWeight))
    for (const w of used) {
      expect([400, 600, 700, 800], w + ' is not one of the four weights').toContain(w)
    }
  })

  it('uses eight UI sizes, and declares them', () => {
    const sizes = [...new Set(TYPE_ROLES.map(r => parseFloat(TYPE[r].fontSize)))].sort((a, b) => a - b)
    expect(sizes).toEqual(UI_SIZES)
    expect(sizes.length).toBeLessThanOrEqual(9)
  })

  it('gives every role a size, a weight and a line height', () => {
    for (const r of TYPE_ROLES) {
      expect(TYPE[r].fontSize, r).toMatch(/px$/)
      expect(typeof TYPE[r].fontWeight, r).toBe('number')
      expect(typeof TYPE[r].lineHeight, r).toBe('number')
    }
  })

  it('descends in size, so the role names describe the hierarchy', () => {
    const order = ['display', 'titleScreen', 'titleSection', 'titleCard']
    const sizes = order.map(r => parseFloat(TYPE[r].fontSize))
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i]).toBeLessThan(sizes[i - 1])
  })

  it('keeps the eyebrow exactly as it already was', () => {
    // designTokens.MICRO works and is used everywhere; this is the same style
    // with a place in the scale, not a redesign of it.
    expect(TYPE.eyebrow.fontSize).toBe('10.5px')
    expect(TYPE.eyebrow.fontWeight).toBe(800)
    expect(TYPE.eyebrow.letterSpacing).toBe('0.14em')
    expect(TYPE.eyebrow.textTransform).toBe('uppercase')
  })

  it('keeps NUMERIC a modifier, not a role', () => {
    // It carries no size: a number is whatever size its context is, in tabular
    // figures so a column cannot jitter.
    expect(NUMERIC.fontVariantNumeric).toBe('tabular-nums')
    expect(NUMERIC.fontSize).toBe(undefined)
  })

  it('carries no colour and no font family in any role', () => {
    // Colour is semantic and per-theme; family is per-language (CLAUDE.md §1).
    // A scale that hardcoded either would have to be forked per language.
    const json = JSON.stringify({ ...TYPE, ...CONTENT_TYPE })
    expect(json).not.toContain('color')
    expect(json).not.toContain('fontFamily')
    expect(json).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
  })
})
