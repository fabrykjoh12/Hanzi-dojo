// Write a claim to the database.
//
// Seeding is a chunked upsert with ignoreDuplicates, which makes it idempotent
// by construction: `cards` carries unique (user_id, vocab_id), so re-importing
// the same list, double-tapping the button, or claiming the same word from two
// sources can never modify an existing card. Real progress is untouchable here.
//
// THAT IDEMPOTENCY IS EXACTLY WHY THE COUNT HAS TO BE MEASURED. `inserted` used
// to be rows.length — how many rows were SENT, not how many landed — and
// KnownWords prints it as "Added N words to review". The screen filters out
// anything already carded before it builds the claim, so the two usually agree;
// they come apart whenever that filter is stale, which is every second device,
// every second tab, and any session left open while the deck moved on. The
// upsert now returns the rows it actually inserted and they are counted.

import { supabase } from './supabase'
import { track, EVENTS } from './analytics'
import { spreadDueDates, seedCardRows } from './priorKnowledge'

// PostgREST would accept far more, but a few hundred rows per request keeps the
// payload small enough to retry cheaply on a flaky mobile connection.
export const SEED_BATCH_SIZE = 500

// seedClaim({ userId, vocabIds, perDay, source, now }) → { inserted, skipped, batches }
//
// `vocabIds` must already be in frequency order (see spreadDueDates). `source`
// is one of knowledgeState.PRIOR_SOURCES and is now PERSISTED on every row as
// `prior_source` — until this change it existed only inside an analytics event,
// so there was no way to ask which of a learner's cards were claimed.
//
// `inserted` is what the database actually created; `skipped` is what it
// declined because a card already existed. Their sum is what was attempted.
export async function seedClaim({ userId, vocabIds, perDay, source, now = Date.now() }) {
  const spread = spreadDueDates(vocabIds, perDay, now)
  if (!spread.length) return { inserted: 0, skipped: 0, batches: 0 }

  const rows = seedCardRows(userId, spread, now, source)
  let batches = 0
  let inserted = 0
  for (let i = 0; i < rows.length; i += SEED_BATCH_SIZE) {
    const chunk = rows.slice(i, i + SEED_BATCH_SIZE)
    // .select() is what makes the count real: with ignoreDuplicates PostgREST
    // returns only the rows it inserted, so a word the learner already had
    // simply does not come back.
    const { data, error } = await supabase
      .from('cards')
      .upsert(chunk, { onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
      .select('vocab_id')
    if (error) {
      // The rows from earlier batches ARE written and are not reported: the
      // throw discards `inserted`, and KnownWords shows "Could not save. Please
      // try again." A retry is safe — the upsert ignores duplicates — but it
      // will honestly report those rows as already in the deck, which reads as
      // if nothing happened the first time. Carried on the error rather than
      // swallowed, so a caller that wants to say something better can, and
      // recorded in docs/BACKLOG.md.
      const err = new Error(error.message)
      err.insertedBeforeFailure = inserted
      throw err
    }
    inserted += (data || []).length
    batches += 1
  }

  // Analytics keeps reporting the attempt, which is the thing a funnel is about
  // — how many words the learner claimed — and now also what landed.
  track(EVENTS.PRIOR_KNOWLEDGE_CLAIMED, { source, count: rows.length, inserted, perDay })
  return { inserted, skipped: rows.length - inserted, batches }
}
