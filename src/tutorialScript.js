// The onboarding tutorial, as a state machine.
//
// Concept A (2026-08-10) framed by Concept B (P12-1, 2026-08-12): the learner
// first sees two lines of Chinese they cannot read, does a three-card session
// on the real card, watches it complete, watches a story open, and then reads
// the exact same two lines — marked, translated, and now theirs. Then the
// account ask. About a hundred seconds, and every part of it is the real
// product's own components — see Flashcard.jsx and GradeRow.jsx.
//
// **Sandboxed, structurally.** This module imports two things: its own
// fixtures, and the canonical Again/Hard/Good/Easy table, which imports nothing
// itself. It cannot reach Supabase, FSRS, the study queue, a profile, a track,
// a story unlock or the router, because it does not import them and there is a
// test that proves it never will. A tutorial that could write a grade would be
// a tutorial that could quietly ruin a learner's first schedule.
//
// It records tutorial-local facts — which card, revealed or not, whether Replay
// was used, which grades were pressed — and none of that is scheduling data.
// The learner's real first session begins later, from zero, exactly as it would
// have without the tutorial.
//
// **Plain JSON, on purpose.** Every value in a state is a string, number,
// boolean or array of those, so Commit 5 can persist a position with
// JSON.stringify and nothing else. No functions, no dates, no class instances.
//
// What it does NOT decide: anything visual. No JSX, no CSS, no animation, no
// layout. `view()` says what is true; Tutorial.jsx says what that looks like.

import { isGradeKey } from './grades'
import { cardMarker } from './cardMarker'
import { gradePrompt } from './gradePrompt'
import { TUTORIAL_CARDS, TUTORIAL_SCENE, TUTORIAL_COPY, TUTORIAL_INTERVALS } from './tutorialFixtures'

export const CARD_COUNT = TUTORIAL_CARDS.length

// ── Phases ───────────────────────────────────────────────────────────────────
// The learner journey, named after what the learner is doing — never step1,
// step2. A card phase carries which card and whether it is revealed.
//
// The scene is the frame (P12-1, Concept B): the learner sees the tea-shop
// exchange they cannot yet read, learns the three words on the real card, and
// then sees the exact same exchange again, readable. The payoff is
// experienced, not described — which is why there is no closing "here is the
// loop" slide: by that point the learner has performed it.
//
// Twelve states in all: welcome, the scene unreadable, three cards front and
// back, recap, unlock, the same scene readable, and the account handoff.
export const PHASES = {
  WELCOME: 'welcome',
  SCENE_BEFORE: 'scene-before',
  CARD: 'card',
  RECAP: 'recap',
  UNLOCK: 'unlock',
  SCENE_AFTER: 'scene-after',
  ACCOUNT: 'account',
}

// ── Actions ──────────────────────────────────────────────────────────────────
// Four, and only four. `continue` is every linear advance (the welcome's Start,
// both scene renderings, the recap, the unlock); the other three belong to a
// card.
export const ACTIONS = {
  CONTINUE: 'continue',
  REVEAL: 'reveal',
  REPLAY: 'replay',
  GRADE: 'grade',
}

// ── Teaching goals ───────────────────────────────────────────────────────────
// What the tutorial exists to teach, named so a test can prove a walkthrough
// visits all of it. This list is the guard against a future tidy-up quietly
// deleting the grade explanation — which is the gap the audit found, and the
// single most important thing here.
export const TEACHING_GOALS = [
  'sceneUnreadable',   // where you're going — Chinese you can't read yet
  'reveal',            // a card turns over when you tap it
  'pronunciation',     // the word can be heard, on demand
  'grading',           // the four buttons are how you answer
  'againMeaning',
  'hardMeaning',
  'goodMeaning',
  'easyMeaning',
  'sessionCompletion', // a session ends, and ending it means something
  'storyUnlock',       // what finishing a session opens
  'wordsInContext',    // the words, alive, in Chinese
  'scenePayoff',       // the same scene, now readable — the whole thesis
]

