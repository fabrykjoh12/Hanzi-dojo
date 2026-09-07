import { supabase } from './supabase'
import { isPriorKnown } from './knowledgeState'

// When the user gets a word wrong in a low-stakes practice mode (Listening,
// Fill-in-the-blank, Tones, Sentence builder), nudge it back into the review
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
// reads. Setting it to now() therefore does not resurface the word for review;
// it yanks that one claim to the front of the calibration queue, ahead of the
// frequency order calibration picks by, and defeats the pacing the spread
// exists to create. One wrong Listening answer was enough.
//
// It is also the wrong signal. A claim has never been observed here, so there
// is nothing to "resurface" — the honest response to missing it in practice is
// to leave the claim exactly where the spread put it and let calibration ask
// properly, which is the only path that can ever turn a claim into evidence.

// The rule, as a PostgREST filter: NOT an unverified claim.
//
// The negation of isPriorKnown (a claim with no genuine observation), so:
// never claimed, OR observed at least once. Kept beside the predicate below and
// held to it by a spec, because a filter string and a JS predicate are exactly
// the kind of pair that drifts.
export const NOT_AN_UNVERIFIED_CLAIM = 'prior_known_at.is.null,reps.gte.1'

// The same rule in JS. `isPriorKnown` is the canonical predicate
// (knowledgeState.js); this exists so the filter above has something to be
// checked against.
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
