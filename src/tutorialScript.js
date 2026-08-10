// The onboarding tutorial, as a state machine.
//
// Concept A, approved 2026-08-10: a learner does a three-card session on
// fixture words, watches it complete, watches a story open, reads two lines of
// Chinese made of the words they just learned, sees the loop named, and then is
// asked for an account. Ninety seconds, and every part of it is the real
// product's own components — see Flashcard.jsx and GradeRow.jsx.
//
// **Sandboxed, structurally.** This module imports one thing: its own fixtures.
// It cannot reach Supabase, FSRS, the study queue, a profile, a track, a story
// unlock or the router, because it does not import them and there is a test
// that proves it never will. A tutorial that could write a grade would be a
// tutorial that could quietly ruin a learner's first schedule.
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

import { TUTORIAL_CARDS, TUTORIAL_STORY, TUTORIAL_COPY, GRADE_GLOSSES } from './tutorialFixtures'

export const CARD_COUNT = TUTORIAL_CARDS.length
export const STORY_PANEL_COUNT = TUTORIAL_STORY.panels.length

// ── Phases ───────────────────────────────────────────────────────────────────
// The learner journey, named after what the learner is doing — never step1,
// step2. A card phase carries which card and whether it is revealed; the story
// phase carries which panel.
export const PHASES = {
  WELCOME: 'welcome',
  CARD: 'card',
  RECAP: 'recap',
  UNLOCK: 'unlock',
  STORY: 'story',
  LOOP: 'loop',
  ACCOUNT: 'account',
}

// ── Actions ──────────────────────────────────────────────────────────────────
// Four, and only four. `continue` is every linear advance (the welcome's Start,
// the recap, the unlock, a story panel, the loop's Create account); the other
// three belong to a card.
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
  'productLoop',       // learn → review → unlock → read
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
      { anchor: 'grades', text: TUTORIAL_COPY.coach.grading },
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
    storyPanel: 0,
    // Which grade was pressed for each card, in order. Tutorial-local — this is
    // never written anywhere and never becomes a review.
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
  if (state.phase === PHASES.STORY) return 'story-' + (state.storyPanel + 1)
  return state.phase
}

// How far along the tutorial is, as one number. Every legal action either
// leaves this alone (Replay, which is not progress) or increases it — which is
// what makes the tutorial provably unable to loop.
export function position(state) {
  switch (state.phase) {
    case PHASES.WELCOME: return 0
    case PHASES.CARD: return 1 + state.cardIndex * 2 + (state.revealed ? 1 : 0)
    case PHASES.RECAP: return 1 + CARD_COUNT * 2
    case PHASES.UNLOCK: return 2 + CARD_COUNT * 2
    case PHASES.STORY: return 3 + CARD_COUNT * 2 + state.storyPanel
    case PHASES.LOOP: return 3 + CARD_COUNT * 2 + STORY_PANEL_COUNT
    case PHASES.ACCOUNT: return 4 + CARD_COUNT * 2 + STORY_PANEL_COUNT
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
  if (state.phase === PHASES.RECAP) return ['sessionCompletion']
  if (state.phase === PHASES.UNLOCK) return ['storyUnlock']
  if (state.phase === PHASES.STORY) return ['wordsInContext']
  if (state.phase === PHASES.LOOP) return ['productLoop']
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
    panel: null,
    setting: null,
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
      glosses: state.revealed && first ? GRADE_GLOSSES : null,
      // The pronunciation pointer is spent once used: it says "this can be
      // tapped", and once it has been, it is noise.
      coach: (state.revealed ? coaching.back : coaching.front)
        .filter(c => !(c.anchor === 'audio' && state.replayed)),
    }
  }

  if (state.phase === PHASES.WELCOME) return { ...base, copy: TUTORIAL_COPY.welcome }
  if (state.phase === PHASES.RECAP) {
    return { ...base, copy: TUTORIAL_COPY.recap, feedback: 'success' }
  }
  if (state.phase === PHASES.UNLOCK) {
    return { ...base, copy: TUTORIAL_COPY.unlock, feedback: 'success' }
  }
  if (state.phase === PHASES.STORY) {
    return {
      ...base,
      copy: TUTORIAL_COPY.story,
      panel: TUTORIAL_STORY.panels[state.storyPanel],
      setting: state.storyPanel === 0 ? TUTORIAL_STORY.setting : null,
    }
  }
  if (state.phase === PHASES.LOOP) return { ...base, copy: TUTORIAL_COPY.loop }
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
    // Strict, deliberately: `Number(null)` is 0, so coercing here would turn a
    // caller's missing argument into a silent "Again". GradeRow hands over the
    // real number, and nothing else should be calling this.
    const grade = payload
    if (!Number.isInteger(grade) || grade < 0 || grade > 3) return state
    const grades = [...state.grades, grade]
    const next = state.cardIndex + 1
    if (next < CARD_COUNT) {
      return withGoals({ ...state, cardIndex: next, revealed: false, replayed: false, grades })
    }
    return withGoals({ ...state, phase: PHASES.RECAP, revealed: false, replayed: false, grades })
  }

  // CONTINUE — the linear tail.
  if (state.phase === PHASES.WELCOME) {
    return withGoals({ ...state, phase: PHASES.CARD, cardIndex: 0, revealed: false, replayed: false })
  }
  if (state.phase === PHASES.RECAP) return withGoals({ ...state, phase: PHASES.UNLOCK })
  if (state.phase === PHASES.UNLOCK) {
    return withGoals({ ...state, phase: PHASES.STORY, storyPanel: 0 })
  }
  if (state.phase === PHASES.STORY) {
    const next = state.storyPanel + 1
    if (next < STORY_PANEL_COUNT) return withGoals({ ...state, storyPanel: next })
    return withGoals({ ...state, phase: PHASES.LOOP })
  }
  if (state.phase === PHASES.LOOP) return withGoals({ ...state, phase: PHASES.ACCOUNT })
  return state
}

// The shortest honest walkthrough: never taps Replay, grades everything Good.
// Exported because both the tests and (later) the e2e spec want one canonical
// path, and two hand-written copies of it would drift.
export function defaultWalkthrough(grade = 2) {
  const steps = [{ action: ACTIONS.CONTINUE }]
  for (let i = 0; i < CARD_COUNT; i += 1) {
    steps.push({ action: ACTIONS.REVEAL })
    steps.push({ action: ACTIONS.GRADE, payload: grade })
  }
  // recap → unlock → each story panel → loop → account
  const tail = 2 + STORY_PANEL_COUNT + 1
  for (let i = 0; i < tail; i += 1) steps.push({ action: ACTIONS.CONTINUE })
  return steps
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
