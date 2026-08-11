import { describe, it, expect } from 'vitest'
import { profileProgress, studyRhythm, RHYTHM_WINDOW_DAYS } from './profileProgress'

// The contradiction this module exists to prevent: Profile showed "Words
// mastered" twice, with the current level's number and the lifetime number,
// under identical words. Every assertion about labels below is about that.

const key = (d) => d.getFullYear() + '-'
  + String(d.getMonth() + 1).padStart(2, '0') + '-'
  + String(d.getDate()).padStart(2, '0')
const daysAgo = (n, from) => { const d = new Date(from); d.setDate(d.getDate() - n); return d }
const TODAY = new Date(2026, 7, 11) // 11 Aug 2026, a fixed clock

describe('studyRhythm', () => {
  it('counts distinct studied days in the window, not consecutive ones', () => {
    const activity = {}
    for (const n of [0, 3, 4, 12, 29]) activity[key(daysAgo(n, TODAY))] = 5
    const r = studyRhythm(activity, TODAY)
    expect(r.days).toBe(5)
    expect(r.windowDays).toBe(30)
    expect(r.label).toBe('Studied 5 of the last 30 days')
  })

  it('says nothing coercive — no streak language anywhere', () => {
    const activity = {}
    // Twelve consecutive days: the exact case a streak product would celebrate.
    for (let n = 0; n < 12; n += 1) activity[key(daysAgo(n, TODAY))] = 3
    const r = studyRhythm(activity, TODAY)
    expect(r.days).toBe(12)
    expect(r.label).toBe('Studied 12 of the last 30 days')
    expect(r.label).not.toMatch(/streak|consecutive|in a row|🔥|flame|keep it/i)
  })

  it('ignores days outside the window, and days with no cards', () => {
    const activity = {
      [key(daysAgo(30, TODAY))]: 9, // one day too old
      [key(daysAgo(40, TODAY))]: 9,
      [key(daysAgo(2, TODAY))]: 0, // opened the app, studied nothing
      [key(daysAgo(1, TODAY))]: 1,
    }
    expect(studyRhythm(activity, TODAY).days).toBe(1)
  })

  it('handles a brand-new learner without pretending', () => {
    const r = studyRhythm({}, TODAY)
    expect(r.days).toBe(0)
    expect(r.label).toBe('No sessions in the last 30 days')
  })

  it('survives a missing or malformed activity map', () => {
    for (const bad of [null, undefined, 'nope', 42, []]) {
      expect(studyRhythm(bad, TODAY).days).toBe(0)
    }
  })

  it('exports its window so the copy and the query cannot disagree', () => {
    expect(RHYTHM_WINDOW_DAYS).toBe(30)
    expect(studyRhythm({}, TODAY, 7).label).toBe('No sessions in the last 7 days')
  })
})

describe('profileProgress — a brand-new learner', () => {
  const p = profileProgress({
    levelLearned: 0, levelMastered: 0, levelTotal: 44, levelLabel: 'HSK 2', today: TODAY,
  })

  it('reports zeros without dividing by anything', () => {
    expect(p.learned.value).toBe(0)
    expect(p.learned.pct).toBe(0)
    expect(p.mastered.pct).toBe(0)
  })

  it('says how far the test is, in words rather than percentages', () => {
    expect(p.test.unlocked).toBe(false)
    expect(p.test.at).toBe(40) // ceil(44 × 0.9)
    expect(p.test.needed).toBe(40)
    expect(p.test.label).toBe('40 more to unlock the HSK 2 test')
  })

  it('spells the state out for a screen reader', () => {
    expect(p.a11yLabel).toBe('0 of 44 words learned, 0 mastered at HSK 2')
  })
})

describe('profileProgress — partway through a level', () => {
  const p = profileProgress({
    levelLearned: 30, levelMastered: 12, levelTotal: 44, levelLabel: 'HSK 2', today: TODAY,
  })

  it('computes both percentages against the level, not the account', () => {
    expect(p.learned.pct).toBe(68)
    expect(p.mastered.pct).toBe(27)
  })

  it('counts down to the unlock', () => {
    expect(p.test.needed).toBe(28)
    expect(p.test.unlocked).toBe(false)
  })
})

