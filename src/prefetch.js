import { supabase } from './supabase'
import { getAudioUrl } from './utils'
import { cacheSet } from './offline'

// Deliberately warm the offline caches for one level so a plane/subway session
// has everything: the vocabulary snapshot (so the Study queue can build) and
// every pronunciation MP3 (fetched un-ranged so the service worker's audio
// cache keeps a full, replayable copy).
//
// Note: on iOS/Safari the service worker bypasses ranged media, so audio still
// streams from the network there — offline audio prefetch is reliable on
// Chromium engines. Progress is reported as (done, total).
export async function prefetchLevel(track, level, onProgress) {
  let vocab = []
  try {
    const { data } = await supabase
      .from('vocabulary').select('*')
      .eq('language', track.language).eq('system', track.system)
      .eq('level', level).eq('is_active', true)
      .order('sort_order', { ascending: true })
    vocab = data || []
  } catch { /* offline / no network — keep the empty list */ }

  if (vocab.length) cacheSet('vocab:' + track.language + ':' + track.system + ':' + level, vocab)

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
      try { await fetch(urls[i], { cache: 'force-cache' }) } catch { /* skip */ }
      done += 1
      if (onProgress) onProgress(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, urls.length) }, worker))
  return { words: vocab.length, audio: total }
}
