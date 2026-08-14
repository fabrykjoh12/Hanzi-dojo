import { describe, it, expect } from 'vitest'
import {
  HOME_FONT_STACK, HOME_RADIUS, HERO_CTA, HERO_GRAIN_OPACITY,
  FLASHCARD_SHEETS, FLASHCARD_FRONT, FLASHCARD_INK, FLASHCARD_BOX,
  heroCtaShadow, heroCornerLight, heroFarShade,
} from './homeHeroTokens'
import { RADIUS } from './shape'
import { TAP_MIN } from './controlTokens'

describe('the type stack', () => {
  it('leads with Mona and falls through to the face the rest of the app uses', () => {
    // Cyrillic has no Mona subset, so a frozen track's Home must land on Inter
    // rather than on a system default.
    expect(HOME_FONT_STACK.indexOf('Mona Sans')).toBeLessThan(HOME_FONT_STACK.indexOf('Inter'))
    expect(HOME_FONT_STACK).toContain('sans-serif')
  })

  it('does not name a CJK face — hanzi carry languageTheme(). font themselves', () => {
    expect(HOME_FONT_STACK).not.toContain('Noto')
  })
})

describe('the tighter shape pair', () => {
  it('is tighter than the app scale, and only by one step', () => {
    expect(HOME_RADIUS.control).toBeLessThan(RADIUS.control)
    expect(HOME_RADIUS.card).toBeLessThan(RADIUS.card)
    expect(RADIUS.control - HOME_RADIUS.control).toBeLessThanOrEqual(2)
    expect(RADIUS.card - HOME_RADIUS.card).toBeLessThanOrEqual(2)
  })

  it('leaves the app scale alone', () => {
    // The promotion sweep is its own phase. If someone edits shape.js to adopt
    // these, this spec is the reminder that every screen has to move with it.
    expect(RADIUS.control).toBe(12)
    expect(RADIUS.card).toBe(18)
  })
})

describe('the hero CTA', () => {
  it('sits in the approved height band and clears the tap floor', () => {
    expect(HERO_CTA.height).toBeGreaterThanOrEqual(50)
    expect(HERO_CTA.height).toBeLessThanOrEqual(52)
    expect(HERO_CTA.height).toBeGreaterThanOrEqual(TAP_MIN)
  })

  it('sets the arrow INTO the face — a keycap, not a circle', () => {
    // Sharing the button's radius minus its own inset is what makes it read as
    // part of the control. A pill here would be the pasted-in circle again.
    expect(HERO_CTA.arrowRadius).toBe(HOME_RADIUS.control - HERO_CTA.inset)
    expect(HERO_CTA.arrowRadius).toBeGreaterThan(0)
    expect(HERO_CTA.arrowWidth).toBeLessThan(HERO_CTA.height)
  })

  it('loses its cast shadow when pressed, and keeps its material', () => {
    const rest = heroCtaShadow()
    const pressed = heroCtaShadow({ pressed: true })
    expect(pressed).not.toBe(rest)
    // The soft cast is the part that goes.
    expect(rest).toContain('14px')
    expect(pressed).not.toContain('14px')
    // Both edges survive: paper keeps its thickness while it is held down.
    for (const shadow of [rest, pressed]) {
      expect(shadow).toContain('inset 0 -1px 0')
      expect(shadow).toContain('inset 0 1px 0 #fff')
    }
    // And the pressed state is genuinely shorter, not just different.
    expect(pressed.length).toBeLessThan(rest.length)
  })

  it('draws its shadow from the hero ramp, never a raw rgba grey', () => {
    // A generic near-black shadow is invisible on the red — the P14-2 finding.
    const rest = heroCtaShadow()
    expect(rest).toContain('rgba(23,17,14')
    expect(rest).not.toMatch(/rgba\(0,\s*0,\s*0/)
  })
})

describe('the panel material', () => {
  it('strengthens the corner with the same token twice, not a brighter one', () => {
    const light = heroCornerLight()
    const facet = 'rgba(255,255,255,0.16)'
    expect(light.split(facet).length - 1).toBe(2)
    expect(light).toContain('closest-side')
  })

  it('turns the far corner into shade', () => {
    expect(heroFarShade()).toContain('rgba(23,17,14')
    expect(heroFarShade()).toContain('at 100% 105%')
  })

  it('keeps the grain felt rather than seen', () => {
    // The device instruction is to REDUCE this if it ever reads as noise. A
    // ceiling here is what stops someone raising it instead.
    expect(HERO_GRAIN_OPACITY).toBeGreaterThan(0)
    expect(HERO_GRAIN_OPACITY).toBeLessThanOrEqual(0.05)
  })
})

describe('the flashcard object', () => {
  it('is two sheets and one solid front card', () => {
    expect(FLASHCARD_SHEETS).toHaveLength(2)
    expect(FLASHCARD_FRONT.w).toBeGreaterThan(FLASHCARD_SHEETS[0].w)
    expect(FLASHCARD_FRONT.w).toBeGreaterThan(FLASHCARD_SHEETS[1].w)
  })

  it('steps back through the hero ramp, deepest at the back', () => {
    expect(FLASHCARD_SHEETS[0].face).toBe('plane3')
    expect(FLASHCARD_SHEETS[1].face).toBe('plane2')
    // Only the middle sheet catches a lit edge; the furthest one is too deep in.
    expect(FLASHCARD_SHEETS[0].lit).toBeNull()
    expect(FLASHCARD_SHEETS[1].lit).toBe('plane1')
  })

  it('is asymmetrical in every dimension', () => {
    const tilts = [...FLASHCARD_SHEETS.map(s => s.tilt), FLASHCARD_FRONT.tilt]
    expect(new Set(tilts).size).toBe(tilts.length)
    expect(new Set(tilts.map(Math.abs)).size).toBe(tilts.length)
    // Front-most is lowest and left-most: the stack recedes up and to the right.
    expect(FLASHCARD_FRONT.y).toBeGreaterThan(FLASHCARD_SHEETS[1].y)
    expect(FLASHCARD_FRONT.x).toBeLessThan(FLASHCARD_SHEETS[1].x)
  })

  it('fits inside its own box', () => {
    for (const c of [...FLASHCARD_SHEETS, FLASHCARD_FRONT]) {
      expect(c.x + c.w).toBeLessThanOrEqual(FLASHCARD_BOX)
      expect(c.y + c.h).toBeLessThanOrEqual(FLASHCARD_BOX)
    }
  })

  it('prints in the brand ink on mixed paper, so it themes', () => {
    expect(FLASHCARD_INK.word).toBe('var(--primary-pressed)')
    // Every paper value is a mix, never `--surface`: that token is near-black in
    // dark mode and would turn the front card into a hole.
    for (const key of ['paper', 'edge', 'reading']) {
      expect(FLASHCARD_INK[key]).toContain('color-mix')
      expect(FLASHCARD_INK[key]).not.toContain('--surface')
    }
  })
})
