import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PHASES, ACTIONS, TEACHING_GOALS, CARD_COUNT,
  initialTutorialState, stateId, position, isComplete,
  actionsFor, view, advance, retreat, defaultWalkthrough, runTutorial,
  serializeTutorial, resumeTutorialState, goalsThrough,
} from './tutorialScript'
import { TUTORIAL_CARDS, TUTORIAL_SCENE, TUTORIAL_INTERVALS, TUTORIAL_LOOKUP } from './tutorialFixtures'
import { previewLabels } from './srs'
import { gradeGlosses } from './gradePrompt'
import { GRADES, GRADE_KEYS } from './grades'

// The onboarding tutorial, before any of it is drawn.
//
// The audit's worst finding was that nothing in the product explains what
// Again / Hard / Good / Easy mean. These specs are what stops that happening
// again: the teaching goals are named, and a walkthrough has to visit all of
// them. A future tidy-up that deletes the grade explanation fails here.

const walk = (steps) => runTutorial(steps)
const last = (states) => states[states.length - 1]
// Two continues now stand between the welcome and the first card: the scene,
// unreadable, sits in between (P12-1).
const toFirstCard = () => advance(advance(initialTutorialState(), ACTIONS.CONTINUE), ACTIONS.CONTINUE)

describe('the shape of the journey', () => {
  it('starts at the welcome, with one thing to do', () => {
    const s = initialTutorialState()
    expect(stateId(s)).toBe('welcome')
    expect(actionsFor(s)).toEqual([ACTIONS.CONTINUE])
    expect(isComplete(s)).toBe(false)
  })

  it('is welcome → scene → three cards → recap → unlock → the same scene → tap a word → account', () => {
    const ids = walk(defaultWalkthrough()).map(stateId)
    expect(ids).toEqual([
      'welcome', 'scene-before',
      'card-1-front', 'card-1-back',
      'card-2-front', 'card-2-back',
      'card-3-front', 'card-3-back',
      'recap', 'unlock', 'scene-after',
      'tap-word', 'tap-word-looked', 'account',
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
    // Start, the unreadable scene, reveal+grade three times, three to walk the
    // payoff, one tap on the unknown word, and the account. If this number
    // grows, the tutorial has stopped being about a hundred seconds.
    expect(defaultWalkthrough().length).toBe(13)
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
    let s = toFirstCard()
    s = advance(s, ACTIONS.REVEAL)
    const before = position(s)
    for (let i = 0; i < 50; i += 1) s = advance(s, ACTIONS.REPLAY)
    expect(position(s)).toBe(before)
    // …and the way out is still open.
    expect(actionsFor(s)).toContain(ACTIONS.GRADE)
  })
})

// ── Back — the hardware button's walk (P12-0) ────────────────────────────────
// Not an ACTION: the four actions are the learner's forward vocabulary and the
// no-loops invariant above depends on every one of them increasing position().
// retreat() is the platform's, and it is the one thing allowed to decrease it.

describe('retreat', () => {
  it('steps position back by exactly one state, everywhere', () => {
    let s = initialTutorialState()
    for (const step of defaultWalkthrough()) {
      const before = s
      s = advance(s, step.action, step.payload)
      // ACCOUNT is complete — the runner has handed over, nothing to step into.
      if (isComplete(s)) continue
      const back = retreat(s)
      expect(back, 'retreat from ' + stateId(s)).not.toBe(null)
      expect(stateId(back)).toBe(stateId(before))
      expect(position(back)).toBe(position(s) - 1)
    }
  })

  it('walks the whole way back to the welcome, and only the welcome says stop', () => {
    // Drive to the last pre-complete state, then Back all the way home.
    const states = runTutorial(defaultWalkthrough().slice(0, -1))
    let s = states[states.length - 1]
    const walked = []
    let guard = 0
    while (s !== null && guard < 50) {
      guard += 1
      walked.push(position(s))
      s = retreat(s)
    }
    expect(guard).toBeLessThan(50)
    // Strictly descending, ending at the welcome — Back can never make
    // progress, loop, or find a second way out.
    for (let i = 1; i < walked.length; i += 1) expect(walked[i]).toBeLessThan(walked[i - 1])
    expect(walked[walked.length - 1]).toBe(0)
  })

  it('un-reveals a revealed card rather than skipping it', () => {
    let s = toFirstCard()
    s = advance(s, ACTIONS.REVEAL)
    const back = retreat(s)
    expect(stateId(back)).toBe('card-1-front')
    expect(back.revealed).toBe(false)
  })

  it('un-records a grade when stepping back across it, so re-grading cannot double-count', () => {
    let s = toFirstCard()
    s = advance(s, ACTIONS.REVEAL)
    s = advance(s, ACTIONS.GRADE, 'good')
    expect(s.grades).toEqual(['good'])
    const back = retreat(s)      // card-2-front → card-1-back
    expect(stateId(back)).toBe('card-1-back')
    expect(back.grades).toEqual([])
    // Forward again, with a different answer — one grade, not two.
    const again = advance(back, ACTIONS.GRADE, 'hard')
    expect(again.grades).toEqual(['hard'])
  })

  it('keeps goalsSeen — teaching that happened, happened', () => {
    let s = toFirstCard()
    s = advance(s, ACTIONS.REVEAL)
    const taught = s.goalsSeen
    expect(taught.length).toBeGreaterThan(0)
    expect(retreat(s).goalsSeen).toEqual(taught)
  })

  it('returns null at the welcome — the caller owns what leaving means', () => {
    expect(retreat(initialTutorialState())).toBe(null)
  })

  it('advance still works normally after any retreat', () => {
    // Back one, forward two, from a few places — the machine never wedges.
    let s = initialTutorialState()
    for (const step of defaultWalkthrough()) {
      s = advance(s, step.action, step.payload)
      const back = retreat(s)
      if (back === null) continue
      const forward = actionsFor(back)
      expect(forward.length, stateId(back) + ' offers nothing').toBeGreaterThan(0)
    }
    expect(isComplete(s)).toBe(true)
  })
})

// ── The reading lesson's gate (P12-6) ────────────────────────────────────────
// "See a word you don't know? Tap it" is taught the way everything here is
// taught: by making the tap the only way forward. The machine itself refuses
// Continue until the word has been looked up once — the UI never has to.

describe('the reading lesson', () => {
  const toTapWord = () => {
    const states = runTutorial(defaultWalkthrough().slice(0, -2))
    return states[states.length - 1]
  }

  it('sits between the readable scene and the account', () => {
    const ids = walk(defaultWalkthrough()).map(stateId)
    expect(ids.indexOf('scene-after')).toBeLessThan(ids.indexOf('tap-word'))
    expect(ids.indexOf('tap-word-looked')).toBeLessThan(ids.indexOf('account'))
  })

  it('refuses to continue until the word has been looked up — identity, nothing happened', () => {
    const s = toTapWord()
    expect(stateId(s)).toBe('tap-word')
    expect(actionsFor(s)).toEqual([ACTIONS.LOOKUP])
    expect(advance(s, ACTIONS.CONTINUE)).toBe(s)
  })

  it('one tap opens the way forward, and teaches the goal', () => {
    const looked = advance(toTapWord(), ACTIONS.LOOKUP)
    expect(stateId(looked)).toBe('tap-word-looked')
    expect(actionsFor(looked)).toContain(ACTIONS.CONTINUE)
    expect(looked.goalsSeen).toContain('tapUnknownWord')
    expect(advance(looked, ACTIONS.CONTINUE).phase).toBe(PHASES.ACCOUNT)
  })

  it('re-tapping is allowed and is not progress', () => {
    const looked = advance(toTapWord(), ACTIONS.LOOKUP)
    expect(advance(looked, ACTIONS.LOOKUP)).toBe(looked)
  })

  it('shows exactly one unfamiliar word, and it is not one the tutorial taught', () => {
    const taught = TUTORIAL_CARDS.map(c => c.word)
    expect(taught).not.toContain(TUTORIAL_LOOKUP.word.word)
    // The line contains the word, and stripped of it is pure punctuation — so
    // there is exactly one thing to wonder about, by construction.
    expect(TUTORIAL_LOOKUP.line).toContain(TUTORIAL_LOOKUP.word.word)
    expect(TUTORIAL_LOOKUP.line.split(TUTORIAL_LOOKUP.word.word).join('')).toMatch(/^[！。？，、\s]*$/)
  })

  it('feeds the production lookup a real vocabulary row', () => {
    // The word detail the learner sees here must be exactly what the real
    // reader would show for this word, so the fixture is shaped like the live
    // row it was copied from (verified 2026-08-12).
    const w = TUTORIAL_LOOKUP.word
    expect(w.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(w.language).toBe('chinese')
    expect(w.system).toBe('hsk_3')
    expect(w.level).toBe(1)
    expect(w.reading.length).toBeGreaterThan(0)
    expect(w.meaning.length).toBeGreaterThan(0)
    expect(w.audioPath).toMatch(/^chinese\/hsk_3\/level_1\/.+\.mp3$/)
  })

  it('retreat un-looks first, then leaves — and the gate re-arms', () => {
    const looked = advance(toTapWord(), ACTIONS.LOOKUP)
    const unlooked = retreat(looked)
    expect(stateId(unlooked)).toBe('tap-word')
    expect(actionsFor(unlooked)).toEqual([ACTIONS.LOOKUP])
    expect(retreat(unlooked).phase).toBe(PHASES.SCENE_AFTER)
  })
})

describe('legal actions', () => {
  it('refuses to grade a card that has not been revealed', () => {
    let s = toFirstCard()
    expect(stateId(s)).toBe('card-1-front')
    expect(actionsFor(s)).toEqual([ACTIONS.REVEAL])
    // Identity, not a copy: nothing happened at all.
    expect(advance(s, ACTIONS.GRADE, 'good')).toBe(s)
  })

  it('refuses Replay before the answer is on screen', () => {
    const s = toFirstCard()
    expect(advance(s, ACTIONS.REPLAY)).toBe(s)
  })

  it('refuses to reveal a card twice', () => {
    let s = toFirstCard()
    s = advance(s, ACTIONS.REVEAL)
    expect(advance(s, ACTIONS.REVEAL)).toBe(s)
  })

  it('refuses a grade that is not one of the four', () => {
    let s = toFirstCard()
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
    let s = toFirstCard()
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
    // New cards, so the meanings are about familiarity rather than recall.
    expect(withGlosses[0].glosses).toEqual(gradeGlosses('new'))
    expect(withGlosses[0].glosses).toEqual(['New to me', 'Barely knew it', 'Knew it', 'Already knew it'])
  })

  it('gives one gloss per real grade, in the real order', () => {
    expect(gradeGlosses('new')).toHaveLength(GRADES.length)
    expect(GRADES.map(g => g.label)).toEqual(['Again', 'Hard', 'Good', 'Easy'])
  })

  it('shows the schedule preview on cards 2 and 3 — and never on card 1', () => {
    // Card 1 carries the MEANINGS; the intervals arrive one card later, in the
    // same slot, so what a grade does is demonstrated right after what it says
    // has been taught (P12-3). Both at once would be two explanations of one
    // row of buttons.
    const views = walk(defaultWalkthrough()).map(view)
    for (const v of views.filter(x => x.phase === PHASES.CARD)) {
      if (!v.revealed) { expect(v.intervals).toBe(null); continue }
      if (v.cardIndex === 0) {
        expect(v.glosses).not.toBe(null)
        expect(v.intervals).toBe(null)
      } else {
        expect(v.glosses).toBe(null)
        expect(v.intervals).toBe(TUTORIAL_INTERVALS)
      }
    }
  })

  it('previews the intervals the real scheduler would actually give', () => {
    // The fixture exists because the live preview is non-deterministic (fuzz
    // on the longer intervals) and a tutorial must render the same on every
    // device — but fixture must never mean fiction. The learning steps are the
    // production values byte for byte, and the Easy preview sits inside the
    // production fuzz band. A scheduler tuning change fails HERE, loudly,
    // instead of quietly letting the tutorial lie about the schedule.
    const real = previewLabels(TUTORIAL_CARDS[0])
    expect(TUTORIAL_INTERVALS[0]).toBe(real[0])
    expect(TUTORIAL_INTERVALS[1]).toBe(real[1])
    expect(TUTORIAL_INTERVALS[2]).toBe(real[2])
    expect(TUTORIAL_INTERVALS[3]).toMatch(/^\d+ days$/)
    expect(real[3]).toMatch(/^\d+ days$/)
    const shown = parseInt(TUTORIAL_INTERVALS[3], 10)
    // Sample the fuzz band rather than trusting one roll of it.
    const band = new Set()
    for (let i = 0; i < 40; i += 1) band.add(parseInt(previewLabels(TUTORIAL_CARDS[0])[3], 10))
    expect([...band].some(d => Math.abs(d - shown) <= 1)).toBe(true)
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
  const firstBack = () => advance(toFirstCard(), ACTIONS.REVEAL)

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
    let s = advance(toFirstCard(), ACTIONS.REVEAL)
    s = advance(s, ACTIONS.REPLAY)
    s = advance(s, ACTIONS.GRADE, 'good')
    expect(s.replayed).toBe(false)
  })
})

describe('the payoff — the scene, twice (P12-1)', () => {
  it('shows the scene unreadable before a single card, and readable only after the unlock', () => {
    const ids = walk(defaultWalkthrough()).map(stateId)
    expect(ids.indexOf('scene-before')).toBeLessThan(ids.indexOf('card-1-front'))
    expect(ids.indexOf('recap')).toBeLessThan(ids.indexOf('unlock'))
    expect(ids.indexOf('unlock')).toBeLessThan(ids.indexOf('scene-after'))
  })

  it('renders the EXACT same scene both times — one fixture, two views', () => {
    const views = walk(defaultWalkthrough()).map(view)
    const before = views.find(v => v.id === 'scene-before')
    const after = views.find(v => v.id === 'scene-after')
    // Identity, not equality: there is one TUTORIAL_SCENE and both states hold
    // it. Two hand-maintained copies of the Chinese would drift, and the
    // payoff only lands if the text visibly did not change.
    expect(before.scene).toBe(TUTORIAL_SCENE)
    expect(after.scene).toBe(before.scene)
  })

  it('marks nothing before the cards, and the learned words after', () => {
    const views = walk(defaultWalkthrough()).map(view)
    expect(views.find(v => v.id === 'scene-before').marked).toBe(false)
    expect(views.find(v => v.id === 'scene-after').marked).toBe(true)
  })

  it('marks the two moments that are worth feeling', () => {
    const felt = walk(defaultWalkthrough()).map(view).filter(v => v.feedback)
    expect(felt.map(v => v.id)).toEqual(['recap', 'unlock'])
    expect(felt.every(v => v.feedback === 'success')).toBe(true)
  })

  it('is made of the words the tutorial teaches — nothing else', () => {
    const learned = TUTORIAL_CARDS.map(c => c.word)
    const marked = TUTORIAL_SCENE.lines.flatMap(l => l.known)
    // Every emphasised token is a word the tutorial actually taught…
    for (const word of marked) expect(learned).toContain(word)
    // …and the scene really does use them, not just claim to.
    for (const word of marked) {
      const line = TUTORIAL_SCENE.lines.find(l => l.known.includes(word))
      expect(line.text).toContain(word)
    }
    // ALL three: "this time you can read it" has to be literally true, so the
    // scene's Chinese, stripped of the taught words, must be pure punctuation.
    expect(new Set(marked).size).toBe(TUTORIAL_CARDS.length)
    let rest = TUTORIAL_SCENE.lines.map(l => l.text).join('')
    for (const word of learned) rest = rest.split(word).join('')
    expect(rest).toMatch(/^[！。？，、\s]*$/)
  })

  it('stays two lines — this is a moment, not a chapter', () => {
    expect(TUTORIAL_SCENE.lines).toHaveLength(2)
    expect(TUTORIAL_SCENE.setting.length).toBeGreaterThan(0)
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
    // The shape the persistence layer stores. Anything added here is something
    // a killed app has to restore correctly, so the list is deliberately short.
    expect(Object.keys(initialTutorialState()).sort()).toEqual(
      ['cardIndex', 'goalsSeen', 'grades', 'looked', 'phase', 'replayed', 'revealed']
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
      .toEqual(['cardIndex', 'phase', 'revealed'])
    expect(serializeTutorial(s).goalsSeen).toBe(undefined)
    // Which buttons were pressed is a record of a run, not a place in one.
    expect(serializeTutorial(s).grades).toBe(undefined)
  })

  it('comes back to exactly the state it left', () => {
    for (const s of walk(defaultWalkthrough())) {
      if (isComplete(s)) continue
      // The one deliberate exception: `looked` is never persisted, so the
      // reading lesson resumes with its gate re-armed — see its own spec.
      if (s.looked) continue
      const back = resumeTutorialState(JSON.parse(JSON.stringify(serializeTutorial(s))))
      expect(stateId(back)).toBe(stateId(s))
      expect(actionsFor(back)).toEqual(actionsFor(s))
      expect(back.goalsSeen).toEqual(s.goalsSeen)
    }
  })

  it('re-arms the reading lesson\'s gate on resume — the tap happens on THIS run', () => {
    const states = walk(defaultWalkthrough())
    const looked = states.find(x => stateId(x) === 'tap-word-looked')
    const back = resumeTutorialState(JSON.parse(JSON.stringify(serializeTutorial(looked))))
    expect(stateId(back)).toBe('tap-word')
    expect(back.looked).toBe(false)
    expect(actionsFor(back)).toEqual([ACTIONS.LOOKUP])
    expect(back.goalsSeen).not.toContain('tapUnknownWord')
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
    let s = advance(toFirstCard(), ACTIONS.REVEAL)
    s = advance(s, ACTIONS.REPLAY)
    expect(s.replayed).toBe(true)
    expect(serializeTutorial(s).replayed).toBe(undefined)
    expect(resumeTutorialState(serializeTutorial(s)).replayed).toBe(false)
  })

  it('starts over rather than trusting something it does not recognise', () => {
    for (const junk of [
      null, undefined, 'card-2', 42, [],
      { phase: 'nonsense', cardIndex: 0, revealed: false, grades: [] },
      { phase: 'card', cardIndex: 9, revealed: false, grades: [] },
      { phase: 'card', cardIndex: -1, revealed: false, grades: [] },
      { phase: 'card', cardIndex: 0, revealed: 'yes', grades: [] },
      // The pre-P12 shape's phases: a saved position from an older build in a
      // state this build no longer has restarts rather than resuming half-way
      // into a tutorial that no longer exists.
      { phase: 'story', cardIndex: 0, revealed: false, storyPanel: 0 },
      { phase: 'loop', cardIndex: 2, revealed: false, storyPanel: 1 },
    ]) {
      expect(resumeTutorialState(junk)).toBe(null)
    }
  })

  it('still resumes an old build\'s CARD position — the extra field is ignored', () => {
    const back = resumeTutorialState({ phase: 'card', cardIndex: 1, revealed: true, storyPanel: 0 })
    expect(stateId(back)).toBe('card-2-back')
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
    // Four, and every one of them is presentation vocabulary that reaches for
    // nothing: the canonical grade table, what a card's status marker is, what
    // to ask about a card in that state, and its own fixtures.
    expect(imports).toEqual(['./grades', './cardMarker', './gradePrompt', './tutorialFixtures'])
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
