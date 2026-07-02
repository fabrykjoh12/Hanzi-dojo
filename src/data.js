import { supabase } from './supabase'

// Shared, server-side-scoped card queries.
//
// Historically every screen fetched the user's ENTIRE cards table
// (`.from('cards').eq('user_id', …)` with no other filter) and joined against
// vocabulary in JS. That's fine at 300 cards and painful at three languages ×
// several levels. This helper pushes the scoping into PostgREST via an inner
// join on vocabulary, so a screen only ever receives the cards for the track
// (and optionally level) it's rendering.
//
// Returned rows are normal card rows plus a nested `vocabulary: { id, level }`
// object from the join — harmless to spread, never written back.

export async function getTrackCards(userId, track, { level, columns = '*' } = {}) {
  let query = supabase
    .from('cards')
    .select(columns + ', vocabulary!inner(id, level)')
    .eq('user_id', userId)
    .eq('vocabulary.language', track.language)
    .eq('vocabulary.system', track.system)
  if (level != null) query = query.eq('vocabulary.level', level)
  const { data } = await query
  return data || []
}
