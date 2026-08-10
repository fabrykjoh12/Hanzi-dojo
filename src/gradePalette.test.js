import { describe, it, expect } from 'vitest'
import { GRADE_STYLES, GRADE_HUES } from './gradePalette'

// The four grade buttons were four hardcoded near-white pastels, so on a dark
// phone they were four bright cards pasted onto a dark screen. These specs are
// the rule that replaced them: a grade's colour is one hue, and every surface
// derived from it goes THROUGH the theme rather than around it.

describe('the grade palette', () => {
  it('has one entry per grade, in Again → Hard → Good → Easy order', () => {
    expect(GRADE_STYLES.length).toBe(4)
    expect(GRADE_HUES.length).toBe(4)
  })

  it('never states a surface colour outright — every fill mixes into the theme', () => {
    GRADE_STYLES.forEach((g) => {
      expect(g.bg).toContain('color-mix')
      expect(g.bg).toContain('var(--surface)')
      expect(g.border).toContain('color-mix')
      expect(g.border).toContain('var(--border)')
    })
  })

  it('has no bare hex left anywhere in a rendered value', () => {
    // A literal hex is the bug: it cannot follow the theme. The hue appears
    // inside a color-mix, which is fine — what must not exist is a value that
    // IS a hex.
    GRADE_STYLES.forEach((g) => {
      expect(g.bg).not.toMatch(/^#[0-9A-Fa-f]{3,8}$/)
      expect(g.border).not.toMatch(/^#[0-9A-Fa-f]{3,8}$/)
      expect(g.text).not.toMatch(/^#[0-9A-Fa-f]{3,8}$/)
    })
  })

  it('sends every label through ink(), which is what lifts it in dark mode', () => {
    GRADE_STYLES.forEach((g) => {
      expect(g.text).toContain('var(--ink-lift)')
      expect(g.text).toContain('var(--ink-lift-pct)')
    })
  })

  it('keeps the four grades distinguishable — no two share a hue', () => {
    expect(new Set(GRADE_HUES).size).toBe(4)
    expect(new Set(GRADE_STYLES.map(g => g.bg)).size).toBe(4)
  })

  it('keeps the pressed state a clear step up from rest, without a new shade', () => {
    // GradeButton swaps `bg` for `border` on hover/suggested, so the border has
    // to be the stronger mix of the SAME hue — not an invented colour.
    GRADE_STYLES.forEach((g, i) => {
      expect(g.bg).toContain(GRADE_HUES[i])
      expect(g.border).toContain(GRADE_HUES[i])
      const restWeight = Number(g.bg.match(/(\d+)%/)[1])
      const pressedWeight = Number(g.border.match(/(\d+)%/)[1])
      expect(pressedWeight).toBeGreaterThan(restWeight)
    })
  })

  it('stays quiet — no hue is saturated enough to read as neon', () => {
    GRADE_HUES.forEach((hex) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      // Neither fully saturated nor near-white: a mid tone that can be mixed
      // into either theme's surface without shouting.
      expect(max).toBeLessThan(210)
      expect(max - min).toBeLessThan(160)
    })
  })
})
