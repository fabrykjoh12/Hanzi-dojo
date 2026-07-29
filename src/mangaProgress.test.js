import { describe, it, expect } from 'vitest'
import { sanitizeProgress, mergeProgress, resumePanel, progressKey, EMPTY_PROGRESS } from './mangaProgress'
import { buildEpisode } from './mangaLayout'

const PANELS = buildEpisode({
  panels: [
    { id: 'p1', bubbles: [{ beat: 0 }] },
    { id: 'p2', choice: { options: [{ beat: 1 }, { beat: 2 }] } },
    { id: 'p3', bubbles: [{ beat: 3 }] },
    { id: 'p4', bubbles: [{ beat: 4 }] },
  ],
}, 5).panels

describe('progressKey', () => {
  it('namespaces per story', () => {
    expect(progressKey('abc')).toBe('manga:abc')
    expect(progressKey(null)).toBe('manga:unknown')
  })
})

describe('sanitizeProgress', () => {
  it('reads a well-formed record back', () => {
    const out = sanitizeProgress({ panel: 3, choices: { p2: 1 }, tapped: ['学生'], completed: true })
    expect(out).toEqual({ panel: 3, choices: { p2: 1 }, tapped: ['学生'], completed: true })
  })

  it('returns the empty default for anything that is not a record', () => {
    for (const bad of [null, undefined, 'x', 7, []]) {
      expect(sanitizeProgress(bad)).toEqual(EMPTY_PROGRESS)
    }
  })

  it('discards fields it cannot trust rather than the whole record', () => {
    const out = sanitizeProgress({ panel: -2, choices: { p2: 'first', p3: 0 }, tapped: ['ok', 5, ''], completed: 'yes' })
    expect(out.panel).toBe(0)
    expect(out.choices).toEqual({ p3: 0 })
    expect(out.tapped).toEqual(['ok'])
    expect(out.completed).toBe(false)
  })

  it('caps the tapped-word list so a long session cannot grow it forever', () => {
    const many = Array.from({ length: 400 }, (unused, i) => 'w' + i)
    expect(sanitizeProgress({ tapped: many }).tapped).toHaveLength(200)
  })
})

describe('mergeProgress', () => {
  it('advances the panel and merges choices', () => {
    const out = mergeProgress({ panel: 1, choices: { p2: 0 } }, { panel: 3, choices: { p5: 1 } })
    expect(out.panel).toBe(3)
    expect(out.choices).toEqual({ p2: 0, p5: 1 })
  })

  it('unions tapped words without duplicating them', () => {
    const out = mergeProgress({ tapped: ['学生', '老师'] }, { tapped: ['老师', '名字'] })
    expect(out.tapped).toEqual(['学生', '老师', '名字'])
  })

  it('never un-completes an episode', () => {
    expect(mergeProgress({ completed: true }, { panel: 0 }).completed).toBe(true)
  })

  it('leaves the record alone when the patch is empty or junk', () => {
    const prev = { panel: 2, choices: { p2: 1 }, tapped: ['x'], completed: false }
    expect(mergeProgress(prev, {})).toEqual(prev)
    expect(mergeProgress(prev, null)).toEqual(prev)
  })
})

describe('resumePanel', () => {
  it('returns to where the learner was', () => {
    expect(resumePanel({ panel: 3, choices: { p2: 0 } }, PANELS)).toBe(3)
  })

  it('never resumes past an unanswered choice', () => {
    // The choice on p2 was never made, so panel 3 was never legitimately read —
    // resuming there would show a branch nobody picked.
    expect(resumePanel({ panel: 3, choices: {} }, PANELS)).toBe(1)
  })

  it('clamps into an episode that has since lost panels', () => {
    expect(resumePanel({ panel: 40, choices: { p2: 0 } }, PANELS)).toBe(3)
  })

  it('is 0 for a fresh reader and for an empty episode', () => {
    expect(resumePanel(null, PANELS)).toBe(0)
    expect(resumePanel({ panel: 2 }, [])).toBe(0)
  })
})
