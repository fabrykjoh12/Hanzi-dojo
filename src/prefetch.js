import { supabase } from './supabase'
import { getAudioUrl } from './utils'
import { cacheSet } from './offline'
import { vocabCacheKey } from './vocabCacheKey'
import { ensureAudio } from './audioCache'

// Deliberately warm the offline caches for one level so a plane/subway session
// has everything: the vocabulary snapshot (so the Study queue can build) and
// every pronunciation MP3 (fetched un-ranged so the service worker's audio
// cache keeps a full, replayable copy).
//
// Note: on iOS/Safari the service worker bypasses ranged media, so audio still
// streams from the network there — offline audio prefetch is reliable on
// Chromium engines. Progress is reported as (done, total).
// `floorLevel` defaults to `level`, i.e. that one level alone. The study queue
// is the CUMULATIVE deck [floor..current] (levelScope.js), so a caller that
// wants a session to be answerable offline has to pass the floor it will
// actually study from — writing one level under a range key would be the same
// near-miss this used to have, one layer down.
export async function prefetchLevel(track, level, onProgress, { floorLevel = level } = {}) {
  let vocab = []
  try {
    const { data } = await supabase
      .from('vocabulary').select('*')
      .eq('language', track.language).eq('system', track.system)
      .gte('level', floorLevel).lte('level', level).eq('is_active', true)
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true })
    vocab = data || []
  } catch { /* offline / no network — keep the empty list */ }

  // The SAME key the study queue reads (vocabCacheKey.js). These were two
  // hand-built strings that never matched, so the vocabulary half of "save for
  // offline" wrote a snapshot nothing has ever looked for.
  if (vocab.length) {
    cacheSet(vocabCacheKey({
      language: track.language, system: track.system,
      floorLevel, currentLevel: level,
    }), vocab)
  }

  const urls = vocab.filter(v => v.audio_path).map(v => getAudioUrl(v.audio_path))
  const total = urls.length
  let done = 0
  if (onProgress) onProgress(0, total)

  // Small concurrency so we don't fire hundreds of requests at once.
  const POOL = 6
  let cursor = 0
  async function worker() {
    while (cursor < urls.length) {
      const i = cursor
      cursor += 1
      // ensureAudio persists the full file to IndexedDB — the only form that
      // replays offline on iOS (the SW audio cache is bypassed for ranged
      // requests there).
      try { await ensureAudio(urls[i]) } catch { /* skip */ }
      done += 1
      if (onProgress) onProgress(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, urls.length) }, worker))
  return { words: vocab.length, audio: total }
}
