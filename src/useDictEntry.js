import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { isOnline } from './useOnline'
import { getDictEntryByWord } from './dictSearch'

// Reference-dictionary fallback for words outside the level's vocabulary.
// CC-CEDICT is Chinese-only, so callers gate the lookup on the track's language
// by passing `null` for every other language.
//
// The cache is module-scoped, so re-opening the same word (or the same word in
// another story this session) is instant and costs no round trip; `null` is
// cached too, so a genuine miss isn't retried on every tap. Bounded, since a
// reading session can touch a lot of words and this never gets a chance to be
// evicted otherwise.
const DICT_CACHE = new Map()
const DICT_CACHE_MAX = 400
function dictCacheSet(word, entry) {
  if (DICT_CACHE.size >= DICT_CACHE_MAX) DICT_CACHE.delete(DICT_CACHE.keys().next().value)
  DICT_CACHE.set(word, entry)
}

// useDictEntry(word) → { entry, loading }
//
// The cache IS the store: a resolved word renders straight out of it, and the
// fetch only bumps a tick to re-render. That keeps setState out of the effect
// body (no cascading renders) and means re-tapping a word already looked up
// this session paints instantly, with no loading flash. Offline (or a reader
// opened from the offline snapshot) never spins on a request that can't
// succeed — it reports not-loading with no entry, and the caller shows its
// fallback copy.
export function useDictEntry(word) {
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the cache-write signal, by design
  const entry = useMemo(() => (word ? DICT_CACHE.get(word) || null : null), [word, tick])
  const resolved = Boolean(word) && DICT_CACHE.has(word)
  const loading = Boolean(word) && !resolved && isOnline()

  useEffect(() => {
    if (!word || DICT_CACHE.has(word) || !isOnline()) return undefined
    let cancelled = false
    getDictEntryByWord(supabase, word)
      .then(e => { dictCacheSet(word, e || null) })
      .catch(() => { dictCacheSet(word, null) })
      .finally(() => { if (!cancelled) setTick(t => t + 1) })
    return () => { cancelled = true }
  }, [word])

  return { entry, loading }
}

// The definitions of a dictionary entry, capped for a lookup sheet.
export function dictDefinitions(entry, max = 3) {
  if (!entry || !Array.isArray(entry.definitions)) return []
  return entry.definitions.slice(0, max)
}
