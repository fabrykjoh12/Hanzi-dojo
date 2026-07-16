import { describe, it, expect } from 'vitest'
import { clampPct, readingShareText, drawReadingCard } from './shareCard'

describe('clampPct', () => {
  it('rounds and clamps to 0..100', () => {
    expect(clampPct(81.6)).toBe(82)
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(140)).toBe(100)
  })
  it('is 0 for non-numbers', () => {
    expect(clampPct(undefined)).toBe(0)
    expect(clampPct(NaN)).toBe(0)
    expect(clampPct('x')).toBe(0)
  })
})

describe('readingShareText', () => {
  it('reads naturally with a title and language', () => {
    const t = readingShareText({ knownPct: 82, languageName: 'Chinese', storyTitle: '小猫', url: 'https://hanzi-dojo.com' })
    expect(t).toContain('82%')
    expect(t).toContain('“小猫”')
    expect(t).toContain('Chinese')
    expect(t).toContain('Hanzi Dojo')
    expect(t).toContain('https://hanzi-dojo.com')
  })
  it('falls back gracefully when title/language are missing', () => {
    const t = readingShareText({ knownPct: 50 })
    expect(t).toContain('50%')
    expect(t).toContain('this story')
    // No stray double spaces from the missing language slot.
    expect(t).not.toMatch(/ {2,}/)
  })
  it('clamps the percentage in the caption', () => {
    expect(readingShareText({ knownPct: 999 })).toContain('100%')
  })
})

describe('drawReadingCard', () => {
  // A recording stand-in for a CanvasRenderingContext2D — captures fillText so we
  // can assert the card's content without a real canvas.
  function fakeCtx() {
    const texts = []
    return {
      texts,
      fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arcTo() {}, closePath() {}, stroke() {}, fill() {}, roundRect() {},
      measureText: (s) => ({ width: (s || '').length * 20 }),
      fillText: (s) => texts.push(s),
      set font(_) {}, get font() { return '' },
      set fillStyle(_) {}, get fillStyle() { return '' },
      set strokeStyle(_) {}, get strokeStyle() { return '' },
      set lineWidth(_) {}, get lineWidth() { return 0 },
      set textAlign(_) {}, get textAlign() { return '' },
      set textBaseline(_) {}, get textBaseline() { return '' },
    }
  }

  it('paints the percentage, brand, language line, and title', () => {
    const ctx = fakeCtx()
    drawReadingCard(ctx, { knownPct: 82, languageName: 'Chinese', storyTitle: '小猫', accentHex: '#B83A24', langFont: 'Noto Sans SC' })
    const joined = ctx.texts.join(' | ')
    expect(joined).toContain('82%')
    expect(joined).toContain('Hanzi Dojo')
    expect(joined).toContain('of this Chinese story')
    expect(joined).toContain('小猫')
    expect(joined).toContain('hanzi-dojo.com')
  })

  it('ellipsizes an over-long title to fit the card', () => {
    const ctx = fakeCtx()
    const longTitle = 'A very very very very very very very long story title that will not fit'
    drawReadingCard(ctx, { knownPct: 40, languageName: 'Russian', storyTitle: longTitle })
    const titleLine = ctx.texts.find(t => t.includes('…'))
    expect(titleLine).toBeTruthy()
    expect(titleLine.length).toBeLessThan(longTitle.length)
  })

  it('omits the title line cleanly when there is no title', () => {
    const ctx = fakeCtx()
    drawReadingCard(ctx, { knownPct: 10, languageName: 'Japanese' })
    expect(ctx.texts.join(' | ')).toContain('10%')
  })
})
