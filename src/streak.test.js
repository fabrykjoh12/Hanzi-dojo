import { describe, it, expect } from 'vitest'
import { todayStr, daysBetween } from './streak'

describe('todayStr', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches the current local date', () => {
    const d = new Date()
    const expected = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    expect(todayStr()).toBe(expected)
  })
})

describe('daysBetween', () => {
  it('is 0 for the same date', () => {
    expect(daysBetween('2026-01-10', '2026-01-10')).toBe(0)
  })

  it('counts forward days as positive', () => {
    expect(daysBetween('2026-01-10', '2026-01-11')).toBe(1)
    expect(daysBetween('2026-01-10', '2026-01-13')).toBe(3)
  })

  it('counts backward days as negative', () => {
    expect(daysBetween('2026-01-13', '2026-01-10')).toBe(-3)
  })

  it('crosses a month boundary correctly', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
  })
})
