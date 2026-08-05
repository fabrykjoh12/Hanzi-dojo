import { describe, it, expect } from 'vitest'
import { GRADE_HELP, GRADE_HELP_FOOTER, gradeTip } from './gradeHelp'

describe('gradeHelp', () => {
  it('covers exactly the four FSRS grades, in order', () => {
    expect(GRADE_HELP.map(g => g.grade)).toEqual([0, 1, 2, 3])
    expect(GRADE_HELP.map(g => g.label)).toEqual(['Again', 'Hard', 'Good', 'Easy'])
  })

  it('every grade has non-empty copy', () => {
    for (const g of GRADE_HELP) {
      expect(g.tip.length).toBeGreaterThan(20)
    }
    expect(GRADE_HELP_FOOTER.length).toBeGreaterThan(20)
  })

  it('gradeTip returns the matching copy, empty string for unknown grades', () => {
    expect(gradeTip(0)).toBe(GRADE_HELP[0].tip)
    expect(gradeTip(3)).toBe(GRADE_HELP[3].tip)
    expect(gradeTip(7)).toBe('')
    expect(gradeTip(undefined)).toBe('')
  })

  it('Again never reads as failure — no guilt words anywhere', () => {
    // The calm-copy promise (CLAUDE.md §1): grading Again is information, not
    // a mistake. Guard the words that would break that.
    const all = GRADE_HELP.map(g => g.tip).join(' ') + ' ' + GRADE_HELP_FOOTER
    for (const banned of ['fail', 'wrong', 'mistake', 'bad', 'penal']) {
      expect(all.toLowerCase()).not.toContain(banned)
    }
  })
})
