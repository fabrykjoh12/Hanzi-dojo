import { describe, it, expect } from 'vitest'
import { gradePrompt, gradePromptText, gradeGlosses } from './gradePrompt'
import { cardMarker } from './cardMarker'
import { GRADES, GRADE_KEYS } from './grades'

// "How well did you remember it?" asked of a word someone is meeting for the
// first time is a question with no answer. Found on a real first run through the
// onboarding tutorial — where every card is new — but it was never only an
// onboarding problem: the study screen asks it of every new card in every
// session.

describe('a word being met for the first time', () => {
  it('is asked how familiar it was, not how well it was remembered', () => {
    expect(gradePromptText('new')).toBe('How familiar was this word?')
    expect(gradePromptText('new')).not.toMatch(/remember/i)
  })

  it('names the four grades in terms of knowing, not recalling', () => {
    expect(gradeGlosses('new')).toEqual(['New to me', 'Barely knew it', 'Knew it', 'Already knew it'])
  })
})

describe('a word that has been seen before', () => {
  it('is asked how well it was remembered', () => {
    expect(gradePromptText('due')).toBe('How well did you remember it?')
  })

  it('names the four grades in terms of recall', () => {
    expect(gradeGlosses('due')).toEqual(['Forgot', 'Barely', 'Remembered', 'Effortless'])
  })

  it('is what anything unrecognised falls back to', () => {
    // Asking a returning learner the newcomer's question is a mild mismatch.
    // Asking a beginner to remember a word they have never met is nonsense, so
    // the fallback goes the safe way.
    for (const junk of [undefined, null, '', 'learning', 'weird', 0]) {
      expect(gradePromptText(junk)).toBe(gradePromptText('due'))
    }
  })
})

describe('which question a real card gets', () => {
  it('follows the card marker, so there is one definition of "new"', () => {
    expect(gradePromptText(cardMarker({ state: 'new' }).key)).toBe('How familiar was this word?')
    expect(gradePromptText(cardMarker({ state: 'review' }).key)).toBe('How well did you remember it?')
  })

  it('treats a word you failed yesterday as a review, not a first meeting', () => {
    for (const state of ['learning', 'relearning', 'review']) {
      expect(gradePromptText(cardMarker({ state }).key)).toBe('How well did you remember it?')
    }
  })

  it('treats a legacy row with no state as a review', () => {
    expect(gradePromptText(cardMarker({}).key)).toBe('How well did you remember it?')
    expect(gradePromptText(cardMarker(null).key)).toBe('How well did you remember it?')
  })
})

describe('the two wordings are the only difference', () => {
  it('is copy — the grades and their values are untouched', () => {
    // The whole point: Again is still 0 and Easy is still 3 whichever question
    // was asked. Nothing here reaches the scheduler.
    expect(GRADES.map(g => g.grade)).toEqual([0, 1, 2, 3])
    expect(GRADE_KEYS).toEqual(['again', 'hard', 'good', 'easy'])
  })

  it("gives one gloss per grade, in the grade row's own order, either way", () => {
    for (const key of ['new', 'due']) {
      expect(gradeGlosses(key)).toHaveLength(GRADES.length)
      expect(new Set(gradeGlosses(key)).size).toBe(GRADES.length)
    }
  })

  it('never returns the same wording for both', () => {
    expect(gradePromptText('new')).not.toBe(gradePromptText('due'))
    expect(gradeGlosses('new')).not.toEqual(gradeGlosses('due'))
  })

  it('keeps every gloss short enough to sit under a button', () => {
    for (const key of ['new', 'due']) {
      for (const gloss of gradeGlosses(key)) expect(gloss.length).toBeLessThanOrEqual(16)
    }
  })

  it('hands back the same object shape for both', () => {
    for (const key of ['new', 'due']) {
      expect(Object.keys(gradePrompt(key)).sort()).toEqual(['glosses', 'prompt'])
    }
  })
})
