import { describe, it, expect } from 'vitest'
import { last30A11yLabel } from './reviewAccuracy'

describe('last30A11yLabel', () => {
  it('summarizes total, busiest day and active days', () => {
    const counts = [3, 0, 5, 0, 2] // total 10, peak 5, 3 active
    expect(last30A11yLabel(counts)).toBe(
      'Reviews over the last 30 days: 10 total, busiest day 5, 3 active days.',
    )
  })
  it('states clearly when there are none', () => {
    expect(last30A11yLabel([0, 0, 0])).toBe('No reviews in the last 30 days.')
    expect(last30A11yLabel([])).toBe('No reviews in the last 30 days.')
  })
  it('tolerates junk input', () => {
    expect(last30A11yLabel(null)).toMatch(/No reviews/)
  })
})
