import { describe, it, expect } from 'vitest'
import { realizedDensity, compareDensity, REALIZED_VERSION } from './storyRealizedDensity.mjs'

// Real HSK rows. The learner is at level 3.
const vocabMap = {
  李明: { level: 1, meaning: 'Li Ming' },
  我: { level: 1, meaning: 'I' }, 的: { level: 1, meaning: 'of' }, 是: { level: 1, meaning: 'to be' },
  很: { level: 1, meaning: 'very' }, 好: { level: 1, meaning: 'good' }, 不: { level: 1, meaning: 'not' },
  书: { level: 1, meaning: 'book' }, 学校: { level: 1, meaning: 'school' }, 天: { level: 1, meaning: 'day' },
  打开: { level: 2, meaning: 'to open' }, 里: { level: 1, meaning: 'inside' }, 在: { level: 1, meaning: 'at' },
  伞: { level: 3, meaning: 'umbrella' }, 需要: { level: 3, meaning: 'to need' },
  钥匙: { level: 4, meaning: 'key' }, 条件: { level: 4, meaning: 'condition' },
  柜子: { level: 5, meaning: 'cupboard; cabinet' }, 备用: { level: 6, meaning: 'spare' },
}
const density = (content) => realizedDensity({ content, vocabMap, level: 3 })

describe('realizedDensity — what the reader actually has to tap', () => {
  it('counts a word above the level as one tap', () => {
    const r = density('我需要钥匙。')
    expect(r.lines[0].taps).toBe(1)
    expect(r.lines[0].words).toEqual(['钥匙'])
  })

  it('counts nothing for a line entirely in level', () => {
    const r = density('我的书很好。')
    expect(r.maxPerLine).toBe(0)
    expect(r.totalTaps).toBe(0)
  })

  it('finds the worst line, not the average', () => {
    const r = density(['我的书很好。', '我需要备用钥匙打开柜子。', '天很好。'].join('\n'))
    expect(r.maxPerLine).toBe(3)
    expect(r.lines[1].words).toEqual(expect.arrayContaining(['备用', '钥匙', '柜子']))
    // Three taps in one line, three lines: the average would say one.
    expect(r.totalTaps / r.lines.length).toBeLessThan(r.maxPerLine)
  })

  it('a repeated word is one tap per line it appears in, counted once per line', () => {
    const r = density(['我需要钥匙。', '钥匙在柜子里。'].join('\n'))
    expect(r.lines[0].taps).toBe(1)
    expect(r.lines[1].taps).toBe(2)
    expect(r.distinct).toBe(2)   // 钥匙, 柜子
  })

  it('a proper name is never a tap', () => {
    // 李明 is in the map, but a name the reader renders as a name would not be
    // a tap even if it were not.
    expect(density('李明很好。').maxPerLine).toBe(0)
  })

  it('a speaker label is chrome, not part of the sentence', () => {
    const withLabel = density('李明: 我需要钥匙。')
    const without = density('我需要钥匙。')
    expect(withLabel.maxPerLine).toBe(without.maxPerLine)
  })

  it('is versioned', () => {
    expect(REALIZED_VERSION).toBe('fab9-realized@1')
    expect(density('我的书。').version).toBe(REALIZED_VERSION)
  })
})

describe('compareDensity — is the plan-time bound useful?', () => {
  const realized = (content) => density(content)

  it('AGREE_ACCEPT when the plan allowed it and the Mandarin stayed inside', () => {
    const r = compareDensity({ planned: 1, realized: realized('我需要钥匙。'), cap: 2 })
    expect(r.verdict).toBe('AGREE_ACCEPT')
    expect(r.worstLines).toEqual([])
  })

  it('FALSE NEGATIVE when the plan allowed it and a real line overloaded — the dangerous case', () => {
    const r = compareDensity({ planned: 1, realized: realized('我需要备用钥匙打开柜子。'), cap: 2 })
    expect(r.verdict).toBe('FALSE_NEGATIVE')
    expect(r.worstLines[0].taps).toBeGreaterThan(2)
  })

  it('FALSE POSITIVE when the plan rejected a story the writer wrote cleanly', () => {
    const r = compareDensity({ planned: 3, realized: realized('我需要钥匙。'), cap: 2 })
    expect(r.verdict).toBe('FALSE_POSITIVE')
  })

  it('AGREE_REJECT when both say it is too dense', () => {
    const r = compareDensity({ planned: 3, realized: realized('我需要备用钥匙打开柜子。'), cap: 2 })
    expect(r.verdict).toBe('AGREE_REJECT')
  })
})
