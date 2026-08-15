// The study session's data-fetch phase, extracted from Study.jsx so it can be
// STARTED from Home before the learner taps "Start" — entering Cards should
// feel instant, not like a route change waiting on the network.
//
// Two parts:
//   fetchStudyData(userId, track)  — the actual fetch (cards, cumulative
//     vocabulary with its offline mirror, and the merge of vocabulary rows the
//     level window didn't return). Pure data; no React state.
//   prefetchStudyDeck / consumeStudyDeck — a tiny single-slot cache keyed by
//     user+track, holding the in-flight promise. Home warms it on mount; Study
//     consumes it in loadQueue. Consumed-once with a short TTL so a session
//     never grades against stale rows: anything older than the TTL (or already
//     used) is simply refetched, which is exactly what happened before.
import { supabase } from './supabase'
import { getTrackCards } from './data'
import { studyFloorLevel } from './levelScope'
import { missingVocabIds, mergeVocab } from './deckVocab'
import { cacheSet, cacheGet } from './offline'

export async function fetchStudyData(userId, track) {
  // Every card the learner owns on this track, not just the level window — a
  // saved dictionary/story word is due like any other (see Study.jsx history).
  const cards = await getTrackCards(userId, track, { includeUnleveled: true })
  const floorLevel = studyFloorLevel(cards, track.current_level)

  const vocabKey = 'vocab:' + track.language + ':' + track.system + ':' + floorLevel + '-' + track.current_level
  let vocab = null
  try {
    const res = await supabase
      .from('vocabulary')
      .select('*')
      .eq('language', track.language)
      .eq('system', track.system)
      .gte('level', floorLevel)
      .lte('level', track.current_level)
      .eq('is_active', true)
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true })
    vocab = res.data
  } catch { /* offline — fall back to the cached vocabulary below */ }
  // Mirror the cumulative vocabulary for offline; fall back to it when the
  // fetch came back empty because the network is down.
  if (vocab && vocab.length) cacheSet(vocabKey, vocab)
  else { const cached = await cacheGet(vocabKey); if (cached) vocab = cached }
  vocab = vocab || []

  let vocabById = {}
  vocab.forEach(v => { vocabById[v.id] = v })

  // A card whose vocabulary the level-scoped load didn't return (a dictionary
  // word with no level, a reach word above the window) gets its row fetched
  // by id and merged in, so the card isn't silently dropped from the session.
  const missingIds = missingVocabIds(cards, vocabById)
  if (missingIds.length) {
    try {
      const extra = await supabase
        .from('vocabulary').select('*').in('id', missingIds)
      if (extra.data && extra.data.length) {
        vocabById = mergeVocab(vocabById, extra.data)
        vocab = [...vocab, ...extra.data]
      }
    } catch { /* offline — those cards stay out of this session, as before */ }
  }

  return { cards: cards || [], vocab, vocabById }
}

// ── Prefetch slot ─────────────────────────────────────────────────────────
// One slot, not a map: only one study session can be entered at a time, and a
// single slot cannot leak. Timestamps come through an injectable clock so the
// TTL rule is testable without faking timers.

export const STUDY_PREFETCH_TTL_MS = 60_000

let slot = null

export function deckKey(userId, track) {
  if (!userId || !track) return null
  return userId + ':' + track.language + ':' + track.system + ':' + track.current_level
}

export function prefetchStudyDeck(userId, track, { now = Date.now(), fetcher = fetchStudyData } = {}) {
  const key = deckKey(userId, track)
  if (!key) return
  // An unexpired prefetch for the same deck is still good — don't refetch on
  // every Home re-render.
  if (slot && slot.key === key && now - slot.at < STUDY_PREFETCH_TTL_MS) return
  const promise = fetcher(userId, track)
  // A failed prefetch must never break the session start: clear the slot so
  // Study falls back to its own fresh fetch, and swallow the rejection here
  // (Study never sees this promise).
  promise.catch(() => { if (slot && slot.promise === promise) slot = null })
  slot = { key, at: now, promise }
}

export function consumeStudyDeck(userId, track, { now = Date.now() } = {}) {
  const key = deckKey(userId, track)
  if (!slot || slot.key !== key) return null
  const { at, promise } = slot
  slot = null
  if (now - at >= STUDY_PREFETCH_TTL_MS) return null
  return promise
}

// Test hook: reset module state between specs.
export function _clearStudyDeckSlot() { slot = null }