const GRADE_GOALS = ['againMeaning', 'hardMeaning', 'goodMeaning', 'easyMeaning']

// ── Coaching ─────────────────────────────────────────────────────────────────
// Progressive disclosure, spelled out rather than implied.
//
// Card 1 is taught: what a card does, that it can be heard, what the grades
// mean. Card 2 keeps one line — and only one that could not have been said
// earlier, because it is about the grade they have now actually pressed. Card 3
// is the product: a card, four buttons, nothing else.
//
// `anchor` is what the line points at, not where it sits on screen.
const COACHING = {
  0: {
    front: [{ anchor: 'card', text: TUTORIAL_COPY.coach.reveal }],
    back: [
      { anchor: 'audio', text: TUTORIAL_COPY.coach.pronunciation },
      // The question itself is the card's, not the tutorial's — see
      // gradePrompt.js. All three fixture cards are new, so this asks how
      // familiar the word was rather than how well it was remembered.
      { anchor: 'grades', text: gradePrompt('new').prompt },
    ],
  },
  1: {
    front: [{ anchor: 'card', text: TUTORIAL_COPY.coach.scheduled }],
    back: [],
  },
  2: { front: [], back: [] },
}

// ── State ────────────────────────────────────────────────────────────────────

export function initialTutorialState() {
  return {
    phase: PHASES.WELCOME,
    cardIndex: 0,
    revealed: false,
    // Whether the learner has used Replay on the card in front of them. Resets
    // per card: it drives one piece of coaching, not a score.
    replayed: false,
    // Which grade was pressed for each card, in order, BY KEY ('again' …
    // 'easy' — grades.js). Tutorial-local: never written anywhere, never a
    // review. Keys rather than the scheduler's numbers so that reordering the
    // grade row can never turn a stored "Good" into a "Hard".
    grades: [],
    goalsSeen: [],
  }
}

// A stable name for the state the learner is in. Used by tests, by the runner's
// transition keys, and by whatever persists a position later.
export function stateId(state) {
  if (state.phase === PHASES.CARD) {
    return 'card-' + (state.cardIndex + 1) + (state.revealed ? '-back' : '-front')
  }
  return state.phase
}

// How far along the tutorial is, as one number. Every legal action either
// leaves this alone (Replay, which is not progress) or increases it — which is
// what makes the tutorial provably unable to loop.
export function position(state) {
  switch (state.phase) {
    case PHASES.WELCOME: return 0
    case PHASES.SCENE_BEFORE: return 1
    case PHASES.CARD: return 2 + state.cardIndex * 2 + (state.revealed ? 1 : 0)
    case PHASES.RECAP: return 2 + CARD_COUNT * 2
    case PHASES.UNLOCK: return 3 + CARD_COUNT * 2
    case PHASES.SCENE_AFTER: return 4 + CARD_COUNT * 2
    case PHASES.ACCOUNT: return 5 + CARD_COUNT * 2
    default: return -1
  }
}

export function isComplete(state) {
  return state.phase === PHASES.ACCOUNT
}

// What the learner is allowed to do right now. Anything not in here is refused
// by `advance` — grading a card that has not been revealed is not a thing that
// can happen, rather than a thing that is discouraged.
export function actionsFor(state) {
  if (state.phase === PHASES.CARD) {
    if (!state.revealed) return [ACTIONS.REVEAL]
    // Replay is offered on every card, coached on the first. It is not a step.
    return [ACTIONS.REPLAY, ACTIONS.GRADE]
  }
  if (state.phase === PHASES.ACCOUNT) return []
  return [ACTIONS.CONTINUE]
}

