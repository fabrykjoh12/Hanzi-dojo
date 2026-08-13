/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { heroGround, heroShadow, ON_HERO } from './designTokens'
import { HeroPanel, HeroAction } from './panels'

// P14-5 gave HOME a new hero material — a three-stop per-theme ground, a lit top
// edge, and an opaque paper CTA. Four screens draw a hero and three of them are
// frozen, so the material is opt-in through a `material` prop.
//
// It shipped without that seam on heroGround/heroShadow/HeroAction, which
// restyled Stories, Practice and Profile as a side effect of redesigning Home.
// CI caught it as an 8,168-pixel diff on the `stories-shelf-mobile` baseline —
// the baseline was right and the code was wrong. These tests are what would have
// caught it here, in 40ms, instead of eleven minutes into an E2E run.
//
// When a later phase moves those screens onto the new material, DELETE the
// default branch rather than adding a third: two materials are a migration, three
// are a mess.

afterEach(cleanup)

const ACCENT = '#B83A24'

describe('heroGround — the ground is opt-in', () => {
  it('defaults to the pre-P14-5 two-stop ground, byte for byte', () => {
    // Not "looks similar": this string is what the committed visual baselines of
    // every frozen hero screen were captured against.
    expect(heroGround(ACCENT)).toBe(`linear-gradient(160deg,
    color-mix(in srgb, ${ACCENT} 88%, #17110E) 0%,
    color-mix(in srgb, ${ACCENT} 70%, #17110E) 100%)`)
  })

  it('gives the new material only to a caller that asks for it', () => {
    const facet = heroGround(ACCENT, 'facet')
    expect(facet).toContain('158deg')
    expect(facet).toContain('var(--hero-lift-pct)')
    expect(facet).toContain('var(--hero-depth)')
    // Three stops, not two — the bright end, the true-colour middle, the shade.
    // Six color-mix() calls: each stop mixes the hue toward the depth, and the
    // hue is itself a mix (accent → --hero-lift), inlined once per stop.
    expect(facet.match(/color-mix/g)).toHaveLength(6)
    // The three stop offsets: bright corner, true-colour middle, shaded far end.
    expect(facet).toContain(') 0%,')
    expect(facet).toContain(') 52%,')
    expect(facet).toContain(') 100%)')
  })

  it('treats any unknown material as the frozen default rather than the new one', () => {
    // A typo must fail SAFE: it may not restyle a frozen screen.
    expect(heroGround(ACCENT, 'lacquer')).toBe(heroGround(ACCENT))
  })
})

describe('heroShadow — the lit top edge is opt-in too', () => {
  it('casts no inset edge by default, at rest or lifted', () => {
    expect(heroShadow(ACCENT)).not.toContain('inset')
    expect(heroShadow(ACCENT, true)).not.toContain('inset')
  })

  it('adds the edge for the facet material, keeping the same cast shadow', () => {
    expect(heroShadow(ACCENT, false, 'facet'))
      .toBe(heroShadow(ACCENT) + ', inset 0 1px 0 ' + ON_HERO.litEdge)
    expect(heroShadow(ACCENT, true, 'facet'))
      .toBe(heroShadow(ACCENT, true) + ', inset 0 1px 0 ' + ON_HERO.litEdge)
  })
})

describe('HeroPanel — what a frozen screen renders', () => {
  it('keeps the ink wash and the two-stop ground when no material is asked for', () => {
    const { container } = render(
      <HeroPanel accentHex={ACCENT} seed="stories" watermark="汉">text</HeroPanel>
    )
    const panel = container.firstChild
    expect(panel.style.background).toContain('160deg')
    expect(panel.style.boxShadow).not.toContain('inset')
    // The wash is the atmosphere those screens still have.
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('swaps ground, edge and atmosphere together for the facet material', () => {
    const { container } = render(
      <HeroPanel accentHex={ACCENT} material="facet" object={<i data-object="" />}>text</HeroPanel>
    )
    const panel = container.firstChild
    expect(panel.style.background).toContain('158deg')
    expect(panel.style.boxShadow).toContain('inset 0 1px 0')
    expect(container.querySelector('[data-object]')).not.toBeNull()
  })

  it('drops the watermark only for the screen that has an object instead', () => {
    const wash = render(<HeroPanel accentHex={ACCENT} watermark="汉">t</HeroPanel>)
    expect(wash.container.textContent).toContain('汉')
    cleanup()
    const facet = render(
      <HeroPanel accentHex={ACCENT} material="facet" watermark="汉" object={<i />}>t</HeroPanel>
    )
    expect(facet.container.textContent).not.toContain('汉')
  })
})

describe('HeroAction — the CTA is the same seam', () => {
  it('is still the translucent pill everywhere it has not been redesigned', () => {
    const { container } = render(<HeroAction label="Read" accentHex={ACCENT} />)
    const cta = container.firstChild
    expect(cta.style.background).toBe('rgba(255, 255, 255, 0.14)')
    expect(cta.style.marginTop).toBe('18px')
    expect(cta.style.height).toBe('')
  })

  it('inverts on hover in that state, because that is all it ever had', () => {
    const { container } = render(<HeroAction label="Read" accentHex={ACCENT} hovered />)
    expect(container.firstChild.style.background).toBe('rgb(255, 255, 255)')
  })

  it('is opaque paper at 44px for the screen that asked for paper', () => {
    const { container } = render(<HeroAction label="Study" accentHex={ACCENT} material="paper" />)
    const cta = container.firstChild
    expect(cta.style.background).toBe('rgb(255, 255, 255)')
    expect(cta.style.height).toBe('44px')
    // No hover needed to read it — that was the whole point on a phone.
    expect(cta.style.color).toBe('rgb(184, 58, 36)')
  })

  it('does not depend on hover for its paper state', () => {
    const rest = render(<HeroAction label="Study" accentHex={ACCENT} material="paper" />)
    const restStyle = rest.container.firstChild.getAttribute('style')
    cleanup()
    const hover = render(<HeroAction label="Study" accentHex={ACCENT} material="paper" hovered />)
    expect(hover.container.firstChild.getAttribute('style')).toBe(restStyle)
  })
})
