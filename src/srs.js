const LEARNING_STEPS = [1, 10]
const HARD_LEARN_MIN = 5
const GRADUATING_INTERVAL = 1
const EASY_INTERVAL = 4
const REVIEW_AGAIN_MIN = 10
const MIN_EASE = 1.3

function minutesFromNow(min) { return new Date(Date.now() + min * 60000).toISOString() }
function daysFromNow(days) { return new Date(Date.now() + days * 86400000).toISOString() }
function fmtMin(min) { return `${min} min` }
function fmtDay(d) { return d === 1 ? '1 day' : `${d} days` }

function mkLearn(step, ease, overrideMin) {
  const min = overrideMin || LEARNING_STEPS[step] || 1
  return {
    state: 'learning', learning_step: step, ease_factor: ease,
    interval_days: 0, due_at: minutesFromNow(min), is_easy: false, learned: false,
  }
}

function mkReview(interval_days, ease, easy) {
  return {
    state: 'review', learning_step: 0, ease_factor: ease,
    interval_days, due_at: daysFromNow(interval_days), is_easy: easy, learned: true,
  }
}

function computeOutcome(card, grade) {
  const state = card.state || 'new'
  let ease = card.ease_factor || 2.5
  let interval_days = card.interval_days || 0
  const step = card.learning_step || 0

  if (state === 'new' || state === 'learning') {
    if (grade === 0) return { updates: mkLearn(0, ease), stay: true, gap: 2, label: fmtMin(LEARNING_STEPS[0]) }
    if (grade === 1) return { updates: mkLearn(step, ease, HARD_LEARN_MIN), stay: true, gap: 3, label: fmtMin(HARD_LEARN_MIN) }
    if (grade === 2) {
      const next = step + 1
      if (next >= LEARNING_STEPS.length) {
        return { updates: mkReview(GRADUATING_INTERVAL, ease, false), stay: false, label: fmtDay(GRADUATING_INTERVAL) }
      }
      return { updates: mkLearn(next, ease), stay: true, gap: 5, label: fmtMin(LEARNING_STEPS[next]) }
    }
    return { updates: mkReview(EASY_INTERVAL, ease, true), stay: false, label: fmtDay(EASY_INTERVAL) }
  }

  if (grade === 0) {
    const e = Math.max(MIN_EASE, ease - 0.2)
    return { updates: { ...mkLearn(0, e, REVIEW_AGAIN_MIN), is_easy: false }, stay: true, gap: 2, label: fmtMin(REVIEW_AGAIN_MIN) }
  }
  if (grade === 1) {
    const e = Math.max(MIN_EASE, ease - 0.15)
    const iv = Math.max(1, Math.round((interval_days || 1) * 1.2))
    return { updates: mkReview(iv, e, false), stay: false, label: fmtDay(iv) }
  }
  if (grade === 2) {
    const iv = Math.max(1, Math.round((interval_days || 1) * ease))
    return { updates: mkReview(iv, ease, false), stay: false, label: fmtDay(iv) }
  }
  const e = ease + 0.15
  const iv = Math.max(1, Math.round((interval_days || 1) * e * 1.3))
  return { updates: mkReview(iv, e, true), stay: false, label: fmtDay(iv) }
}

export function schedule(card, grade) {
  const o = computeOutcome(card, grade)
  return { updates: o.updates, stay: o.stay, gap: o.gap }
}

export function previewLabels(card) {
  return {
    0: computeOutcome(card, 0).label,
    1: computeOutcome(card, 1).label,
    2: computeOutcome(card, 2).label,
    3: computeOutcome(card, 3).label,
  }
}