// ── What this state teaches ──────────────────────────────────────────────────
// Declared per state so the goals a walkthrough covers are derived from the
// walkthrough, not asserted by hand in a test.
//
// `pronunciation` is taught by OFFERING the control, not by hearing it: audio
// must never gate progress, so a learner who never taps Replay — or whose phone
// is silent — has still been shown that a word can be heard.
function teachesAt(state) {
  if (state.phase === PHASES.CARD) {
    if (!state.revealed) return state.cardIndex === 0 ? ['reveal'] : []
    if (state.cardIndex === 0) return ['pronunciation', 'grading', ...GRADE_GOALS]
    return []
  }
  if (state.phase === PHASES.SCENE_BEFORE) return ['sceneUnreadable']
  if (state.phase === PHASES.RECAP) return ['sessionCompletion']
  if (state.phase === PHASES.UNLOCK) return ['storyUnlock']
  if (state.phase === PHASES.SCENE_AFTER) return ['wordsInContext', 'scenePayoff']
  return []
}

function withGoals(state) {
  const seen = state.goalsSeen
  const fresh = teachesAt(state).filter(g => seen.indexOf(g) === -1)
  return fresh.length === 0 ? state : { ...state, goalsSeen: [...seen, ...fresh] }
}

// ── View ─────────────────────────────────────────────────────────────────────
// Everything the runner needs, and nothing about how to draw it.
//
// `feedback` marks the two moments worth a haptic: a session completing and a
// story opening. Ordinary taps are the runner's business, exactly as they are
// in the real Study screen — this is about which moments MEAN something.
export function view(state) {
  const base = {
    id: stateId(state),
    phase: state.phase,
    actions: actionsFor(state),
    complete: isComplete(state),
    coach: [],
    feedback: null,
    card: null,
    cardIndex: null,
    cardNumber: null,
    cardTotal: CARD_COUNT,
    revealed: false,
    replayed: false,
    showGrades: false,
    // The one-word meanings, on the first revealed card only. Repeating them on
    // card 2 would be the app explaining a control the learner has used.
    glosses: null,
    // The schedule preview, on the LATER revealed cards only — what a grade
    // does, once what it means has been taught. Same slot the real row uses.
    intervals: null,
    // The scene, when this state shows it, and whether the learned words are
    // marked and translated — false before the cards, true after.
    scene: null,
    marked: false,
    copy: null,
  }

  if (state.phase === PHASES.CARD) {
    const first = state.cardIndex === 0
    const coaching = COACHING[state.cardIndex] || { front: [], back: [] }
    return {
      ...base,
      card: TUTORIAL_CARDS[state.cardIndex],
      cardIndex: state.cardIndex,
      cardNumber: state.cardIndex + 1,
      revealed: state.revealed,
      replayed: state.replayed,
      showGrades: state.revealed,
      glosses: state.revealed && first ? gradePrompt(cardMarker(TUTORIAL_CARDS[state.cardIndex]).key).glosses : null,
      intervals: state.revealed && !first ? TUTORIAL_INTERVALS : null,
      // The pronunciation pointer is spent once used: it says "this can be
      // tapped", and once it has been, it is noise.
      coach: (state.revealed ? coaching.back : coaching.front)
        .filter(c => !(c.anchor === 'audio' && state.replayed)),
    }
  }

  if (state.phase === PHASES.WELCOME) return { ...base, copy: TUTORIAL_COPY.welcome }
  if (state.phase === PHASES.SCENE_BEFORE) {
    return { ...base, copy: TUTORIAL_COPY.sceneBefore, scene: TUTORIAL_SCENE, marked: false }
  }
  if (state.phase === PHASES.RECAP) {
    return { ...base, copy: TUTORIAL_COPY.recap, feedback: 'success' }
  }
  if (state.phase === PHASES.UNLOCK) {
    return { ...base, copy: TUTORIAL_COPY.unlock, feedback: 'success' }
  }
  if (state.phase === PHASES.SCENE_AFTER) {
    return { ...base, copy: TUTORIAL_COPY.sceneAfter, scene: TUTORIAL_SCENE, marked: true }
  }
  return base
}

