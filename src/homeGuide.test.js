import { describe, it, expect } from 'vitest'
import { buildGuide, guideContextLine, upcomingLabel, STATUS } from './homeGuide'

// The guide's whole contract is "exactly one thing is loud, and every word of it
// is true". These tests are mostly about the second half — the places where the
// app does NOT know something and the screen therefore has to say less.

const LOADED = { loaded: true, failed: false }
const QUEUE = { ...LOADED, newCount: 5, learnCount: 2, dueCount: 15, weakCount: 6, grammarDueCount: 0 }
const CLEAR = { ...LOADED, newCount: 0, learnCount: 0, dueCount: 0, weakCount: 6, grammarDueCount: 0 }
const STORY = { title: 'The Empty Train', levelLabel: 'HSK 2', knownPct: 91, coverPath: 'x.webp' }
const PRACTICE = { key: 'weak', title: 'Weak words', cta: 'Practise these' }

function statuses(guide) {
  return guide.steps.map(s => s.key + ':' + s.status).join(' ')
}

describe('exactly one step is active', () => {
  it('leads with Cards while cards are waiting, and quiets the two behind it', () => {
    const g = buildGuide({ counts: QUEUE, story: STORY, practice: PRACTICE })
    expect(statuses(g)).toBe('cards:active story:upcoming practice:upcoming')
    expect(g.activeKey).toBe('cards')
    expect(g.steps.filter(s => s.status === STATUS.active)).toHaveLength(1)
  })

  it('hands the screen to Story the moment the queue is clear', () => {
    const g = buildGuide({ counts: CLEAR, story: STORY, practice: PRACTICE })
    expect(statuses(g)).toBe('cards:done story:active practice:upcoming')
  })

  it('hands it to Practice once the story has been read', () => {
    const g = buildGuide({ counts: CLEAR, story: STORY, practice: PRACTICE, storyReadToday: true })
    expect(statuses(g)).toBe('cards:done story:done practice:active')
    expect(g.steps[2].cta).toBe('Practise these')
  })

  it('only ever offers a CTA on the active step', () => {
    const g = buildGuide({ counts: QUEUE, story: STORY, practice: PRACTICE })
    expect(g.steps.filter(s => s.cta)).toHaveLength(1)
  })
})

describe('it does not manufacture work', () => {
  it('skips a story that does not exist rather than inventing one', () => {
    const g = buildGuide({ counts: CLEAR, story: null, practice: PRACTICE })
    expect(statuses(g)).toBe('cards:done story:unavailable practice:active')
    expect(g.steps[1].detail).toBe('No chapter waiting yet')
  })

  it('states a locked chapter honestly, and names the mechanic that opens it', () => {
    const g = buildGuide({
      counts: QUEUE, story: { ...STORY, locked: true }, practice: PRACTICE,
    })
    expect(g.steps[1].status).toBe(STATUS.unavailable)
    expect(g.steps[1].unlockHint).toBe('Finish cards to unlock')
    expect(g.steps[1].cta).toBeFalsy()
  })

  it('completes Practice on "nothing needs attention", never on a fake record of doing it', () => {
    // There is no per-day practice record in the schema, so this is the only
    // honest way Practice can be complete.
    const g = buildGuide({
      counts: { ...CLEAR, weakCount: 0, grammarDueCount: 0 }, story: STORY, practice: PRACTICE,
      storyReadToday: true,
    })
    expect(statuses(g)).toBe('cards:done story:done practice:done')
    expect(g.steps[2].detail).toBe('Nothing needs attention')
    expect(g.complete).toBe(true)
  })

  it('reaches the complete state through skips too, without ever showing a CTA', () => {
    const g = buildGuide({
      counts: { ...CLEAR, weakCount: 0, grammarDueCount: 0 }, story: null, practice: PRACTICE,
    })
    expect(g.complete).toBe(true)
    expect(g.steps.some(s => s.cta)).toBe(false)
  })
})

describe('what it refuses to claim', () => {
  it('says nothing numeric while the counts are unloaded or failed', () => {
    for (const counts of [{ loaded: false }, { loaded: true, failed: true, dueCount: 99 }]) {
      const g = buildGuide({ counts, story: STORY, practice: PRACTICE })
      expect(g.steps[0].status).toBe(STATUS.unknown)
      expect(g.steps[0].detail).toBeNull()
      expect(g.steps[0].minutes).toBeNull()
      // Still reachable: a screen that cannot count must not lock the door.
      expect(g.steps[0].cta).toBe('Open cards')
    }
  })

  it('omits % known for a reward chapter, which carries no readability', () => {
    const g = buildGuide({
      counts: CLEAR, practice: PRACTICE,
      story: { title: 'Chapter 3', levelLabel: 'HSK 2', knownPct: null },
    })
    expect(g.steps[1].facts).toEqual(['HSK 2'])
  })

  it('prefers what was done today over the absence of work, when it knows it', () => {
    expect(buildGuide({ counts: CLEAR, studiedToday: 22 }).steps[0].detail).toBe('22 cards practiced')
    expect(buildGuide({ counts: CLEAR, studiedToday: 0 }).steps[0].detail).toBe("You're caught up")
    expect(buildGuide({ counts: CLEAR, studiedToday: 1 }).steps[0].detail).toBe('1 card practiced')
  })
})

