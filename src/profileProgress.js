// What Profile says about a learner's progress, derived in one place.
//
// This module exists because Profile was answering "how am I doing?" five
// separate ways and contradicting itself while it did: "Words mastered" appeared
// twice with two DIFFERENT numbers — the current level's and the lifetime total —
// under the same words (P10-B1 audit §B1.2). A screen cannot be trusted after
// that, and no amount of restyling fixes it.
//
// So the numbers are decided here, each one carries its own label, and the label
// names its scope. Pure: no React, no Supabase, no dates from the ambient clock
// unless you pass them in.

// A word counts as "learned" once it has left the new pile, and "mastered" once
// FSRS predicts a three-week recall (mastery.js). Both definitions live
// elsewhere; this module only ever receives the counts.

// ── the rhythm line ───────────────────────────────────────────────────────
// Replaces a 17×7 grid of 115 individually-tappable cells with one sentence.
//
// Descriptive, never coercive: it says how many days out of the window were
// studied, and it does NOT count consecutively. There is deliberately no streak
// here — no "12-day streak", no flame, no chain to protect. CLAUDE.md §1 removed
// that mechanic and a contribution grid was quietly reintroducing it.
export const RHYTHM_WINDOW_DAYS = 30

// `activity` is the map Profile already loads: { 'YYYY-MM-DD': studiedCards }.
// `today` is passed in so this is testable without mocking the clock.
export function studyRhythm(activity, today = new Date(), windowDays = RHYTHM_WINDOW_DAYS) {
  const map = activity && typeof activity === 'object' ? activity : {}
  const start = new Date(today)
  start.setDate(start.getDate() - (windowDays - 1))

  let days = 0
  for (let i = 0; i < windowDays; i += 1) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0')
    if ((map[key] || 0) > 0) days += 1
  }

  return {
    days,
    windowDays,
    // The sentence itself, so every caller says it the same way.
    label: days === 0
      ? 'No sessions in the last ' + windowDays + ' days'
      : 'Studied ' + days + ' of the last ' + windowDays + ' days',
  }
}

// ── the progress figures ──────────────────────────────────────────────────
//
// Everything the progress panel shows, with the label each number is allowed to
// wear. `levelLabel` comes from `getLevelLabel` (never hardcoded) so the scope
// reads "HSK 2 mastered" rather than the ambiguous "Words mastered".
//
// Inputs:
//   levelLearned    words in THIS level that have left the new pile
//   levelMastered   words in THIS level at FSRS stability >= 21 days
//   levelTotal      words in this level's list
//   levelLabel      'HSK 2'
//   testUnlockPct   the mastery share that opens the level test (0-1)
//   activity        the daily_activity map
//   today           injected for tests
export function profileProgress({
  levelLearned = 0,
  levelMastered = 0,
  levelTotal = 0,
  levelLabel = '',
  testUnlockPct = 0.9,
  activity = null,
  today = new Date(),
} = {}) {
  const total = Math.max(0, Number(levelTotal) || 0)
  const learned = clamp(levelLearned, total)
  const mastered = clamp(levelMastered, total)

  // Never Math.min(100, x) over a broken query (CLAUDE.md §4): the inputs are
  // clamped to the level's own size, and a zero-size level reports 0 rather
  // than dividing by it.
  const learnedPct = total > 0 ? Math.round((learned / total) * 100) : 0
  const masteredPct = total > 0 ? Math.round((mastered / total) * 100) : 0

  const unlockAt = total > 0 ? Math.ceil(total * testUnlockPct) : 0
  const testUnlocked = total > 0 && mastered >= unlockAt

  return {
    // The headline: how much of this level the learner can read.
    learned: { value: learned, of: total, pct: learnedPct, label: 'Words learned' },
    // The scoped one. This is the label that stops the contradiction: it names
    // the level, so it can never be confused with a lifetime total.
    mastered: {
      value: mastered,
      of: total,
      pct: masteredPct,
      label: levelLabel ? levelLabel + ' mastered' : 'Mastered',
    },
    test: {
      unlocked: testUnlocked,
      needed: Math.max(0, unlockAt - mastered),
      at: unlockAt,
      label: total === 0
        ? ''
        : testUnlocked
          ? 'Level test unlocked'
          : (unlockAt - mastered) + ' more to unlock the ' + (levelLabel || 'level') + ' test',
    },
    rhythm: studyRhythm(activity, today),
    // A screen reader gets the same facts in the same order, spelled out — the
    // progress must never be carried by the bar's fill alone.
    a11yLabel: total === 0
      ? 'No words in this level yet'
      : learned + ' of ' + total + ' words learned, '
        + mastered + ' mastered'
        + (levelLabel ? ' at ' + levelLabel : ''),
  }
}

function clamp(n, max) {
  const v = Math.max(0, Number(n) || 0)
  return max > 0 ? Math.min(v, max) : v
}
