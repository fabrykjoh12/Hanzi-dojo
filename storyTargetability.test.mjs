import { describe, it, expect } from 'vitest'
import {
  classifyTarget,
  occurrenceBounds,
  semanticBucket,
  composeTargetSet,
} from './storyTargetability.mjs'

// Real rows from the production HSK 3 vocabulary (word, CC-CEDICT-style gloss),
// fetched 2026-08-21 — the classification is calibrated against these, not
// invented examples.
const ROW = (word, meaning) => ({ word, meaning, level: 3 })

describe('classifyTarget — reproducible, from word form + gloss', () => {
  it('single characters are structural, whatever their gloss claims', () => {
    // The glosses here are exactly why: they describe a DIFFERENT sense than
    // the one HSK 3 teaches.
    for (const [w, g] of [
      ['被', 'quilt; to cover (with)'],
      ['中', 'China; Chinese'],
      ['刚', 'hard; firm'],
      ['或', 'maybe; perhaps'],
      ['该', 'should; ought to'],
      ['受', 'to receive; to accept'],
      ['辆', 'classifier for vehicles'],   // classifier: single char → structural, correctly
    ]) {
      expect(classifyTarget(ROW(w, g)).class).toBe('structural')
    }
  })

  it('connective/modal/adverbial glosses are soft', () => {
    for (const [w, g] of [
      ['如果', 'if; in case'],
      ['而且', '(not only ...) but also; moreover'],
      ['必须', 'to have to; must'],
      ['或者', 'or; possibly; maybe; perhaps'],
      ['当然', 'only natural; as it should be'],
      ['只要', 'if only; so long as'],
      ['其他', 'other; (sth or sb) else'],
      ['根据', 'according to; based on'],
      ['总是', 'always'],
    ]) {
      expect(classifyTarget(ROW(w, g)).class).toBe('soft')
    }
  })

  it('contentful vocabulary is hard', () => {
    for (const [w, g] of [
      ['需要', 'to need; to want; to demand; to require; needs'],
      ['生活', 'to live; life'],
      ['参加', 'to participate; to take part'],
      ['国家', 'country; nation; state'],
      ['机会', 'opportunity; chance'],
      ['女人', 'woman'],
      ['关系', 'relation; relationship'],
      ['安全', 'safe; secure; safety; security'],
      ['解决', 'to solve; to resolve; to settle (a problem); to eliminate; to wipe out (an enemy, bandits etc)'],
    ]) {
      expect(classifyTarget(ROW(w, g)).class).toBe('hard')
    }
  })

  it('classification survives a missing gloss (word form still decides)', () => {
    expect(classifyTarget({ word: '中' }).class).toBe('structural')
    expect(classifyTarget({ word: '需要' }).class).toBe('hard')   // no gloss → defaults hard
  })
})

describe('occurrenceBounds', () => {
  it('soft targets get min 1; hard keep the manifest default', () => {
    expect(occurrenceBounds('soft', { min: 2, max: 4 })).toEqual({ min: 1, max: 4 })
    expect(occurrenceBounds('hard', { min: 2, max: 4 })).toEqual({ min: 2, max: 4 })
  })
})

describe('semanticBucket', () => {
  it('clusters concrete vocabulary by gloss theme', () => {
    expect(semanticBucket('airport')).toBe('travel')
    expect(semanticBucket('passport')).toBe('travel')
    expect(semanticBucket('luggage; baggage')).toBe('travel')
    expect(semanticBucket('competition (sports etc); match')).toBe('school')
    expect(semanticBucket('country; nation; state')).toBe('places')
    expect(semanticBucket('woman')).toBe('social')
    expect(semanticBucket('to need; to want')).toBe('general')
  })
})

describe('composeTargetSet', () => {
  const pending = [
    ROW('被', 'quilt; to cover (with)'),
    ROW('需要', 'to need; to want'),
    ROW('如果', 'if; in case'),
    ROW('机场', 'airport'),
    ROW('护照', 'passport'),
    ROW('行李', 'luggage; baggage'),
    ROW('生活', 'to live; life'),
    ROW('而且', '(not only ...) but also; moreover'),
    ROW('了解', 'to understand; to realize'),
    ROW('中', 'China; Chinese'),
    ROW('得到', 'to get; to obtain'),
  ]

  it('groups themed hard targets, adds soft with min 1, skips structural', () => {
    const set = composeTargetSet(pending, { hardCount: 4, softCount: 2 })
    expect(set.bucket).toBe('travel')
    expect(set.hard.map(t => t.word)).toEqual(['机场', '护照', '行李', '需要'])  // themed first, general top-up
    expect(set.soft.map(t => t.word)).toEqual(['如果', '而且'])
    expect(set.structuralSkipped).toEqual(['被', '中'])
    expect(set.theme).toContain('trip')
  })

  it('falls back to general grouping when no bucket reaches the minimum', () => {
    const abstract = pending.filter(p => !['机场', '护照', '行李'].includes(p.word))
    const set = composeTargetSet(abstract, { hardCount: 3, softCount: 2 })
    expect(set.bucket).toBe('general')
    expect(set.theme).toBeNull()
    expect(set.hard.map(t => t.word)).toEqual(['需要', '生活', '了解'])
    expect(set.reason).toContain('general-purpose')
  })
})
