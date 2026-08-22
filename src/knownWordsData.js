// Data loads for the Known Words screen — paged, so a full track (4,995 active
// Chinese words) and a big deck both come back complete past PostgREST's
// 1000-row cap.
//
// `supabase` is passed in so both loaders stay unit-testable (fakePostgrest.js).

import { fetchPaged } from './supabasePaging'

// Every leveled, active word of the track, in the order the deck introduces
// them (level, then frequency rank; `id` is the unique page tiebreak).
export async function loadAllVocab(supabase, track) {
  return fetchPaged(() => supabase
    .from('vocabulary')
    .select('id, word, reading, meaning, level, sort_order')
    .eq('language', track.language)
    .eq('system', track.system)
    .eq('is_active', true)
    .not('level', 'is', null)
    .order('level', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true }))
}

// The vocab ids the learner already has a card for (any language — the ids
// are only ever tested against this track's vocabulary, so cross-track ids
// are harmless). Unpaged, a deck past 1000 cards silently "forgot" its oldest
// claims and re-offered words the learner already studies.
export async function fetchCardedVocabIds(supabase) {
  const rows = await fetchPaged(() => supabase
    .from('cards')
    .select('vocab_id')
    .order('vocab_id', { ascending: true }))
  return new Set(rows.map(c => c.vocab_id))
}