// ── Transitions ──────────────────────────────────────────────────────────────

// Illegal actions return the SAME state object — not a copy, not a throw. The
// runner can compare by identity to know nothing happened, and no half-applied
// state can exist.
export function advance(state, action, payload) {
  if (actionsFor(state).indexOf(action) === -1) return state

  if (action === ACTIONS.REVEAL) {
    return withGoals({ ...state, revealed: true })
  }

  if (action === ACTIONS.REPLAY) {
    // Not progress. It records that the learner heard the word, which retires
    // one line of coaching, and changes nothing else — hearing a word is not
    // revealing it and is certainly not grading it.
    return state.replayed ? state : { ...state, replayed: true }
  }

  if (action === ACTIONS.GRADE) {
    // Any of the four. The tutorial teaches what they mean; it does not have an
    // opinion about which one is true for this learner.
    //
    // A key, strictly — not the scheduler's 0-3. Numbers are positional, and a
    // future reorder of the grade row would silently rewrite what a recorded
    // grade meant. Strict also because a missing argument must be refused
    // rather than coerced into a quiet "Again".
    if (!isGradeKey(payload)) return state
    const grades = [...state.grades, payload]
    const next = state.cardIndex + 1
    if (next < CARD_COUNT) {
      return withGoals({ ...state, cardIndex: next, revealed: false, replayed: false, grades })
    }
    return withGoals({ ...state, phase: PHASES.RECAP, revealed: false, replayed: false, grades })
  }

  // CONTINUE — the linear tail.
  if (state.phase === PHASES.WELCOME) {
    return withGoals({ ...state, phase: PHASES.SCENE_BEFORE })
  }
  if (state.phase === PHASES.SCENE_BEFORE) {
    return withGoals({ ...state, phase: PHASES.CARD, cardIndex: 0, revealed: false, replayed: false })
  }
  if (state.phase === PHASES.RECAP) return withGoals({ ...state, phase: PHASES.UNLOCK })
  if (state.phase === PHASES.UNLOCK) return withGoals({ ...state, phase: PHASES.SCENE_AFTER })
  if (state.phase === PHASES.SCENE_AFTER) return withGoals({ ...state, phase: PHASES.ACCOUNT })
  return state
}

// ── Back ─────────────────────────────────────────────────────────────────────
// One step backwards — the hardware Back button's walk (P12 audit §3.3).
//
// Deliberately NOT an ACTION and not offered by actionsFor(): the four actions
// are the learner's forward vocabulary, and the invariant that every legal
// action increases position() is what makes the tutorial provably unable to
// loop. Back belongs to the platform, not the script, and it is the one thing
// allowed to decrease position — by exactly one state.
//
// Returns null at the very first state, which tells the caller the tutorial
// has nothing left to step out of (Landing then returns to the welcome screen,
// and only THAT screen exits the app).
//
// Two details worth their lines:
//   grades     stepping back across a grade un-records it, so grading again
//              can never double-count a card.
//   goalsSeen  is kept. Teaching that happened, happened — retreating past the
//              grade explanation does not entitle anyone to a second showing.
export function retreat(state) {
  if (state.phase === PHASES.WELCOME) return null
  if (state.phase === PHASES.SCENE_BEFORE) return { ...state, phase: PHASES.WELCOME }
  if (state.phase === PHASES.CARD) {
    if (state.revealed) return { ...state, revealed: false, replayed: false }
    if (state.cardIndex === 0) return { ...state, phase: PHASES.SCENE_BEFORE, replayed: false }
    return {
      ...state,
      cardIndex: state.cardIndex - 1, revealed: true, replayed: false,
      grades: state.grades.slice(0, -1),
    }
  }
  if (state.phase === PHASES.RECAP) {
    return {
      ...state,
      phase: PHASES.CARD, cardIndex: CARD_COUNT - 1, revealed: true, replayed: false,
      grades: state.grades.slice(0, -1),
    }
  }
  if (state.phase === PHASES.UNLOCK) return { ...state, phase: PHASES.RECAP }
  if (state.phase === PHASES.SCENE_AFTER) return { ...state, phase: PHASES.UNLOCK }
  // ACCOUNT: complete. The runner has already handed over; there is nothing
  // here to step back into.
  return null
}

