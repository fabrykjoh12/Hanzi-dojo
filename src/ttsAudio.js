// Client access to generated audio.
//
// The browser NEVER synthesizes anything: it looks up a storage path that a
// server-side generation run already produced and plays the file. That is the
// whole point of the content-hash cache - pressing the speaker button a hundred
// times costs nothing.
//
// Nothing here can reach a provider credential. RLS on `tts_audio` also limits
// the browser to rows whose status is `ready`, so a failed or pending clip is
// simply absent rather than a broken player.

import { supabase } from './supabase'
import { getAudioUrl } from './utils'
import { cacheGet, cacheSet } from './offline'
import { VARIANTS } from './tts/constants.js'

export const DEFAULT_TTS_LOCALE = 'zh-CN'

// Session-scoped memo, so revisiting a card does not re-query. Keyed by
// sourceType|locale|sourceId|variant.
const memo = new Map()
const fetched = new Set()

function key(sourceType, locale, sourceId, variant) {
  return sourceType + '|' + locale + '|' + sourceId + '|' + variant
}

function cacheKey(sourceType, locale) {
  return 'tts:' + locale + ':' + sourceType
}

// PostgREST puts `in` filters in the URL, so a wide list builds a request the
// gateway rejects. Same chunking the server-side repository uses.
const ID_CHUNK = 100

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function remember(rows, sourceType, locale) {
  for (const row of rows || []) {
    if (!row.storage_path) continue
    memo.set(key(sourceType, locale, row.source_id, row.variant), {
      url: getAudioUrl(row.storage_path),
      variant: row.variant,
      durationMs: row.duration_ms || null,
    })
  }
}

// Load every ready clip for a set of entities. Safe to call repeatedly - ids
// already loaded this session are skipped, and a failure degrades to "no
// generated audio" rather than breaking the screen.
export async function loadTtsAudio(sourceType, sourceIds, { locale = DEFAULT_TTS_LOCALE, client = supabase } = {}) {
  const wanted = Array.from(new Set((sourceIds || []).filter(Boolean)))
  const missing = wanted.filter(id => !fetched.has(key(sourceType, locale, id, '*')))
  if (missing.length === 0) return

  const collected = []
  try {
    for (const part of chunk(missing, ID_CHUNK)) {
      const { data, error } = await client
        .from('tts_audio')
        .select('source_id, variant, storage_path, duration_ms')
        .eq('source_type', sourceType)
        .eq('locale', locale)
        .eq('status', 'ready')
        .in('source_id', part)
      if (error) throw error
      collected.push(...(data || []))
    }
    remember(collected, sourceType, locale)
    for (const id of missing) fetched.add(key(sourceType, locale, id, '*'))
    // Mirror for offline: a learner who studied online yesterday keeps their
    // audio paths today. Merged, never replaced, so one level's fetch does not
    // evict another's.
    const previous = (await cacheGet(cacheKey(sourceType, locale))) || []
    const merged = previous.filter(r => missing.indexOf(r.source_id) === -1).concat(collected)
    cacheSet(cacheKey(sourceType, locale), merged)
  } catch {
    // Offline or the table is not there yet (migration unapplied): fall back to
    // whatever was cached, and otherwise to the legacy audio path.
    const cached = await cacheGet(cacheKey(sourceType, locale))
    if (cached) remember(cached.filter(r => missing.indexOf(r.source_id) !== -1), sourceType, locale)
  }
}

// The URL for one clip, or null when it has not been generated.
export function ttsUrl(sourceType, sourceId, variant, { locale = DEFAULT_TTS_LOCALE } = {}) {
  if (!sourceId || !VARIANTS[variant]) return null
  const hit = memo.get(key(sourceType, locale, sourceId, variant))
  return hit ? hit.url : null
}

// Every URL a flashcard can play.
//
// `word` falls back to the vocabulary row's legacy `audio_path`, so a level that
// has not been regenerated on the new provider keeps working exactly as it does
// today. The slow and sentence variants have no legacy equivalent - they are
// simply absent until generated, and the UI hides their controls.
export function flashcardAudio(vocab, { locale = DEFAULT_TTS_LOCALE } = {}) {
  if (!vocab || !vocab.id) return { word: null, word_slow: null, sentence: null, sentence_slow: null }
  const legacy = getAudioUrl(vocab.audio_path)
  return {
    word: ttsUrl('vocabulary', vocab.id, 'word', { locale }) || legacy,
    word_slow: ttsUrl('vocabulary', vocab.id, 'word_slow', { locale }),
    sentence: ttsUrl('vocabulary', vocab.id, 'sentence', { locale }),
    sentence_slow: ttsUrl('vocabulary', vocab.id, 'sentence_slow', { locale }),
  }
}

// The narration for one story line, normal and slow.
export function utteranceAudio(utteranceId, { locale = DEFAULT_TTS_LOCALE } = {}) {
  return {
    utterance: ttsUrl('story_utterance', utteranceId, 'utterance', { locale }),
    utterance_slow: ttsUrl('story_utterance', utteranceId, 'utterance_slow', { locale }),
  }
}

// Test seam: clears the session memo.
export function resetTtsAudioCache() {
  memo.clear()
  fetched.clear()
}
