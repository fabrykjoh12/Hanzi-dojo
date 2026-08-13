// Home as a guide through one day's training: Cards → Story → Practice.
//
// This is the decision half of P14-5B, on its own, away from any composition:
// which step the learner should do NOW, which are already behind them, which are
// still ahead, and what each one is allowed to say. Every concept in the design
// lab renders the same output of this function, so comparing them compares
// LAYOUT rather than layout plus three different guesses about the data.
//
// ── The one rule the whole screen hangs on ─────────────────────────────────
// Exactly one step is `active`. The others are `done`, `upcoming` or
// `unavailable`. There is no second active step and no "both are sort of next" —
// that ambiguity is what turns a guide back into a dashboard.
//
// ── Honesty rules ─────────────────────────────────────────────────────────
// Every fact below comes from state the app genuinely has (see
// docs/P14-5B-HOME-GUIDE-AUDIT.md for the full inventory). Where a fact is NOT
// reliably derivable today, this module returns null and the screen says less
// rather than inventing a number:
//
//   · No session-resume state exists — Study builds its queue fresh on every
//     entry — so nothing here may say "continue where you left off".
//   · No per-day record of PRACTICE exists. So Practice is never "done because
//     you did it"; it is done when nothing needs attention, which is a real
//     statement about the data (no weak words, no grammar due).
//   · A reward CHAPTER carries no % known (only the daily-story path computes
//     readability), so `knownPct` is null there and the screen omits it.
//
// ── What it is not ────────────────────────────────────────────────────────
// Not a task inventor. If a step has nothing real behind it, it collapses to a
// completed or unavailable line; the guide never manufactures work to fill the
// sequence, and it never blocks the learner from reaching a later step.

import { sessionEstimateMinutes } from './sessionEstimate'
import { availabilityBreakdown } from './studyAvailability'

export const GUIDE_STEPS = ['cards', 'story', 'practice']

// A step is one of these, and the sequence resolves to exactly one `active`.
export const STATUS = {
  active: 'active',       // do this now — the screen's one loud object
  done: 'done',           // finished, or genuinely nothing to do
  upcoming: 'upcoming',   // visible so the sequence reads, deliberately quiet
  unavailable: 'unavailable', // real state, honestly stated (nothing unlocked yet)
  unknown: 'unknown',     // counts failed or haven't loaded — say nothing numeric
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's')
}

// ── Cards ────────────────────────────────────────────────────────────────
// `pending` when anything is waiting. The queue total is the same arithmetic
// Home has always shown, and the estimate is sessionEstimate's — derived from
// the actual queue composition, never a fixed number.
function cardsStep(counts, studiedToday) {
  const loaded = Boolean(counts && counts.loaded)
  if (!loaded || counts.failed) {
    return {
      key: 'cards', number: 1, resolved: 'pending', status: STATUS.unknown,
      title: 'Cards', detail: null, facts: [], minutes: null, cta: 'Open cards',
      view: 'study',
    }
  }
  const newCount = counts.newCount || 0
  const learnCount = counts.learnCount || 0
  const dueCount = counts.dueCount || 0
  // `totalReady` is studyAvailability's number — the session the Cards tab will
  // actually serve. The sum is the fallback for a caller that predates it.
  const waiting = counts.totalReady != null
    ? counts.totalReady
    : newCount + learnCount + dueCount
  if (waiting === 0) {
    return {
      key: 'cards', number: 1, resolved: 'done', status: STATUS.done,
      title: 'Cards',
      // What the learner DID beats what is absent, when we know it. Today's
      // graded count comes from daily_activity; 0 is a real answer (a caught-up
      // queue nobody touched today), so it falls back to the state, not a zero.
      detail: studiedToday > 0 ? plural(studiedToday, 'card') + ' practiced' : "You're caught up",
      facts: [], minutes: null, cta: null, view: 'study',
    }
  }
  // ONE number, and it is the whole session — then what it is made of.
  //
  // It used to headline the reviews alone ("74 reviews are ready") while the
  // session served reviews AND new (136). Two true statements about different
  // things, on two screens, with no way for a learner to reconcile them. The
  // count is now `totalReady` and the breakdown sits under it, composed by the
  // same module that counted (availabilityBreakdown).
  const headline = plural(waiting, 'card') + ' ready'
  const facts = availabilityBreakdown({
    reviewsDue: dueCount, learningDue: learnCount, newAvailable: newCount,
  })
  // A capped welcome-back says so, because the rest are genuinely still there.
  const capped = Boolean(counts.cappedByReturn)
  return {
    key: 'cards', number: 1, resolved: 'pending', status: STATUS.active,
    title: 'Cards', detail: headline, facts, capped,
    // The same fact split into a number and its noun, for a composition that
    // wants to set the count in display type. Offered as data rather than left
    // to a screen to parse back out of `detail` — a regex over your own copy is
    // how a design becomes impossible to translate.
    metric: { value: waiting, label: waiting === 1 ? 'card ready' : 'cards ready' },
    minutes: sessionEstimateMinutes({ newCount, learnCount, dueCount }) || null,
    cta: 'Start cards', view: 'study',
  }
}

