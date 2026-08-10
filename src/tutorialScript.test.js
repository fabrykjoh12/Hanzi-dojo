import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PHASES, ACTIONS, TEACHING_GOALS, CARD_COUNT, STORY_PANEL_COUNT,
  initialTutorialState, stateId, position, isComplete,
  actionsFor, view, advance, defaultWalkthrough, runTutorial,
  serializeTutorial, resumeTutorialState, goalsThrough,
} from './tutorialScript'
import { TUTORIAL_CARDS, TUTORIAL_STORY, GRADE_GLOSSES } from './tutorialFixtures'
import { GRADES, GRADE_KEYS } from './grades'

// The onboarding tutorial, before any of it is drawn.
//
// The audit's worst finding was that nothing in the product explains what
// Again / Hard / Good / Easy mean. These specs are what stops that happening
// again: the teaching goals are named, and a walkthrough has to visit all of
// them. A future tidy-up that deletes the grade explanation fails here.

const walk = (steps) => runTutorial(steps)
const last = (states) => states[states.length - 1]

describe('the shape of the journey', () => {
  it('starts at the welcome, with one thing to do', () => {
    const s = initialTutorialState()
    expect(stateId(s)).toBe('welcome')
    expect(actionsFor(s)).toEqual([ACTIONS.CONTINUE])
    expect(isComplete(s)).toBe(false)
  })

  it('is welcome → three cards → recap → unlock → story → loop → account', () => {
    const ids = walk(defaultWalkthrough()).map(stateId)
    expect(ids).toEqual([
      'welcome',
      'card-1-front', 'card-1-back',
      'card-2-front', 'card-2-back',
      'card-3-front', 'card-3-back',
      'recap', 'unlock', 'story-1', 'story-2', 'loop', 'account',
    ])
  })

  it('terminates', () => {
    expect(isComplete(last(walk(defaultWalkthrough())))).toBe(true)
  })

  it('offers nothing more once complete', () => {
    const done = last(walk(defaultWalkthrough()))
    expect(actionsFor(done)).toEqual([])
    for (const action of Object.values(ACTIONS)) {
      expect(advance(done, action, 'good')).toBe(done)
    }
  })

  it('is roughly a dozen taps — the whole point of it', () => {
    // Nine before the account ask: Start, then reveal+grade three times, then
    // four to walk the payoff. If this number grows, the tutorial has stopped
    // being 90 seconds.
    expect(defaultWalkthrough().length).toBe(12)
  })
})

