// Write a claim to the database.
//
// Seeding is a chunked upsert with ignoreDuplicates, which makes it idempotent
// by construction: `cards` carries unique (user_id, vocab_id), so re-importing
// the same list, double-tapping the button, or claiming the same word from two
// sources can never modify an existing card. Real progress is untouchable here.

import { supabase } from './supabase'
import { track, EVENTS } from './analytics'
import { spreadDueDates, seedCardRows } from './priorKnowledge'

// PostgREST would accept far more, but a few hundred rows per request keeps the
// payload small enough to retry cheaply on a flaky mobile connection.
export const SEED_BATCH_SIZE = 500

// seedClaim({ userId, vocabIds, perDay, source, now }) → { inserted, batches }
//
// `vocabIds` must already be in frequency order (see spreadDueDates). `source`
// is one of knowledgeState.PRIOR_SOURCES and is now PERSISTED on every row as
// `prior_source` — until this change it existed only inside an analytics event,
// so there was no way to ask which of a learner's cards were claimed.
export async function seedClaim({ userId, vocabIds, perDay, source, now = Date.now() }) {
  const spread = spreadDueDates(vocabIds, perDay, now)
  if (!spread.length) return { inserted: 0, batches: 0 }

  const rows = seedCardRows(userId, spread, now, source)
  let batches = 0
  for (let i = 0; i < rows.length; i += SEED_BATCH_SIZE) {
    const chunk = rows.slice(i, i + SEED_BATCH_SIZE)
    const { error } = await supabase
      .from('cards')
      .upsert(chunk, { onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    batches += 1
  }

  track(EVENTS.PRIOR_KNOWLEDGE_CLAIMED, { source, count: rows.length, perDay })
  return { inserted: rows.length, batches }
}