describe('profileProgress — the level test threshold', () => {
  it('unlocks at the 90% mark, computed as whole words', () => {
    const at40 = profileProgress({ levelLearned: 44, levelMastered: 40, levelTotal: 44, levelLabel: 'HSK 2' })
    expect(at40.test.at).toBe(40)
    expect(at40.test.unlocked).toBe(true)
    expect(at40.test.needed).toBe(0)
    expect(at40.test.label).toBe('Level test unlocked')

    const at39 = profileProgress({ levelLearned: 44, levelMastered: 39, levelTotal: 44, levelLabel: 'HSK 2' })
    expect(at39.test.unlocked).toBe(false)
    expect(at39.test.needed).toBe(1)
  })

  it('handles a fully mastered level', () => {
    const p = profileProgress({ levelLearned: 44, levelMastered: 44, levelTotal: 44, levelLabel: 'HSK 2' })
    expect(p.mastered.pct).toBe(100)
    expect(p.test.unlocked).toBe(true)
  })

  it('takes the unlock share as an input rather than hardcoding it', () => {
    const p = profileProgress({ levelMastered: 22, levelTotal: 44, testUnlockPct: 0.5 })
    expect(p.test.at).toBe(22)
    expect(p.test.unlocked).toBe(true)
  })
})

describe('profileProgress — missing or broken counts', () => {
  it('returns a coherent shape from no arguments at all', () => {
    const p = profileProgress()
    expect(p.learned.value).toBe(0)
    expect(p.learned.pct).toBe(0)
    expect(p.test.label).toBe('')
    expect(p.a11yLabel).toBe('No words in this level yet')
  })

  it('never exceeds 100% — and clamps the INPUT rather than the output', () => {
    // A broken query is a bug to fix, not something to hide behind
    // Math.min(100, x) (CLAUDE.md §4). Clamping the count keeps the displayed
    // fraction and the percentage telling the same story.
    const p = profileProgress({ levelLearned: 999, levelMastered: 999, levelTotal: 44, levelLabel: 'HSK 2' })
    expect(p.learned.value).toBe(44)
    expect(p.learned.pct).toBe(100)
    expect(p.a11yLabel).toBe('44 of 44 words learned, 44 mastered at HSK 2')
  })

  it('treats a zero-size level as unknown, not as complete', () => {
    const p = profileProgress({ levelLearned: 5, levelMastered: 2, levelTotal: 0, levelLabel: 'HSK 9' })
    expect(p.learned.pct).toBe(0)
    expect(p.mastered.pct).toBe(0)
    expect(p.test.unlocked).toBe(false)
    expect(p.test.label).toBe('')
  })

  it('copes with nulls and strings', () => {
    const p = profileProgress({ levelLearned: null, levelMastered: undefined, levelTotal: '44', levelLabel: 'HSK 2' })
    expect(p.learned.value).toBe(0)
    expect(p.mastered.value).toBe(0)
    expect(p.learned.of).toBe(44)
  })
})

describe('the labels can never say the same thing about different numbers', () => {
  const p = profileProgress({
    levelLearned: 30, levelMastered: 12, levelTotal: 44, levelLabel: 'HSK 2', today: TODAY,
  })

  it('scopes the mastery label to the level by name', () => {
    expect(p.mastered.label).toBe('HSK 2 mastered')
    // The old, ambiguous wording is what produced two different numbers under
    // one label. It must not come back.
    expect(p.mastered.label).not.toBe('Words mastered')
  })

  it('gives every displayed number its own distinct label', () => {
    const labels = [p.learned.label, p.mastered.label, p.rhythm.label, p.test.label]
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('falls back to an unscoped label only when there is no level to name', () => {
    expect(profileProgress({ levelTotal: 10 }).mastered.label).toBe('Mastered')
  })

  it('reports no lifetime figure at all', () => {
    // Lifetime counts were the source of the contradiction and are simply not
    // part of this screen any more. If they ever return they need their own
    // label, deliberately chosen.
    const keys = Object.keys(p)
    expect(keys).not.toContain('lifetime')
    expect(JSON.stringify(p)).not.toMatch(/lifetime/i)
  })
})
