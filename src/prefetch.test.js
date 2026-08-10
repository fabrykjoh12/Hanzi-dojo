import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vocabCacheKey } from './vocabCacheKey'

// The round trip that never closed: what the prefetcher WRITES has to be what
// the study queue READS. Both now go through vocabCacheKey, and this proves the
// two ends meet on a real call rather than by inspection.

const cache = new Map()
vi.mock('./offline', () => ({
  cacheSet: (key, value) => { cache.set(key, value) },
  cacheGet: async (key) => (cache.has(key) ? cache.get(key) : null),
}))

const audio = []
vi.mock('./audioCache', () => ({
  ensureAudio: async (url) => { audio.push(url) },
}))

const rows = [
  { id: 'v1', level: 1, word: '你好', audio_path: 'a/1.mp3' },
  { id: 'v2', level: 2, word: '朋友', audio_path: 'a/2.mp3' },
  { id: 'v3', level: 2, word: '学校', audio_path: null },
]
const filters = []
function builder() {
  const api = {}
  const record = (name) => (...args) => { filters.push([name, ...args]); return api }
  api.select = record('select')
  api.eq = record('eq')
  api.gte = record('gte')
  api.lte = record('lte')
  api.order = record('order')
  api.then = (resolve) => resolve({ data: rows })
  return api
}
vi.mock('./supabase', () => ({
  supabase: { from: () => builder() },
}))
vi.mock('./utils', () => ({ getAudioUrl: (p) => 'https://cdn/' + p }))

const { prefetchLevel } = await import('./prefetch')

beforeEach(() => {
  cache.clear()
  audio.length = 0
  filters.length = 0
})

const TRACK = { language: 'chinese', system: 'hsk', current_level: 2 }

describe('prefetchLevel', () => {
  it('writes vocabulary under the key the study queue reads', async () => {
    await prefetchLevel(TRACK, 2, null, { floorLevel: 1 })

    // Exactly the key Study.jsx builds for a learner whose cumulative deck runs
    // from level 1 to level 2.
    const studyKey = vocabCacheKey({
      language: TRACK.language, system: TRACK.system, floorLevel: 1, currentLevel: 2,
    })
    expect(cache.has(studyKey)).toBe(true)
    expect(cache.get(studyKey)).toEqual(rows)

    // And nothing is left under the old single-level key, which nothing reads.
    expect(cache.has('vocab:chinese:hsk:2')).toBe(false)
  })

  it('fetches the whole range the key promises, not one level of it', async () => {
    await prefetchLevel(TRACK, 2, null, { floorLevel: 1 })
    // A snapshot of one level stored under a range key would be the same
    // near-miss one layer down: the key would hit and the deck would be short.
    expect(filters).toContainEqual(['gte', 'level', 1])
    expect(filters).toContainEqual(['lte', 'level', 2])
    expect(filters.some(([name, col]) => name === 'eq' && col === 'level')).toBe(false)
  })

  it('defaults to the single level it was asked for', async () => {
    await prefetchLevel(TRACK, 2)
    expect(cache.has(vocabCacheKey({ language: 'chinese', system: 'hsk', floorLevel: 2, currentLevel: 2 }))).toBe(true)
  })

  it('still persists every pronunciation clip — the half that always worked', async () => {
    await prefetchLevel(TRACK, 2, null, { floorLevel: 1 })
    expect(audio).toEqual(['https://cdn/a/1.mp3', 'https://cdn/a/2.mp3'])
  })

  it('reports progress over the clips it actually has', async () => {
    const seen = []
    await prefetchLevel(TRACK, 2, (done, total) => seen.push([done, total]), { floorLevel: 1 })
    expect(seen[0]).toEqual([0, 2])
    expect(seen[seen.length - 1]).toEqual([2, 2])
  })

  it('keeps language and system in the key, so one track cannot answer for another', async () => {
    await prefetchLevel({ language: 'japanese', system: 'jlpt', current_level: 2 }, 2, null, { floorLevel: 1 })
    expect(cache.has('vocab:japanese:jlpt:1-2')).toBe(true)
    expect(cache.has('vocab:chinese:hsk:1-2')).toBe(false)
  })
})