// The shortest honest walkthrough: never taps Replay, grades everything Good.
// Exported because both the tests and (later) the e2e spec want one canonical
// path, and two hand-written copies of it would drift.
export function defaultWalkthrough(grade = 'good') {
  // welcome → the scene, unreadable
  const steps = [{ action: ACTIONS.CONTINUE }, { action: ACTIONS.CONTINUE }]
  for (let i = 0; i < CARD_COUNT; i += 1) {
    steps.push({ action: ACTIONS.REVEAL })
    steps.push({ action: ACTIONS.GRADE, payload: grade })
  }
  // recap → unlock → the scene, readable → account
  for (let i = 0; i < 3; i += 1) steps.push({ action: ACTIONS.CONTINUE })
  return steps
}

// ── Resuming ─────────────────────────────────────────────────────────────────
// The tutorial runs signed out, so a learner who closes the app mid-way has no
// account to remember them by. What gets written to the device is a POSITION,
// and it is deliberately the smallest thing that can be one.
//
// Three values, and every one of them is the position. Nothing else is stored:
//
//   goalsSeen  the set of goals every state up to here declared — a function of
//              the position. Storing it would keep an answer we can always
//              recompute, and would let a hand-edited value claim a lesson that
//              never happened.
//   grades     which of the four buttons the learner pressed. Nothing on screen
//              depends on them, so they are a record of a run rather than a
//              place in one; a resumed tutorial simply does not know, and says
//              so by starting the list empty.
//   replayed   whether Replay was tapped on the card in front of you. It
//              retires one line of coaching and is worth nothing once the app
//              has been closed.

// Every goal taught at or before this position, in the order they are met.
export function goalsThrough(state) {
  const here = position(state)
  const seen = []
  for (const s of runTutorial(defaultWalkthrough())) {
    if (position(s) > here) break
    for (const goal of teachesAt(s)) if (seen.indexOf(goal) === -1) seen.push(goal)
  }
  return seen
}

export function serializeTutorial(state) {
  return {
    phase: state.phase,
    cardIndex: state.cardIndex,
    revealed: state.revealed,
  }
}

// Rebuild a full state from a saved position, or return null for anything that
// is not one. Anything unrecognised — a hand-edited value, a shape from an
// older build — resumes from the start rather than half-way into a tutorial
// that never happened.
export function resumeTutorialState(saved) {
  if (!saved || typeof saved !== 'object') return null
  const phases = Object.values(PHASES)
  // A phase this build does not have — including 'story' and 'loop' from the
  // pre-P12 shape — restarts from the beginning rather than resuming half-way
  // into a tutorial that no longer exists. Extra stored fields (the old
  // storyPanel) are simply ignored.
  if (phases.indexOf(saved.phase) === -1) return null
  const cardIndex = saved.cardIndex
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= CARD_COUNT) return null
  if (typeof saved.revealed !== 'boolean') return null

  const state = {
    phase: saved.phase,
    cardIndex,
    revealed: saved.revealed,
    replayed: false,
    grades: [],
    goalsSeen: [],
  }
  return { ...state, goalsSeen: goalsThrough(state) }
}

// Run a list of {action, payload} from a starting state. Returns every state
// passed through, first to last, so a test can assert about the whole journey
// rather than only where it ended up.
export function runTutorial(steps, from = initialTutorialState()) {
  const states = [from]
  let current = from
  for (const step of steps) {
    current = advance(current, step.action, step.payload)
    states.push(current)
  }
  return states
}