describe('no loops', () => {
  it('never revisits a state', () => {
    const ids = walk(defaultWalkthrough()).map(stateId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('moves strictly forward on every action that is not Replay', () => {
    let s = initialTutorialState()
    for (const step of defaultWalkthrough()) {
      const before = position(s)
      s = advance(s, step.action, step.payload)
      expect(position(s)).toBeGreaterThan(before)
    }
  })

  it('cannot be trapped by replaying forever', () => {
    let s = initialTutorialState()
    s = advance(s, ACTIONS.CONTINUE)
    s = advance(s, ACTIONS.REVEAL)
    const before = position(s)
    for (let i = 0; i < 50; i += 1) s = advance(s, ACTIONS.REPLAY)
    expect(position(s)).toBe(before)
    // …and the way out is still open.
    expect(actionsFor(s)).toContain(ACTIONS.GRADE)
  })
})

describe('legal actions', () => {
  it('refuses to grade a card that has not been revealed', () => {
    let s = advance(initialTutorialState(), ACTIONS.CONTINUE)
    expect(stateId(s)).toBe('card-1-front')
    expect(actionsFor(s)).toEqual([ACTIONS.REVEAL])
    // Identity, not a copy: nothing happened at all.
    expect(advance(s, ACTIONS.GRADE, 'good')).toBe(s)
  })

  it('refuses Replay before the answer is on screen', () => {
    const s = advance(initialTutorialState(), ACTIONS.CONTINUE)
    expect(advance(s, ACTIONS.REPLAY)).toBe(s)
  })

  it('refuses to reveal a card twice', () => {
    let s = advance(initialTutorialState(), ACTIONS.CONTINUE)
    s = advance(s, ACTIONS.REVEAL)
    expect(advance(s, ACTIONS.REVEAL)).toBe(s)
  })

  it('refuses a grade that is not one of the four', () => {
    let s = advance(initialTutorialState(), ACTIONS.CONTINUE)
    s = advance(s, ACTIONS.REVEAL)
    // Including the scheduler's own numbers: this contract is keys, and a 2
    // that used to mean Good must not be accepted as one.
    for (const bad of [0, 2, -1, 4, 1.5, null, undefined, 'Good', 'GOOD', '', NaN]) {
      expect(advance(s, ACTIONS.GRADE, bad)).toBe(s)
    }
  })

  it('refuses an action it has never heard of', () => {
    const s = initialTutorialState()
    expect(advance(s, 'skip')).toBe(s)
    expect(advance(s, ACTIONS.GRADE, 'good')).toBe(s)
  })
})

describe('the three cards', () => {
  it('shows each fixture word once, in order', () => {
    const words = walk(defaultWalkthrough())
      .map(view)
      .filter(v => v.phase === PHASES.CARD && !v.revealed)
      .map(v => v.card.word)
    expect(words).toEqual(TUTORIAL_CARDS.map(c => c.word))
    expect(words.length).toBe(CARD_COUNT)
  })

  it('records exactly one grade per card, and nothing else', () => {
    const done = last(walk(defaultWalkthrough('easy')))
    expect(done.grades).toEqual(['easy', 'easy', 'easy'])
  })

  it('accepts every grade — the tutorial has no opinion about which is true', () => {
    for (const key of GRADE_KEYS) {
      const done = last(walk(defaultWalkthrough(key)))
      expect(isComplete(done)).toBe(true)
      expect(done.grades).toEqual([key, key, key])
    }
  })

  it('takes a different grade per card just as happily', () => {
    const steps = defaultWalkthrough()
    let g = 0
    for (const step of steps) if (step.action === ACTIONS.GRADE) step.payload = GRADE_KEYS[g++]
    const done = last(walk(steps))
    expect(done.grades).toEqual(['again', 'hard', 'good'])
    expect(isComplete(done)).toBe(true)
  })

  it('cannot reach the recap before all three are graded', () => {
    let s = advance(initialTutorialState(), ACTIONS.CONTINUE)
    for (let i = 0; i < CARD_COUNT; i += 1) {
      expect(s.phase).toBe(PHASES.CARD)
      s = advance(s, ACTIONS.REVEAL)
      expect(s.phase).toBe(PHASES.CARD)
      s = advance(s, ACTIONS.GRADE, 'good')
    }
    expect(s.phase).toBe(PHASES.RECAP)
  })
})

describe('coaching decreases', () => {
  const coachingFor = (cardIndex) => {
    const states = walk(defaultWalkthrough())
    const front = states.find(s => s.phase === PHASES.CARD && s.cardIndex === cardIndex && !s.revealed)
    const back = states.find(s => s.phase === PHASES.CARD && s.cardIndex === cardIndex && s.revealed)
    return view(front).coach.length + view(back).coach.length
  }

  it('teaches the first card, hints at the second, and gets out of the way for the third', () => {
    expect(coachingFor(0)).toBeGreaterThan(coachingFor(1))
    expect(coachingFor(1)).toBeGreaterThan(coachingFor(2))
    expect(coachingFor(2)).toBe(0)
  })

  it('leaves the last card as the plain product', () => {
    const states = walk(defaultWalkthrough())
    const thirdBack = states.find(s => s.phase === PHASES.CARD && s.cardIndex === 2 && s.revealed)
    const v = view(thirdBack)
    expect(v.coach).toEqual([])
    expect(v.glosses).toBe(null)
    expect(v.showGrades).toBe(true)      // …but the real controls, as always
  })

  it('says the grade meanings once, on the first revealed card only', () => {
    const withGlosses = walk(defaultWalkthrough())
      .map(view)
      .filter(v => v.glosses !== null)
    expect(withGlosses).toHaveLength(1)
    expect(withGlosses[0].id).toBe('card-1-back')
    expect(withGlosses[0].glosses).toEqual(GRADE_GLOSSES)
  })

  it('gives one gloss per real grade, in the real order', () => {
    expect(GRADE_GLOSSES).toHaveLength(GRADES.length)
    expect(GRADES.map(g => g.label)).toEqual(['Again', 'Hard', 'Good', 'Easy'])
  })

  it('only says what a grade does after the learner has pressed one', () => {
    // The line about scheduling is on card 2 — it cannot be understood before
    // there is a grade to have decided anything.
    const states = walk(defaultWalkthrough())
    const secondFront = states.find(s => s.phase === PHASES.CARD && s.cardIndex === 1 && !s.revealed)
    expect(view(secondFront).coach).toHaveLength(1)
    expect(view(secondFront).coach[0].text).toMatch(/grade/i)
    expect(secondFront.grades).toHaveLength(1)
  })
})

describe('pronunciation is offered, never required', () => {
  const firstBack = () => {
    let s = advance(initialTutorialState(), ACTIONS.CONTINUE)
    return advance(s, ACTIONS.REVEAL)
  }

  it('points at Replay on the first revealed card', () => {
    const v = view(firstBack())
    expect(v.coach.some(c => c.anchor === 'audio')).toBe(true)
  })

  it('stops pointing once the learner has heard it', () => {
    const heard = advance(firstBack(), ACTIONS.REPLAY)
    expect(view(heard).coach.some(c => c.anchor === 'audio')).toBe(false)
    // The grading line stays — it is a different lesson.
    expect(view(heard).coach.some(c => c.anchor === 'grades')).toBe(true)
  })

  it('does not count as revealing or grading anything', () => {
    const heard = advance(firstBack(), ACTIONS.REPLAY)
    expect(stateId(heard)).toBe('card-1-back')
    expect(heard.cardIndex).toBe(0)
    expect(heard.grades).toEqual([])
  })

  it('reaches the same end whether or not it is ever tapped', () => {
    const silent = last(walk(defaultWalkthrough()))
    const withReplays = defaultWalkthrough()
    // Tap Replay before every grade.
    const noisy = []
    for (const step of withReplays) {
      if (step.action === ACTIONS.GRADE) noisy.push({ action: ACTIONS.REPLAY })
      noisy.push(step)
    }
    const heard = last(walk(noisy))
    expect(isComplete(heard)).toBe(true)
    expect(stateId(heard)).toBe(stateId(silent))
    expect(heard.grades).toEqual(silent.grades)
    expect(heard.goalsSeen).toEqual(silent.goalsSeen)
  })

  it('forgets it between cards — it is a hint, not a score', () => {
    let s = advance(advance(initialTutorialState(), ACTIONS.CONTINUE), ACTIONS.REVEAL)
    s = advance(s, ACTIONS.REPLAY)
    s = advance(s, ACTIONS.GRADE, 'good')
    expect(s.replayed).toBe(false)
  })
})

describe('the payoff', () => {
  it('opens the story only after the session is finished', () => {
    const ids = walk(defaultWalkthrough()).map(stateId)
    expect(ids.indexOf('recap')).toBeLessThan(ids.indexOf('unlock'))
    expect(ids.indexOf('unlock')).toBeLessThan(ids.indexOf('story-1'))
    expect(ids.indexOf('story-2')).toBeLessThan(ids.indexOf('loop'))
  })

  it('marks the two moments that are worth feeling', () => {
    const felt = walk(defaultWalkthrough()).map(view).filter(v => v.feedback)
    expect(felt.map(v => v.id)).toEqual(['recap', 'unlock'])
    expect(felt.every(v => v.feedback === 'success')).toBe(true)
  })

  it('shows the words they just learned, in Chinese', () => {
    const learned = TUTORIAL_CARDS.map(c => c.word)
    const marked = TUTORIAL_STORY.panels.flatMap(p => p.known)
    // Every emphasised token is a word the tutorial actually taught…
    for (const word of marked) expect(learned).toContain(word)
    // …and the scene really does use them, not just claim to.
    for (const word of marked) {
      const panel = TUTORIAL_STORY.panels.find(p => p.known.includes(word))
      expect(panel.text).toContain(word)
    }
    // At least two of the three, per the approved concept.
    expect(new Set(marked).size).toBeGreaterThanOrEqual(2)
  })

  it('sets the scene once, on the first panel only', () => {
    const panels = walk(defaultWalkthrough()).map(view).filter(v => v.phase === PHASES.STORY)
    expect(panels).toHaveLength(STORY_PANEL_COUNT)
    expect(panels[0].setting).toBeTruthy()
    expect(panels.slice(1).every(p => p.setting === null)).toBe(true)
  })

  it('stays two panels — this is a moment, not a chapter', () => {
    expect(STORY_PANEL_COUNT).toBe(2)
  })
})

describe('teaching goals', () => {
  it('visits every named goal on the ordinary path', () => {
    const done = last(walk(defaultWalkthrough()))
    for (const goal of TEACHING_GOALS) expect(done.goalsSeen).toContain(goal)
  })

  it('teaches what all four grades mean — the gap the audit found', () => {
    const done = last(walk(defaultWalkthrough()))
    for (const goal of ['againMeaning', 'hardMeaning', 'goodMeaning', 'easyMeaning']) {
      expect(done.goalsSeen).toContain(goal)
    }
  })

  it('claims no goal it did not actually teach', () => {
    const done = last(walk(defaultWalkthrough()))
    for (const goal of done.goalsSeen) expect(TEACHING_GOALS).toContain(goal)
  })

  it('gets there without ever hearing a word', () => {
    // Same path, no Replay anywhere. The pronunciation lesson is the control
    // being offered, not the sound arriving.
    const done = last(walk(defaultWalkthrough()))
    expect(done.goalsSeen).toContain('pronunciation')
  })

  it('records each goal once', () => {
    const done = last(walk(defaultWalkthrough()))
    expect(new Set(done.goalsSeen).size).toBe(done.goalsSeen.length)
  })
})

describe('determinism and serialisability', () => {
  it('gives the same result for the same steps, every time', () => {
    const a = last(walk(defaultWalkthrough('hard')))
    const b = last(walk(defaultWalkthrough('hard')))
    expect(a).toEqual(b)
  })

  it('survives a round trip through JSON — nothing in it is a function or a date', () => {
    for (const s of walk(defaultWalkthrough())) {
      expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    }
  })

  it('carries only what a resume would need', () => {
    // The shape Commit 5 will persist. Anything added here is something a
    // killed app has to restore correctly, so the list is deliberately short.
    expect(Object.keys(initialTutorialState()).sort()).toEqual(
      ['cardIndex', 'goalsSeen', 'grades', 'phase', 'replayed', 'revealed', 'storyPanel']
    )
  })

  it('can be picked back up from any state it passed through', () => {
    const states = walk(defaultWalkthrough())
    for (let i = 0; i < states.length; i += 1) {
      const resumed = JSON.parse(JSON.stringify(states[i]))
      expect(actionsFor(resumed)).toEqual(actionsFor(states[i]))
      expect(stateId(resumed)).toBe(stateId(states[i]))
    }
  })
})

describe('resuming after the app was closed', () => {
  it('writes a position, and nothing that can be worked out from one', () => {
    // goalsSeen is the set of goals every state up to here declared — a
    // function of the position. Storing it would be keeping an answer we can
    // always recompute, and would let a hand-edited value claim a lesson that
    // never happened.
    const s = walk(defaultWalkthrough())[5]
    expect(Object.keys(serializeTutorial(s)).sort())
      .toEqual(['cardIndex', 'phase', 'revealed', 'storyPanel'])
    expect(serializeTutorial(s).goalsSeen).toBe(undefined)
    // Which buttons were pressed is a record of a run, not a place in one.
    expect(serializeTutorial(s).grades).toBe(undefined)
  })

  it('comes back to exactly the state it left', () => {
    for (const s of walk(defaultWalkthrough())) {
      if (isComplete(s)) continue
      const back = resumeTutorialState(JSON.parse(JSON.stringify(serializeTutorial(s))))
      expect(stateId(back)).toBe(stateId(s))
      expect(actionsFor(back)).toEqual(actionsFor(s))
      expect(back.goalsSeen).toEqual(s.goalsSeen)
    }
  })

  it('finishes from wherever it was picked up', () => {
    const states = walk(defaultWalkthrough())
    for (let i = 0; i < states.length - 1; i += 1) {
      const back = resumeTutorialState(serializeTutorial(states[i]))
      // Replay the remaining steps from here.
      let s = back
      const remaining = defaultWalkthrough().slice(0)
      for (const step of remaining) {
        if (position(s) > position(states[i])) break
        s = advance(s, step.action, step.payload)
      }
      expect(position(s)).toBeGreaterThanOrEqual(position(states[i]))
    }
  })

  it('forgets whether Replay was tapped — a hint, not a position', () => {
    let s = advance(advance(initialTutorialState(), ACTIONS.CONTINUE), ACTIONS.REVEAL)
    s = advance(s, ACTIONS.REPLAY)
    expect(s.replayed).toBe(true)
    expect(serializeTutorial(s).replayed).toBe(undefined)
    expect(resumeTutorialState(serializeTutorial(s)).replayed).toBe(false)
  })

  it('starts over rather than trusting something it does not recognise', () => {
    for (const junk of [
      null, undefined, 'card-2', 42, [],
      { phase: 'nonsense', cardIndex: 0, revealed: false, storyPanel: 0, grades: [] },
      { phase: 'card', cardIndex: 9, revealed: false, storyPanel: 0, grades: [] },
      { phase: 'card', cardIndex: -1, revealed: false, storyPanel: 0, grades: [] },
      { phase: 'card', cardIndex: 0, revealed: 'yes', storyPanel: 0, grades: [] },
      { phase: 'card', cardIndex: 0, revealed: false, storyPanel: 7 },
    ]) {
      expect(resumeTutorialState(junk)).toBe(null)
    }
  })

  it('recomputes the goals rather than believing a stored list', () => {
    const states = walk(defaultWalkthrough())
    for (const s of states) expect(goalsThrough(s)).toEqual(s.goalsSeen)
  })
})

describe('the sandbox', () => {
  // The prose in these two files names everything they are forbidden to touch,
  // so the checks below read the CODE. Neither file contains a `//` inside a
  // string, which is what makes a stripper this simple honest here.
  const code = (name) => readFileSync(new URL('./' + name, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')

  const source = code('tutorialScript.js')
  const fixtures = code('tutorialFixtures.js')

  it('imports nothing but its own fixtures', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1])
    // grades.js is the canonical Again/Hard/Good/Easy table and imports
    // nothing itself — it is the one thing this may reach for.
    expect(imports).toEqual(['./grades', './tutorialFixtures'])
    expect([...fixtures.matchAll(/from '([^']+)'/g)]).toHaveLength(0)
  })

  it('cannot reach scheduling, persistence, the queue or the router', () => {
    // Structural, not aspirational: a tutorial that could write a grade could
    // quietly ruin a learner's first schedule.
    for (const forbidden of [
      'supabase', 'srs', 'fsrs', 'localStorage', 'indexedDB', 'prefsGet',
      'fetch(', 'navigate', 'useState', 'useEffect', 'document.', 'window.',
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase())
      expect(fixtures.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('decides nothing about how it looks', () => {
    for (const visual of ['px', 'color', 'style', 'animation', 'className', 'jsx']) {
      expect(source.toLowerCase()).not.toContain(visual.toLowerCase())
      expect(fixtures.toLowerCase()).not.toContain(visual.toLowerCase())
    }
  })
})

describe('the fixture words', () => {
  // Verified against the live vocabulary table on 2026-08-10: three HSK 1 rows,
  // active, each with a clip in the public bucket. These specs stop the ids
  // drifting into decoration — a tutorial teaching words the product does not
  // contain would be worse than no tutorial.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  it('are three beginner words, each a real vocabulary row', () => {
    expect(TUTORIAL_CARDS).toHaveLength(3)
    for (const c of TUTORIAL_CARDS) {
      expect(c.vocabId).toMatch(UUID)
      expect(c.level).toBe(1)
      expect(c.word.length).toBeGreaterThan(0)
      expect(c.reading.length).toBeGreaterThan(0)
      expect(c.meaning.length).toBeGreaterThan(0)
    }
  })

  it('carries a public clip for each, so the tutorial can speak signed-out', () => {
    for (const c of TUTORIAL_CARDS) {
      expect(c.audioPath).toMatch(/^chinese\/hsk_3\/level_1\/.+\.mp3$/)
    }
  })

  it('reads as new cards, because that is what they are', () => {
    for (const c of TUTORIAL_CARDS) expect(c.state).toBe('new')
  })

  it('has no duplicates — three words, three ids', () => {
    expect(new Set(TUTORIAL_CARDS.map(c => c.word)).size).toBe(3)
    expect(new Set(TUTORIAL_CARDS.map(c => c.vocabId)).size).toBe(3)
    expect(new Set(TUTORIAL_CARDS.map(c => c.audioPath)).size).toBe(3)
  })
})
