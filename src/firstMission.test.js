import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FIRST_MISSION_READER_HINT, firstMissionCompletion } from './firstMission'

// What is left of the First Mission after the onboarding rebuild, and — just as
// importantly — what must not come back.

describe('the reader hint', () => {
  it('names what the highlighting means, in one line', () => {
    expect(FIRST_MISSION_READER_HINT).toMatch(/highlighted words/i)
    expect(FIRST_MISSION_READER_HINT.length).toBeLessThan(80)
  })
})

describe('firstMissionCompletion', () => {
  it('names the language when there is one', () => {
    expect(firstMissionCompletion('Chinese')).toBe('You’ve already read your first Chinese story.')
  })

  it('reads correctly when there is not', () => {
    expect(firstMissionCompletion()).toBe('You’ve already read your first story.')
    expect(firstMissionCompletion(null)).toBe('You’ve already read your first story.')
  })
})

describe('the card hints are gone', () => {
  const source = readFileSync(new URL('./firstMission.js', import.meta.url), 'utf8')

  it('no longer coaches inside the learner\'s real first session', () => {
    // The tutorial teaches reveal, Replay and grading on the real card before
    // the account exists. Teaching them again in the first real session is the
    // tutorial-on-tutorial problem this rebuild exists to remove.
    expect(source).not.toContain('firstMissionCardHint')
    expect(source).not.toContain('CARD_HINTS')
  })

  it('no longer carries a welcome screen', () => {
    expect(source).not.toContain('FIRST_MISSION_WELCOME')
  })
})
