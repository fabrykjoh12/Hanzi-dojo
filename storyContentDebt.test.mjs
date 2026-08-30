import { describe, it, expect } from 'vitest'
import {
  collectDebt, compareToBaseline, formatDebtComparison, repairMatrix, debtKey,
  REPAIRABILITY, DEBT_VERSION,
} from './storyContentDebt.mjs'
import { DEFECT } from './storyVocabAudit.mjs'

const mk = (o) => Object.fromEntries(Object.entries(o).map(([w, v]) => [w, { word: w, ...v }]))
const vocabMap = mk({
  我: { level: 1, meaning: 'I' }, 的: { level: 1, meaning: 'of' },
  书: { level: 1, meaning: 'book' }, 很: { level: 1, meaning: 'very' },
  好: { level: 1, meaning: 'good' }, 手机: { level: 1, meaning: 'cell phone' },
  电: { level: 3, meaning: 'electricity' }, 没有: { level: 1, meaning: 'to not have' },
  水: { level: 1, meaning: 'water' },
})
const clean = { id: 'a', title: 'clean', level: 1, content: '我的书很好。' }
const dirty = { id: 'b', title: 'dirty', level: 2, content: '手机没电。' }
const debt = (stories) => collectDebt({ stories, vocabMap })

describe('collectDebt — the inventory, through the real Reader path', () => {
  it('records story, form, class and occurrence count', () => {
    const d = debt([clean, dirty])
    expect(d.stories).toBe(2)
    expect(d.storiesWithDebt).toBe(1)
    expect(d.entries).toHaveLength(1)
    expect(d.entries[0]).toMatchObject({ story: 'b', form: '没', occurrences: 1, defect: DEFECT.MORPHEME_OF_COMPOUND })
  })

  it('records no line numbers, so editing a story does not invalidate the baseline', () => {
    for (const e of debt([dirty]).entries) {
      expect(e).not.toHaveProperty('line')
      expect(e).not.toHaveProperty('lines')
      expect(e).not.toHaveProperty('offset')
    }
  })

  it('is stable under reordering — a diff of the baseline stays readable', () => {
    expect(JSON.stringify(debt([clean, dirty]).entries)).toBe(JSON.stringify(debt([dirty, clean]).entries))
  })

  it('keys on story id, so a retitled story keeps its debt identity', () => {
    const renamed = { ...dirty, title: 'renamed' }
    expect(debt([renamed]).entries[0].story).toBe(debt([dirty]).entries[0].story)
  })

  it('counts occurrences, not just presence', () => {
    expect(debt([{ ...dirty, content: '手机没电。\n手机没电。' }]).entries[0].occurrences).toBe(2)
  })
})

describe('compareToBaseline — debt may shrink, never grow', () => {
  const baseline = debt([clean, dirty])

  it('passes when nothing changed', () => {
    const cmp = compareToBaseline(debt([clean, dirty]), baseline)
    expect(cmp.ok).toBe(true)
    expect(cmp.added).toEqual([])
  })

  it('FAILS on a brand-new story carrying an unresolved token', () => {
    const fresh = { id: 'c', title: 'new', level: 1, content: '手机没电。' }
    const cmp = compareToBaseline(debt([clean, dirty, fresh]), baseline)
    expect(cmp.ok).toBe(false)
    expect(cmp.added.map(e => e.story)).toEqual(['c'])
  })

  it('FAILS when an edit introduces a new form into a known story', () => {
    const edited = { ...dirty, content: '手机没电。水缸很好。' }
    const cmp = compareToBaseline(debt([clean, edited]), baseline)
    expect(cmp.ok).toBe(false)
    // The form is the whole unknown WORD 水缸 ("water jar"), not the orphan
    // character 缸. atomicSpans deliberately shows a segmenter word the
    // vocabulary does not carry as one unknown token rather than letting the
    // reader tap 水 inside it, and the audit reports what the reader shows.
    expect(cmp.added.map(e => e.form)).toContain('水缸')
  })

  it('FAILS when a known form starts occurring more often', () => {
    const worse = { ...dirty, content: '手机没电。\n手机没电。' }
    const cmp = compareToBaseline(debt([clean, worse]), baseline)
    expect(cmp.ok).toBe(false)
    expect(cmp.worsened[0]).toMatchObject({ form: '没', occurrences: 2, was: 1 })
  })

  it('PASSES when debt is removed, WITHOUT needing the baseline edited', () => {
    // The whole point: repairing a story must not require a baseline update.
    const fixed = { ...dirty, content: '手机没有电。' }
    const cmp = compareToBaseline(debt([clean, fixed]), baseline)
    expect(cmp.ok).toBe(true)
    expect(cmp.resolved.map(e => e.form)).toContain('没')
    expect(cmp.delta.occurrences).toBeLessThan(0)
  })

  it('PASSES when a form merely becomes rarer', () => {
    const base2 = debt([{ ...dirty, content: '手机没电。\n手机没电。' }])
    const cmp = compareToBaseline(debt([dirty]), base2)
    expect(cmp.ok).toBe(true)
    expect(cmp.improved[0]).toMatchObject({ occurrences: 1, was: 2 })
  })

  it('reports a deleted story as stale rather than resolved', () => {
    const cmp = compareToBaseline(debt([clean]), baseline)
    expect(cmp.ok).toBe(true)
    expect(cmp.stale.map(e => e.story)).toEqual(['b'])
    expect(cmp.resolved).toEqual([])
  })

  it('treats an empty baseline as zero debt allowed', () => {
    const cmp = compareToBaseline(debt([dirty]), { entries: [] })
    expect(cmp.ok).toBe(false)
    expect(cmp.added).toHaveLength(1)
  })

  it('never mutates either side', () => {
    const cur = debt([clean, dirty])
    const before = JSON.stringify({ cur, baseline })
    compareToBaseline(cur, baseline)
    expect(JSON.stringify({ cur, baseline })).toBe(before)
  })
})

