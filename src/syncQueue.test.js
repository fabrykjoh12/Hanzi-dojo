import { describe, it, expect } from 'vitest'
import { dayCountsOf } from './syncQueue'

describe('dayCountsOf', () => {
  it('buckets grade ops per day and state', () => {
    const ops = [
      { kind: 'grade', day: '2026-07-05', state: 'new' },
      { kind: 'grade', day: '2026-07-05', state: 'review' },
      { kind: 'grade', day: '2026-07-05', state: 'learning' },
      { kind: 'grade', day: '2026-07-06', state: 'new' },
      { kind: 'storyRead', day: '2026-07-05' }, // ignored
    ]
    const d = dayCountsOf(ops)
    expect(d['2026-07-05']).toEqual({ studied: 3, new: 1, learning: 1, review: 1 })
    expect(d['2026-07-06']).toEqual({ studied: 1, new: 1, learning: 0, review: 0 })
  })

  it('treats relearning as learning bucket', () => {
    const d = dayCountsOf([{ kind: 'grade', day: 'x', state: 'relearning' }])
    expect(d.x).toEqual({ studied: 1, new: 0, learning: 1, review: 0 })
  })
})
