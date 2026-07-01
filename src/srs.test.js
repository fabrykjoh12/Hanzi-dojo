import { describe, it, expect } from 'vitest'
import { schedule, previewLabels } from './srs'

const STATES = ['new', 'learning', 'review', 'relearning']
const newCard = () => ({ id: null, state: 'new' })

describe('schedule', () => {
  it('returns a well-formed update for every grade', () => {
    for (let grade = 0; grade <= 3; grade += 1) {
      const res = schedule(newCard(), grade)
      expect(STATES).toContain(res.updates.state)
      expect(typeof res.updates.stability).toBe('number')
      expect(typeof res.updates.difficulty).toBe('number')
      expect(typeof res.updates.due_at).toBe('string')
      expect(typeof res.stay).toBe('boolean')
    }
  })

  it('sets is_easy only on the Easy grade', () => {
    expect(schedule(newCard(), 0).updates.is_easy).toBe(false)
    expect(schedule(newCard(), 1).updates.is_easy).toBe(false)
    expect(schedule(newCard(), 2).updates.is_easy).toBe(false)
    expect(schedule(newCard(), 3).updates.is_easy).toBe(true)
  })

  it('keeps an Again-graded new card in the session (stay=true, learning)', () => {
    const res = schedule(newCard(), 0)
    expect(res.stay).toBe(true)
    expect(['learning', 'relearning']).toContain(res.updates.state)
    expect(res.gap).toBeGreaterThanOrEqual(2)
  })

  it('marks a graduated card as learned', () => {
    // An Easy grade on a new card should push it toward review and set learned.
    const res = schedule(newCard(), 3)
    if (res.updates.state === 'review') expect(res.updates.learned).toBe(true)
  })
})

describe('previewLabels', () => {
  it('returns a human label for each of the four grades', () => {
    const labels = previewLabels(newCard())
    for (let grade = 0; grade <= 3; grade += 1) {
      expect(typeof labels[grade]).toBe('string')
      expect(labels[grade].length).toBeGreaterThan(0)
    }
  })
})
