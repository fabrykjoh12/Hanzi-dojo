// The vocabulary a placement claim covers: every active word BELOW the placed
// level, in the order the deck would have introduced it (level, then frequency
// rank). spreadDueDates preserves its input order, so this ordering is what
// makes the first check-ups the most frequent words.
//
// Paged: an HSK 6 placement claims 3,374 earlier words — far past PostgREST's
// 1000-row cap — and an unpaged read here silently seeded only the first 1000,
// leaving most of HSK 3-5 unclaimed with no error. The trailing `id` sort is
// the unique tiebreak that keeps pages from overlapping on (level, sort_order)
// ties.
//
// `supabase` is passed in so this stays unit-testable (fakePostgrest.js).

import { fetchPaged } from './supabasePaging'

export async function fetchEarlierVocabIds(supabase, { language, system, level }) {
  const rows = await fetchPaged(() => supabase
    .from('vocabulary')
    .select('id')
    .eq('language', language)
    .eq('system', system)
    .eq('is_active', true)
    .lt('level', level)
    .not('level', 'is', null)
    .order('level', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true }))
  return rows.map(v => v.id)
}
