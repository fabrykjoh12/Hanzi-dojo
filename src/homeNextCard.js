// The word on the Home hero's paper card — the top of today's deck.
//
// Kept separate from homeCounts.js for the same reason homeStory.js is: the
// counts are the synchronous math Home renders immediately; this is one small
// async lookup that fills the hero's card face in when it arrives. It reuses
// the exact card fetch homeCounts makes (same columns → same cache entry), so
// the only genuinely new network cost is a single-row vocabulary lookup.
//
// Best-effort in every direction: any failure returns null and the hero simply
// shows its quiet ink mark instead of a word. Home must never block on this.

import { supabase } from './supabase'
import { getTrackCards } from './data'
import { pickDeckPreview } from './homeModel'
import { isReturningFromBreak } from './gentleReturn'
import { queueSeed } from './studyQueue'
import { studyFloorLevel } from './levelScope'
import { todayStr } from './streak'

// Must stay identical to the columns getHomeCounts fetches, so the two calls
// share one cache entry and one network request.
const COUNTS_COLUMNS = 'vocab_id, state, due_at, created_at, is_easy, learned, stability, lapses'

export async function getDeckPreview({ userId, profile, track }) {
  if (!userId || !track) return null
  try {
    const cards = await getTrackCards(userId, track, { columns: COUNTS_COLUMNS })
    const seed = queueSeed({
      userId,
      language: track.language,
      system: track.system,
      level: track.current_level,
      day: todayStr(),
    })
    const vocabId = pickDeckPreview({
      cards,
      now: new Date(),
      seed,
      returning: isReturningFromBreak(profile || {}),
    })

    if (vocabId) {
      const { data } = await supabase
        .from('vocabulary').select('id, word').eq('id', vocabId).single()
      return data && data.word ? { word: data.word, kind: 'review' } : null
    }

    // Nothing due — a new-cards-only day. The session will open on the first
    // unstarted word in curriculum order, so show that. The limit only needs
    // to clear the largest run of already-started words at the front of the
    // level; 60 is generous.
    const floor = studyFloorLevel(cards, track.current_level)
    const started = new Set((cards || []).map(c => c.vocab_id))
    const { data: vocab } = await supabase
      .from('vocabulary').select('id, word')
      .eq('language', track.language).eq('system', track.system)
      .gte('level', floor).lte('level', track.current_level)
      .eq('is_active', true)
      .order('level', { ascending: true }).order('sort_order', { ascending: true })
      .limit(60)
    const first = (vocab || []).find(v => !started.has(v.id))
    return first && first.word ? { word: first.word, kind: 'new' } : null
  } catch {
    return null
  }
}
