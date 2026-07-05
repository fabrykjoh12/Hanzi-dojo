import { supabase } from './supabase'
import { cacheGet, cacheSet } from './offline'

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
//
// Offline resilience: every successful fetch is mirrored into IndexedDB, and if
// the fetch comes back empty because the network is down, the last good copy is
// served instead. This is transparent to callers (Study, Home, Test) and is a
// no-op when IndexedDB is unavailable.

export async function getTrackCards(userId, track, { level, columns = '*' } = {}) {
  const key = 'cards:' + userId + ':' + track.language + ':' + track.system + ':' + (level == null ? 'all' : level) + ':' + columns
  try {
    let query = supabase
      .from('cards')
      .select(columns + ', vocabulary!inner(id, level)')
      .eq('user_id', userId)
      .eq('vocabulary.language', track.language)
      .eq('vocabulary.system', track.system)
    if (level != null) query = query.eq('vocabulary.level', level)
    const { data, error } = await query
    if (error || !data) {
      const cached = await cacheGet(key)
      return cached || data || []
    }
    cacheSet(key, data)
    return data
  } catch {
    const cached = await cacheGet(key)
    return cached || []
  }
}
