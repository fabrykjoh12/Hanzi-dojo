import { supabase } from './supabase'

// When the user gets a word wrong in a low-stakes practice mode (Listening,
// Fill-in-the-blank, Tones, Sentence builder), nudge it back into the review
// queue so the miss has a real memory consequence — exactly what Writing.jsx
// does on a wrong answer (clear is_easy + make it due now).
//
// This is intentionally light (not a full FSRS "Again"): practice is casual, so
// we resurface the word for a proper review rather than nuking its stability.
// If the user hasn't started this word yet (no card row), the update simply
// affects zero rows — nothing is created or penalised.
export function markWordDue(session, vocabId) {
  if (!session || !vocabId) return
  supabase.from('cards')
    .update({ is_easy: false, due_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .eq('vocab_id', vocabId)
    .then(() => {})
}