// ── Story ────────────────────────────────────────────────────────────────
// The story is the reward, so its step carries the artwork and the title rather
// than a count. `story` is whatever Home already fetches (a reward chapter or
// the daily story); null means nothing is available, which is a state to state
// plainly and never to dress up.
function storyStep(story, storyReadToday) {
  if (!story) {
    return {
      key: 'story', number: 2, resolved: 'skip', status: STATUS.unavailable,
      title: 'Story', detail: 'No chapter waiting yet', facts: [],
      minutes: null, cta: null, view: 'stories', story: null,
    }
  }
  const base = {
    key: 'story', number: 2, title: 'Story',
    facts: [story.levelLabel, story.knownPct != null ? story.knownPct + '% known' : null].filter(Boolean),
    minutes: null, view: 'stories', story,
  }
  if (storyReadToday) {
    return {
      ...base, resolved: 'done', status: STATUS.done,
      detail: story.title, facts: [], cta: null,
    }
  }
  if (story.locked) {
    // The chapter exists but today's session has not unlocked it. That is the
    // honest reason the step is not actionable, and it is also the argument for
    // doing Cards — so it names the mechanic rather than hiding it.
    return {
      ...base, resolved: 'skip', status: STATUS.unavailable,
      detail: story.title, cta: null, unlockHint: 'Finish cards to unlock',
    }
  }
  return {
    ...base, resolved: 'pending', status: STATUS.active,
    detail: story.title, cta: 'Continue story',
  }
}

// ── Practice ─────────────────────────────────────────────────────────────
// The recommendation is buildPracticePlan's `primary` — the existing, tested
// pick (weak words → grammar due → listening). Nothing here is an "AI
// suggestion"; it is two counts and a fallback.
function practiceStep(counts, practice) {
  const weak = (counts && counts.weakCount) || 0
  const grammar = (counts && counts.grammarDueCount) || 0
  if (weak === 0 && grammar === 0) {
    return {
      key: 'practice', number: 3, resolved: 'done', status: STATUS.done,
      title: 'Practice', detail: 'Nothing needs attention', facts: [],
      minutes: null, cta: null, view: 'practice',
    }
  }
  const p = practice || {}
  return {
    key: 'practice', number: 3, resolved: 'pending', status: STATUS.active,
    title: 'Practice',
    detail: p.title || 'Practice',
    // The count IS the explanation (practicePlan.js's own rule), so the fact
    // line is the number and what it means, not a second sentence.
    facts: [weak > 0
      ? plural(weak, 'word') + ' ' + (weak === 1 ? 'keeps' : 'keep') + ' slipping'
      : plural(grammar, 'pattern') + ' ' + (grammar === 1 ? 'is' : 'are') + ' due'],
    minutes: null, cta: p.cta || 'Open practice', view: p.key || 'practice',
    drillKey: p.key || null,
  }
}

// The whole guide. `studiedToday` and `storyReadToday` are optional — pass what
// is known; both degrade to a quieter, still-true line.
export function buildGuide({
  counts, story = null, practice = null, studiedToday = 0, storyReadToday = false,
} = {}) {
  const steps = [
    cardsStep(counts, studiedToday),
    storyStep(story, storyReadToday),
    practiceStep(counts, practice),
  ]

  // Exactly one active: the FIRST step with work in it. Everything after it is
  // upcoming; `done` and `unavailable` keep their own status wherever they sit,
  // so a caught-up queue does not pretend to be step one.
  let activeTaken = false
  for (const step of steps) {
    if (step.resolved !== 'pending') continue
    if (!activeTaken) { activeTaken = true; continue }
    step.status = STATUS.upcoming
    step.cta = null
  }

  const active = steps.find(s => s.status === STATUS.active || s.status === STATUS.unknown) || null
  const complete = !activeTaken

  return {
    steps,
    activeKey: active ? active.key : null,
    complete,
    // "Step 2 of 3" — the position of the ACTIVE step, not how many are left, so
    // the learner reads their place in a sequence rather than a burndown.
    position: active ? active.number : GUIDE_STEPS.length,
    minutes: active ? active.minutes : null,
    summary: complete ? completionSummary(steps, studiedToday, storyReadToday) : null,
  }
}

// The end-of-sequence line, and it has TWO cases, because they are two different
// days and the render lab made the difference obvious:
//
//   · Work happened → "Training complete", with what happened.
//   · Nothing was waiting and nothing was done → "Nothing waiting today".
//
// One headline for both is a lie in the second case: a learner who opened the app
// to a caught-up queue, no unlocked chapter and nothing slipping did not complete
// any training, and congratulating them for it is exactly the fake-achievement
// pattern CLAUDE.md §1 rules out. The state is still calm and still not a nag —
// it just says the true thing.
export function completionSummary(steps, studiedToday, storyReadToday) {
  const parts = []
  if (studiedToday > 0) parts.push(plural(studiedToday, 'word') + ' practiced')
  if (storyReadToday) parts.push('1 chapter read')
  if (parts.length > 0) return { parts, headline: 'Training complete', earned: true }
  return { parts: ["You're caught up"], headline: 'Nothing waiting today', earned: false }
}

// The top context line, e.g. "Step 1 of 3 · about 12 min". Kept here so every
// concept spells it the same way, and so "about" (not "~") is one decision.
export function guideContextLine(guide) {
  if (!guide) return ''
  if (guide.complete) return guide.summary ? guide.summary.headline : 'Training complete'
  const base = 'Step ' + guide.position + ' of ' + GUIDE_STEPS.length
  return guide.minutes ? base + ' · about ' + guide.minutes + ' min' : base
}
