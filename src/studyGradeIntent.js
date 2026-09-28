import { newOpId } from './syncQueue'
import { isPriorKnown } from './knowledgeState'
import { reinsertSoon } from './studyQueue'

// Construct once per user action; the caller holds this object for EVERY retry.
export function createStudyGradeIntent({ card, result, grade, userId, track, generation = 0, day, opId = newOpId() }) {
  const expected = card.id ? Object.fromEntries(Object.entries(card).filter(([key]) => !['vocab', 'vocabulary', 'isCalibration', 'review_pending'].includes(key))) : null
  return {
    opId, userId, vocabId: card.vocab_id, cardId: card.id || null,
    updates: result.updates, expected, day, generation,
    language: track.language, system: track.system, level: card.vocab?.level ?? null,
    state: card.state, priorKnown: isPriorKnown(card),
    log: { grade, previous_state: card.state, next_state: result.updates.state,
      previous_interval_days: card.interval_days || 0, next_interval_days: result.updates.interval_days },
  }
}

export function advanceStudyGrade(queue, card, result, saved, intent) {
  const rest = queue.slice(1)
  // A replay returns CURRENT server state. Another device may have graduated
  // the original Again card already, so reinsert only this exact acknowledged
  // transition. Pending offline writes wait for reconciliation before restudy.
  const current = saved.card
  const exact = current && current.id === saved.cardId && (!intent.cardId || current.id === intent.cardId) &&
    Number(current.revision) === Number(intent.expected?.revision || 0) + 1 &&
    current.state === intent.updates.state && current.reps === intent.updates.reps &&
    new Date(current.due_at).getTime() === new Date(intent.updates.due_at).getTime()
  return result.stay && !saved.pending && exact
    ? reinsertSoon(rest, { ...card, ...current }, result.gap)
    : rest
}
