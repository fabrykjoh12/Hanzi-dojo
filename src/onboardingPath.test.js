import { describe, it, expect } from 'vitest'
import {
  EXPERIENCE_LEVELS, DEFAULT_EXPERIENCE, PURPOSES, primaryReason,
  TRAINING_STYLES, DEFAULT_STYLE, DAILY_PLANS, DEFAULT_MINUTES,
  planEstimate, buildPath,
} from './onboardingPath'
import { REASONS } from './prelogin'

describe('experience levels', () => {
  it('covers new through HSK 3+, plus an honest "not sure"', () => {
    expect(EXPERIENCE_LEVELS.map(e => e.key))
      .toEqual(['new', 'few', 'hsk1', 'hsk2', 'hsk3plus', 'unsure'])
    expect(EXPERIENCE_LEVELS.find(e => e.key === 'unsure').placementLater).toBe(true)
    expect(EXPERIENCE_LEVELS.some(e => e.key === DEFAULT_EXPERIENCE)).toBe(true)
  })

  it('never starts anyone above the level they claimed', () => {
    for (const e of EXPERIENCE_LEVELS) {
      expect(e.startLevel).toBeGreaterThanOrEqual(1)
      expect(e.startLevel).toBeLessThanOrEqual(3)
    }
  })
})

describe('purposes', () => {
  it('every purpose maps onto a reason the rest of the app personalizes by', () => {
    // Auth's intro line and the post-signup onboarding both key off
    // prelogin.js's REASONS. A purpose mapping to an unknown reason would
    // silently break both.
    const known = new Set(REASONS.map(r => r.key))
    for (const p of PURPOSES) expect(known.has(p.reason)).toBe(true)
  })

  it('the first purpose picked wins, and nothing picked stays sane', () => {
    expect(primaryReason(['study', 'travel'])).toBe('exam')
    expect(primaryReason(['travel'])).toBe('travel')
    expect(primaryReason([])).toBe('curious')
    expect(primaryReason(undefined)).toBe('curious')
  })
})

describe('training styles', () => {
  it('offers the balanced default the screen preselects', () => {
    expect(TRAINING_STYLES.some(s => s.key === DEFAULT_STYLE)).toBe(true)
    expect(DEFAULT_STYLE).toBe('balanced')
  })
})

describe('daily plans', () => {
  it('keeps the estimate honest — about a word a minute, stated plainly', () => {
    for (const p of DAILY_PLANS) {
      expect(p.words).toBeLessThanOrEqual(p.minutes)
      expect(planEstimate(p.minutes)).toContain(String(p.words) + ' new words')
    }
    expect(DAILY_PLANS.some(p => p.minutes === DEFAULT_MINUTES)).toBe(true)
  })

  it('falls back to the recommended plan for an unknown value', () => {
    expect(planEstimate(999)).toContain('10 minutes')
  })
})

describe('buildPath', () => {
  it('assembles four rows from the choices', () => {
    const rows = buildPath({ experience: 'new', purposes: ['travel'], minutes: 10 })
    expect(rows).toHaveLength(4)
    expect(rows[0].value).toContain('HSK 1')
    expect(rows[1].value).toContain('10 minutes')
    expect(rows[2].value).toContain('第一话')
    expect(rows[3].value).toContain('Travel')
  })

  it('does not promise the HSK 1 story to an HSK 3 learner', () => {
    const rows = buildPath({ experience: 'hsk3plus', purposes: [], minutes: 15 })
    expect(rows[2].value).not.toContain('第一话')
  })

  it('sends the unsure to the placement test, not to level 1 by fiat', () => {
    const rows = buildPath({ experience: 'unsure', purposes: [], minutes: 10 })
    expect(rows[0].value.toLowerCase()).toContain('placement')
  })

  it('survives empty choices — every question is skippable', () => {
    const rows = buildPath({})
    expect(rows).toHaveLength(4)
    expect(rows[3].value).toBe('A balanced start')
  })
})