describe('formatDebtComparison', () => {
  const baseline = debt([clean])

  it('names the story and the form on a regression', () => {
    const out = formatDebtComparison(compareToBaseline(debt([clean, dirty]), baseline))
    expect(out).toMatch(/CONTENT INTEGRITY REGRESSION/)
    expect(out).toContain('没')
    expect(out).toContain('dirty')
  })

  it('says so plainly when clean', () => {
    expect(formatDebtComparison(compareToBaseline(debt([clean]), baseline))).toMatch(/content integrity OK/)
  })
})

describe('repairMatrix — which layer owns each class', () => {
  it('groups by class with forms, occurrences and stories', () => {
    const m = repairMatrix(debt([dirty, { id: 'c', title: 'c', level: 1, content: '水缸很好。' }]))
    expect(m.length).toBeGreaterThan(0)
    const morph = m.find(r => r.defect === DEFECT.MORPHEME_OF_COMPOUND)
    expect(morph).toMatchObject({ repairability: 'STORY-REWRITE', forms: 1, stories: 1 })
  })

  it('never marks a morpheme-of-compound as a vocabulary fix', () => {
    // Adding a row for 火 because 火车 exists would be the synonym-bridge
    // mistake with characters. The story is what changes.
    expect(REPAIRABILITY[DEFECT.MORPHEME_OF_COMPOUND]).toBe('STORY-REWRITE')
    expect(REPAIRABILITY[DEFECT.OUT_OF_CURRICULUM]).toBe('STORY-REWRITE')
    expect(REPAIRABILITY[DEFECT.CURRICULUM_ROW_MISSING]).toBe('AUTO-SAFE')
  })
})

describe('debtKey', () => {
  it('is stable and distinguishes story from form', () => {
    expect(debtKey('a', '没')).toBe(debtKey('a', '没'))
    expect(debtKey('a', '没')).not.toBe(debtKey('b', '没'))
    expect(debtKey('a', '没')).not.toBe(debtKey('a', '电'))
  })

  it('is versioned', () => {
    expect(DEBT_VERSION).toBe('fab9-content-debt@1')
  })
})

// The baseline records `defect` deliberately — it names who owns the repair:
// ingestion, story content, or a curriculum decision. compareToBaseline ignored
// it, so an ownership change at an unchanged count passed silently. The
// conservative rule is that any change of class is reviewed; no severity
// ordering is implied and none is needed.
describe('a changed defect class is a regression, whatever the count does', () => {
  const at = (defect, occurrences) => ({
    version: DEBT_VERSION,
    stories: 1,
    storyIds: ['s1'],
    storiesWithDebt: 1,
    forms: 1,
    occurrences,
    entries: [{ story: 's1', title: 't', level: 3, form: '船', defect, occurrences }],
  })
  const MISSING = DEFECT.CURRICULUM_ROW_MISSING
  const OUT = DEFECT.OUT_OF_CURRICULUM

  it('same class, same count → passes', () => {
    const cmp = compareToBaseline(at(MISSING, 3), at(MISSING, 3))
    expect(cmp.ok).toBe(true)
    expect(cmp.reclassified).toEqual([])
  })

  it('same class, FEWER occurrences → still passes', () => {
    const cmp = compareToBaseline(at(MISSING, 1), at(MISSING, 3))
    expect(cmp.ok).toBe(true)
    expect(cmp.reclassified).toEqual([])
    expect(cmp.improved[0]).toMatchObject({ occurrences: 1, was: 3 })
  })

  it('CHANGED class, same count → FAILS', () => {
    const cmp = compareToBaseline(at(OUT, 3), at(MISSING, 3))
    expect(cmp.ok).toBe(false)
    expect(cmp.added).toEqual([])
    expect(cmp.worsened).toEqual([])
    expect(cmp.reclassified[0]).toMatchObject({ form: '船', wasDefect: MISSING, defect: OUT })
  })

  it('CHANGED class together with FEWER occurrences → still does not pass', () => {
    // The case a count-only rule would wave through as an improvement.
    const cmp = compareToBaseline(at(OUT, 1), at(MISSING, 3))
    expect(cmp.ok).toBe(false)
    expect(cmp.reclassified).toHaveLength(1)
    expect(cmp.improved).toHaveLength(1)      // reported as both, and still fails
  })

  it('CHANGED class together with MORE occurrences fails on both counts', () => {
    const cmp = compareToBaseline(at(OUT, 9), at(MISSING, 3))
    expect(cmp.ok).toBe(false)
    expect(cmp.reclassified).toHaveLength(1)
    expect(cmp.worsened).toHaveLength(1)
  })

  it('reports the old and the new class in the output', () => {
    const out = formatDebtComparison(compareToBaseline(at(OUT, 3), at(MISSING, 3)))
    expect(out).toMatch(/CLASS/)
    expect(out).toContain(MISSING)
    expect(out).toContain('->')
    expect(out).toContain(OUT)
  })

  it('a baseline entry with no recorded class does not fabricate a regression', () => {
    // Older baselines may predate the field; absence is not a change.
    const legacy = at(MISSING, 3)
    delete legacy.entries[0].defect
    expect(compareToBaseline(at(MISSING, 3), legacy).ok).toBe(true)
  })
})
