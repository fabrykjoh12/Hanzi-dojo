import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map()
vi.mock('./offline', () => ({
  prefsGet: key => Promise.resolve(store.get(key)),
  prefsMerge: (key, value) => { store.set(key, value); return Promise.resolve(value) },
}))

import {
  sanitizeProgress, mergeProgress, resumePanel, progressKey, legacyProgressKey,
  loadManhuaProgress, saveManhuaProgress, EMPTY_PROGRESS,
} from './manhuaProgress'
import { buildEpisode } from './manhuaLayout'

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
    expect(progressKey('abc')).toBe('manhua:abc')
    expect(progressKey(null)).toBe('manhua:unknown')
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

// The format was renamed manga → manhua after it had shipped, which moved the
// storage key. Nobody who was mid-episode should lose their place over a
// vocabulary decision.
describe('the rename from manga to manhua', () => {
  beforeEach(() => { store.clear() })

  it('reads a position that was saved under the old key', async () => {
    store.set(legacyProgressKey('st6'), { panel: 5, choices: { p4: 1 }, tapped: ['学生'], completed: false })
    const out = await loadManhuaProgress('st6')
    expect(out.panel).toBe(5)
    expect(out.choices).toEqual({ p4: 1 })
  })

  it('prefers the new key once anything has been written there', async () => {
    store.set(legacyProgressKey('st6'), { panel: 5, choices: {}, tapped: [], completed: false })
    store.set(progressKey('st6'), { panel: 9, choices: {}, tapped: [], completed: false })
    expect((await loadManhuaProgress('st6')).panel).toBe(9)
  })

  it('writes only to the new key, so a resumed episode migrates itself', async () => {
    store.set(legacyProgressKey('st6'), { panel: 5, choices: {}, tapped: [], completed: false })
    await saveManhuaProgress('st6', { panel: 7 })
    expect(store.get(progressKey('st6')).panel).toBe(7)
    expect(store.get(legacyProgressKey('st6')).panel).toBe(5)
  })

  it('is the empty default for a reader with neither key', async () => {
    expect(await loadManhuaProgress('st6')).toEqual(EMPTY_PROGRESS)
  })
})
