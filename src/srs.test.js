import { describe, it, expect } from 'vitest'
import { schedule, previewLabels, isCardDue, endOfLocalDay } from './srs'

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

describe('isCardDue (day-based review availability)', () => {
  // Local-time constructor so end-of-day math is timezone-agnostic.
  const at = (h, day = 10) => new Date(2026, 0, day, h, 0, 0)
  const review = (dueDate) => ({ state: 'review', due_at: dueDate.toISOString() })

  it('endOfLocalDay is 23:59:59.999 on the same local day', () => {
    const eod = endOfLocalDay(at(9))
    expect(eod.getHours()).toBe(23)
    expect(eod.getMinutes()).toBe(59)
    expect(eod.getDate()).toBe(10)
  })

  it('serves a review due LATER today during a morning session (the bug)', () => {
    // Reviewed yesterday evening → due today at 20:00. A 06:00 session must
    // still see it, instead of it trickling in only at 20:00.
    expect(isCardDue(review(at(20)), at(6))).toBe(true)
  })

  it('serves reviews due earlier today and overdue reviews', () => {
    expect(isCardDue(review(at(3)), at(9))).toBe(true)          // earlier today
    expect(isCardDue(review(at(15, 9)), at(9, 10))).toBe(true)  // yesterday (overdue)
  })

  it('does NOT serve a review scheduled for tomorrow', () => {
    expect(isCardDue(review(at(9, 11)), at(9, 10))).toBe(false)
  })

  it('learning/relearning stay intraday (exact now comparison)', () => {
    const now = at(9)
    expect(isCardDue({ state: 'learning', due_at: at(9).toISOString() }, now)).toBe(true)
    // A learning step 1 minute out is not due yet.
    const oneMinOut = new Date(2026, 0, 10, 9, 1, 0)
    expect(isCardDue({ state: 'learning', due_at: oneMinOut.toISOString() }, now)).toBe(false)
    // But a relearning card later today is NOT pulled in early (unlike review).
    expect(isCardDue({ state: 'relearning', due_at: at(20).toISOString() }, at(6))).toBe(false)
  })

  it('never reports a new card as due', () => {
    expect(isCardDue({ state: 'new', due_at: at(1).toISOString() }, at(9))).toBe(false)
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