describe('where a step that is still ahead sits', () => {
  it('names the step it follows, one and two places out', () => {
    const g = buildGuide({ counts: QUEUE, story: STORY, practice: PRACTICE })
    expect(upcomingLabel(g.steps, 'story')).toBe('Next after cards')
    expect(upcomingLabel(g.steps, 'practice')).toBe('After your story')
  })

  it('re-points as the day moves', () => {
    const g = buildGuide({ counts: CLEAR, story: STORY, practice: PRACTICE })
    expect(upcomingLabel(g.steps, 'practice')).toBe('Next after the story')
  })

  it('says nothing for a step that is active, finished or blocked', () => {
    const g = buildGuide({ counts: QUEUE, story: { ...STORY, locked: true }, practice: PRACTICE })
    expect(upcomingLabel(g.steps, 'cards')).toBeNull()
    // Blocked, not queued: `unlockHint` already names the mechanic, and two
    // sentences about the same step is how a quiet row becomes a card.
    expect(g.steps[1].status).toBe(STATUS.unavailable)
    expect(upcomingLabel(g.steps, 'story')).toBeNull()
    const done = buildGuide({ counts: CLEAR, story: STORY, practice: PRACTICE, storyReadToday: true })
    expect(upcomingLabel(done.steps, 'cards')).toBeNull()
  })

  it('never points backwards, and survives nonsense', () => {
    const g = buildGuide({ counts: CLEAR, story: STORY, practice: PRACTICE, storyReadToday: true })
    // Practice is the active step here; nothing is ahead of it.
    expect(upcomingLabel(g.steps, 'practice')).toBeNull()
    expect(upcomingLabel(null, 'story')).toBeNull()
    expect(upcomingLabel(g.steps, 'nope')).toBeNull()
  })
})

describe('the words on the screen', () => {
  it('leads with the WHOLE session and breaks it down underneath (P14-5D)', () => {
    // The device bug: Home headlined the reviews (74) while the Cards tab served
    // reviews plus new (136). One number now, and it is the session.
    const g = buildGuide({ counts: QUEUE, story: STORY, practice: PRACTICE })
    expect(g.steps[0].detail).toBe('22 cards ready')
    expect(g.steps[0].facts).toEqual(['17 reviews', '5 new'])
  })

  it('prefers studyAvailability\'s own total when it is present', () => {
    // `totalReady` comes from the shared derivation and can differ from the naive
    // sum — the gentle-return cap is the case that matters.
    const g = buildGuide({ counts: { ...QUEUE, totalReady: 20, cappedByReturn: true } })
    expect(g.steps[0].metric).toEqual({ value: 20, label: 'cards ready' })
    expect(g.steps[0].capped).toBe(true)
  })

  it('says "card" in the singular, and counts nothing when nothing is ready', () => {
    expect(buildGuide({ counts: { ...LOADED, newCount: 1, learnCount: 0, dueCount: 0 } }).steps[0].metric)
      .toEqual({ value: 1, label: 'card ready' })
    expect(buildGuide({ counts: { ...LOADED, newCount: 1, learnCount: 0, dueCount: 0 } }).steps[0].facts)
      .toEqual(['1 new'])
    expect(buildGuide({ counts: CLEAR }).steps[0].metric).toBeUndefined()
  })

  it('counts the practice signal in the learner’s words, singular and plural', () => {
    const one = buildGuide({ counts: { ...CLEAR, weakCount: 1 }, storyReadToday: true, story: STORY, practice: PRACTICE })
    expect(one.steps[2].facts).toEqual(['1 word keeps slipping'])
    const many = buildGuide({ counts: { ...CLEAR, weakCount: 6 }, storyReadToday: true, story: STORY, practice: PRACTICE })
    expect(many.steps[2].facts).toEqual(['6 words keep slipping'])
    const grammar = buildGuide({
      counts: { ...CLEAR, weakCount: 0, grammarDueCount: 2 }, storyReadToday: true, story: STORY,
      practice: { key: 'grammarpractice', title: 'Grammar review', cta: 'Review patterns' },
    })
    expect(grammar.steps[2].facts).toEqual(['2 patterns are due'])
  })

  it('puts the position and an honest estimate in the context line', () => {
    expect(guideContextLine(buildGuide({ counts: QUEUE, story: STORY, practice: PRACTICE })))
      .toBe('Step 1 of 3 · about 6 min')
    // Story and Practice carry no derivable duration, so the line drops it
    // rather than guessing one.
    expect(guideContextLine(buildGuide({ counts: CLEAR, story: STORY, practice: PRACTICE })))
      .toBe('Step 2 of 3')
    expect(guideContextLine(buildGuide({ counts: { ...CLEAR, weakCount: 0 }, story: STORY, storyReadToday: true })))
      .toBe('Training complete')
  })

  it('summarises a finished day from what happened, not from zeroes', () => {
    const done = buildGuide({
      counts: { ...CLEAR, weakCount: 0 }, story: STORY, storyReadToday: true, studiedToday: 22,
    })
    expect(done.summary.parts).toEqual(['22 words practiced', '1 chapter read'])
    expect(done.summary.headline).toBe('Training complete')
    expect(done.summary.earned).toBe(true)
  })

  it('does not congratulate a learner who did nothing, on a day with nothing to do', () => {
    // Caught up, no chapter unlocked, nothing slipping, nothing practised. The
    // sequence is finished in the sense that no step has work in it — which is
    // NOT the same as having trained, and must not be dressed up as it.
    const quiet = buildGuide({ counts: { ...CLEAR, weakCount: 0 }, story: null, studiedToday: 0 })
    expect(quiet.complete).toBe(true)
    expect(quiet.summary.headline).toBe('Nothing waiting today')
    expect(quiet.summary.parts).toEqual(["You're caught up"])
    expect(quiet.summary.earned).toBe(false)
    expect(guideContextLine(quiet)).toBe('Nothing waiting today')
  })
})
