import { supabase } from './supabase'
import { isPriorKnown, NOT_AN_UNVERIFIED_CLAIM } from './knowledgeState'

// When the user gets a word wrong in a low-stakes practice mode (Listening,
// Fill-in-the-blank, Tones, Sentence builder, Speaking), nudge it back into the review
// queue so the miss has a real memory consequence — exactly what Writing.jsx
// does on a wrong answer (clear is_easy + make it due now).
//
// This is intentionally light (not a full FSRS "Again"): practice is casual, so
// we resurface the word for a proper review rather than nuking its stability.
// If the user hasn't started this word yet (no card row), the update simply
// affects zero rows — nothing is created or penalised.
//
// EXCEPT ON AN UNVERIFIED PRIOR-KNOWLEDGE CLAIM, which this used to hit and
// must not. A claim is inert: it is never due and never offered as a new card,
// and its `due_at` does not mean "due" at all — priorKnowledge.spreadDueDates
// writes a calibration-ready DATE there, which only the calibration queue
// reads. Setting it to now() therefore does not resurface the word for review:
// it makes that claim calibration-ELIGIBLE immediately, months before the
// spread intended, which defeats the pacing the spread exists to create. One
// wrong Listening answer was enough.
//
// Be exact about the mechanism, because an earlier version of this comment was
// not: it does NOT jump the claim to the front of the queue. calibration.js
// picks by frequencyRank, not by due_at; due_at only feeds isCalibrationReady,
// i.e. eligibility. The harm is pacing, not ordering.
//
// It is also the wrong signal. A claim has never been observed here, so there
// is nothing to "resurface" — the honest response to missing it in practice is
// to leave the claim exactly where the spread put it and let calibration ask
// properly, which is the only path that can ever turn a claim into evidence.

// The rule in JS. `isPriorKnown` is the canonical predicate and
// NOT_AN_UNVERIFIED_CLAIM is its PostgREST twin — both live in
// knowledgeState.js, which is the single answer to "does the learner know this
// word?". This is the caller-facing spelling, and it exists so a caller that
// has the row in hand can decide BEFORE it tells the learner anything.
//
// A caller using it must SELECT knowledgeState.PRIOR_KNOWLEDGE_COLUMNS. That
// is not a style note: Writing.jsx's card query omitted both, so this returned
// true for every row including a claim, the guard was dead, and the button
// confirmed an add that the server-side filter had silently refused.
export function shouldNudge(card) {
  return Boolean(card) && !isPriorKnown(card)
}

export function markWordDue(session, vocabId) {
  if (!session || !vocabId) return
  supabase.from('cards')
    .update({ is_easy: false, due_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .eq('vocab_id', vocabId)
    .or(NOT_AN_UNVERIFIED_CLAIM)
    .then(() => {})
}
