import { describe, it, expect } from 'vitest'
import {
  TASTE_STEPS, stepAt, isCorrect, isLastStep, tastedCharacters, progressLabel,
} from './tasteSteps'

describe('TASTE_STEPS', () => {
  it('builds to the compound — the payoff only lands if its parts came first', () => {
    // 火山 is guessable ONLY because 火 and 山 were just learned. Reorder this
    // and the last question becomes an unanswerable vocabulary quiz.
    const ids = TASTE_STEPS.map(s => s.id)
    expect(ids).toEqual(['shan', 'huo', 'huoshan'])
    const compound = TASTE_STEPS[2]
    expect(compound.hanzi).toBe('火山')
    for (const part of ['火', '山']) {
      expect(TASTE_STEPS.slice(0, 2).some(s => s.hanzi === part)).toBe(true)
    }
  })

  it('is short enough to finish before anyone loses interest', () => {
    expect(TASTE_STEPS.length).toBeLessThanOrEqual(3)
  })

  it('gives every step a real answer among its options', () => {
    for (const step of TASTE_STEPS) {
      expect(step.options.length).toBeGreaterThanOrEqual(3)
      expect(step.answer).toBeGreaterThanOrEqual(0)
      expect(step.answer).toBeLessThan(step.options.length)
      expect(step.reveal).toBeTruthy()
      expect(step.pinyin).toBeTruthy()
    }
  })

  it('does not put the answer in the same slot every time', () => {
    // A visitor who notices the answer is always second stops reading and
    // taps position two — which is the opposite of the point.
    expect(new Set(TASTE_STEPS.map(s => s.answer)).size).toBeGreaterThan(1)
  })
})

describe('isCorrect', () => {
  it('grades against the step', () => {
    expect(isCorrect(TASTE_STEPS[0], 1)).toBe(true)
    expect(isCorrect(TASTE_STEPS[0], 0)).toBe(false)
  })

  it('never throws on a missing step', () => {
    expect(isCorrect(null, 0)).toBe(false)
    expect(isCorrect(undefined, 1)).toBe(false)
  })
})

describe('stepAt / isLastStep', () => {
  it('walks the steps and stops', () => {
    expect(stepAt(0).id).toBe('shan')
    expect(stepAt(TASTE_STEPS.length)).toBe(null)
    expect(isLastStep(TASTE_STEPS.length - 1)).toBe(true)
    expect(isLastStep(0)).toBe(false)
  })
})

describe('tastedCharacters', () => {
  it('claims only the single characters, not the compound', () => {
    // The post-signup welcome says "you already met X". 火山 is not on the
    // HSK 1 list the learner is about to start, so naming it would promise a
    // word the app then never teaches.
    expect(tastedCharacters()).toEqual(['山', '火'])
  })
})

describe('progressLabel', () => {
  it('counts from one', () => {
    expect(progressLabel(0)).toBe('1 of 3')
    expect(progressLabel(2)).toBe('3 of 3')
  })
})
