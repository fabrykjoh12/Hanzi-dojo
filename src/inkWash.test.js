import { describe, it, expect } from 'vitest'
import { seededRandom, ridgePath, ridgeLayers } from './inkWash'
import { openingLine, heroSentence } from './homeStory'

describe('seededRandom', () => {
  it('is deterministic for a seed — the skyline must not reshuffle on re-render', () => {
    const a = seededRandom('chinese')
    const b = seededRandom('chinese')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('gives different languages different skylines', () => {
    expect(seededRandom('chinese')()).not.toBe(seededRandom('japanese')())
  })

  it('stays within [0, 1)', () => {
    const r = seededRandom('x')
    for (let i = 0; i < 200; i += 1) {
      const n = r()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })
})

describe('ridgePath', () => {
  it('closes the band down to the bottom edge so it fills', () => {
    const d = ridgePath({ peaks: 3 })
    expect(d.startsWith('M 0 ')).toBe(true)
    expect(d).toContain('L 100 100')
    expect(d).toContain('L 0 100')
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('emits one curve per peak', () => {
    expect((ridgePath({ peaks: 5 }).match(/Q /g) || []).length).toBe(5)
  })

  it('keeps every coordinate inside the viewBox', () => {
    const d = ridgePath({ baseY: 60, amp: 20, peaks: 4 })
    for (const n of d.match(/-?\d+\.?\d*/g).map(Number)) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(100)
    }
  })

  it('is stable for a given seed', () => {
    expect(ridgePath({ seed: 's', peaks: 4 })).toBe(ridgePath({ seed: 's', peaks: 4 }))
  })
})

describe('ridgeLayers', () => {
  it('recedes: farther ridges sit higher and read fainter', () => {
    const layers = ridgeLayers('chinese', 3)
    expect(layers).toHaveLength(3)
    for (let i = 1; i < layers.length; i += 1) {
      expect(layers[i].opacity).toBeGreaterThan(layers[i - 1].opacity)
    }
  })

  it('never exceeds full opacity on the nearest ridge', () => {
    for (const l of ridgeLayers('x', 3)) expect(l.opacity).toBeLessThanOrEqual(1)
  })
})

describe('openingLine', () => {
  it('takes the first non-empty line', () => {
    expect(openingLine('\n\n  今天天气很好。\n第二行')).toBe('今天天气很好。')
  })

  it('is safe on empty or missing content', () => {
    expect(openingLine('')).toBe('')
    expect(openingLine(undefined)).toBe('')
  })
})

describe('heroSentence', () => {
  it('drops a speaker prefix — the hero is the words, not the tag', () => {
    expect(heroSentence('妈妈：今天我们去公园。')).toBe('今天我们去公园。')
  })

  it('leaves a plain sentence alone when it fits', () => {
    expect(heroSentence('今天我和朋友去公园散步')).toBe('今天我和朋友去公园散步')
  })

  it('cuts on a clause boundary rather than mid-word', () => {
    const long = '今天我和朋友去公园散步，然后我们一起去了图书馆看书'
    const out = heroSentence(long, 14)
    expect(out.endsWith('，')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(14)
  })

  it('falls back to an ellipsis when there is no clause break in range', () => {
    const out = heroSentence('あいうえおかきくけこさしすせそたちつてと', 8)
    expect(out.endsWith('…')).toBe(true)
  })

  it('is safe on empty content', () => {
    expect(heroSentence('')).toBe('')
  })
})
