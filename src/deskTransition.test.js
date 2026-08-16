import { describe, expect, it } from 'vitest'
import { flipTransform, setDeskHandoff, takeDeskHandoff } from './deskTransition'

const rect = { left: 20, top: 106, width: 350, height: 470 }

describe('desk handoff', () => {
  it('is one-shot', () => {
    setDeskHandoff(rect)
    expect(takeDeskHandoff()).toEqual(rect)
    expect(takeDeskHandoff()).toBe(null)
  })

  it('expires instead of animating from a stale rectangle', () => {
    let t = 0
    setDeskHandoff(rect, () => t)
    t = 900
    expect(takeDeskHandoff(() => t)).toBe(null)
  })

  it('ignores empty rectangles', () => {
    setDeskHandoff({ left: 0, top: 0, width: 0, height: 0 })
    expect(takeDeskHandoff()).toBe(null)
  })
})

describe('flipTransform', () => {
  it('computes the inverted start state from desk to study geometry', () => {
    const study = { left: 14, top: 128, width: 362, height: 682 }
    const t = flipTransform(rect, study)
    expect(t.x).toBe(6)
    expect(t.y).toBeCloseTo(-22)
    expect(t.sx).toBeCloseTo(350 / 362)
    expect(t.sy).toBeCloseTo(470 / 682)
  })

  it('returns null for degenerate targets', () => {
    expect(flipTransform(rect, { left: 0, top: 0, width: 0, height: 0 })).toBe(null)
    expect(flipTransform(null, rect)).toBe(null)
  })
})
