import { describe, expect, it } from 'vitest'
import { GENERIC_TINTS, TILE_VARIANTS, tileVariant, worldTint } from './storyArt'

describe('worldTint', () => {
  it('gives the app’s own worlds their curated tints', () => {
    expect(worldTint({ id: 'st-noodleshop-hsk1-ep01' })).toBe('#C98A3B')
    expect(worldTint({ id: 'st-inkbound-hsk3-ep03' })).toBe('#3B4368')
    expect(worldTint({ id: 'st-train-hsk2-ep01' })).toBe('#3E6E68')
    expect(worldTint({ id: 'st-upstairs-hsk3-ep01' })).toBe('#6E5A8C')
  })

  it('lands every other story deterministically on the designed wheel', () => {
    const tint = worldTint({ id: 'published-our-song' })
    expect(GENERIC_TINTS).toContain(tint)
    expect(worldTint({ id: 'published-our-song' })).toBe(tint)
  })

  it('never returns nothing', () => {
    expect(GENERIC_TINTS).toContain(worldTint(null))
    expect(GENERIC_TINTS).toContain(worldTint({}))
  })
})

describe('tileVariant', () => {
  it('is deterministic per story and always a known family member', () => {
    const variant = tileVariant({ id: 'published-our-song' })
    expect(TILE_VARIANTS).toContain(variant)
    expect(tileVariant({ id: 'published-our-song' })).toBe(variant)
    expect(TILE_VARIANTS).toContain(tileVariant(null))
  })

  it('spreads neighbouring stories across the family', () => {
    const variants = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => tileVariant({ id })),
    )
    expect(variants.size).toBeGreaterThan(1)
  })
})
