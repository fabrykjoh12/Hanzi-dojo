import { describe, it, expect, vi, beforeEach } from 'vitest'

// The client module is never exercised for real here: a fake Supabase client is
// injected, so these tests make no network call and touch no credential.
vi.mock('./supabase', () => ({ supabase: { from: () => { throw new Error('not used') } } }))

const cache = new Map()
vi.mock('./offline', () => ({
  cacheGet: (key) => Promise.resolve(cache.get(key)),
  cacheSet: (key, value) => { cache.set(key, value); return Promise.resolve() },
}))

const { loadTtsAudio, ttsUrl, flashcardAudio, utteranceAudio, resetTtsAudioCache } = await import('./ttsAudio.js')

const VOCAB_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_ID = '22222222-2222-2222-2222-222222222222'

// Minimal chainable stand-in for the PostgREST query builder.
function fakeClient(rows, { fail = false } = {}) {
  const filters = []
  const builder = {}
  for (const method of ['select', 'eq', 'in']) {
    builder[method] = (...args) => { filters.push([method, ...args]); return builder }
  }
  builder.then = (resolve) => resolve(fail ? { data: null, error: new Error('offline') } : { data: rows, error: null })
  return { filters, client: { from: (table) => { filters.push(['from', table]); return builder } } }
}

function row(sourceId, variant, path) {
  return { source_id: sourceId, variant, storage_path: path, duration_ms: 900 }
}

beforeEach(() => {
  resetTtsAudioCache()
  cache.clear()
})

describe('loadTtsAudio', () => {
  it('asks only for ready clips of the requested entities', async () => {
    const { client, filters } = fakeClient([])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client })

    expect(filters).toContainEqual(['from', 'tts_audio'])
    expect(filters).toContainEqual(['eq', 'source_type', 'vocabulary'])
    expect(filters).toContainEqual(['eq', 'locale', 'zh-CN'])
    expect(filters).toContainEqual(['eq', 'status', 'ready'])
    expect(filters).toContainEqual(['in', 'source_id', [VOCAB_ID]])
  })

  it('turns a storage path into a playable URL', async () => {
    const path = 'tts/zh-CN/vocabulary/' + VOCAB_ID + '/word/abc.mp3'
    const { client } = fakeClient([row(VOCAB_ID, 'word', path)])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client })

    const url = ttsUrl('vocabulary', VOCAB_ID, 'word')
    expect(url).toContain('/storage/v1/object/public/audio/' + path)
  })

  it('does not re-query ids it already loaded this session', async () => {
    const first = fakeClient([row(VOCAB_ID, 'word', 'tts/a.mp3')])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client: first.client })
    const second = fakeClient([])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client: second.client })
    expect(second.filters).toHaveLength(0)
  })

  it('queries only the ids it has not seen before', async () => {
    const first = fakeClient([row(VOCAB_ID, 'word', 'tts/a.mp3')])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client: first.client })
    const second = fakeClient([row(OTHER_ID, 'word', 'tts/b.mp3')])
    await loadTtsAudio('vocabulary', [VOCAB_ID, OTHER_ID], { client: second.client })
    expect(second.filters).toContainEqual(['in', 'source_id', [OTHER_ID]])
  })

  it('ignores a row with no storage path rather than producing a broken URL', async () => {
    const { client } = fakeClient([row(VOCAB_ID, 'word', null)])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client })
    expect(ttsUrl('vocabulary', VOCAB_ID, 'word')).toBe(null)
  })

  it('falls back to the offline mirror when the query fails', async () => {
    const good = fakeClient([row(VOCAB_ID, 'word', 'tts/cached.mp3')])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client: good.client })

    resetTtsAudioCache()
    const offline = fakeClient([], { fail: true })
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client: offline.client })
    expect(ttsUrl('vocabulary', VOCAB_ID, 'word')).toContain('tts/cached.mp3')
  })

  it('survives a failure with nothing cached', async () => {
    const offline = fakeClient([], { fail: true })
    await expect(loadTtsAudio('vocabulary', [VOCAB_ID], { client: offline.client })).resolves.toBeUndefined()
    expect(ttsUrl('vocabulary', VOCAB_ID, 'word')).toBe(null)
  })

  it('does nothing when asked for no ids', async () => {
    const { client, filters } = fakeClient([])
    await loadTtsAudio('vocabulary', [], { client })
    expect(filters).toHaveLength(0)
  })
})

describe('ttsUrl', () => {
  it('rejects an unknown variant instead of guessing a path', async () => {
    const { client } = fakeClient([row(VOCAB_ID, 'word', 'tts/a.mp3')])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client })
    expect(ttsUrl('vocabulary', VOCAB_ID, 'shouting')).toBe(null)
  })
})

describe('flashcardAudio', () => {
  const vocab = { id: VOCAB_ID, word: '银行', audio_path: 'chinese/hsk_3/level_1/001_yinhang.mp3' }

  it('falls back to the legacy clip so an un-migrated level still speaks', () => {
    const urls = flashcardAudio(vocab)
    expect(urls.word).toContain('chinese/hsk_3/level_1/001_yinhang.mp3')
  })

  it('offers no slow or sentence audio until it has been generated', () => {
    const urls = flashcardAudio(vocab)
    expect(urls.word_slow).toBe(null)
    expect(urls.sentence).toBe(null)
    expect(urls.sentence_slow).toBe(null)
  })

  it('prefers the generated clip over the legacy one', async () => {
    const { client } = fakeClient([
      row(VOCAB_ID, 'word', 'tts/zh-CN/vocabulary/' + VOCAB_ID + '/word/new.mp3'),
      row(VOCAB_ID, 'word_slow', 'tts/zh-CN/vocabulary/' + VOCAB_ID + '/word_slow/new.mp3'),
      row(VOCAB_ID, 'sentence', 'tts/zh-CN/vocabulary/' + VOCAB_ID + '/sentence/new.mp3'),
    ])
    await loadTtsAudio('vocabulary', [VOCAB_ID], { client })

    const urls = flashcardAudio(vocab)
    expect(urls.word).toContain('/word/new.mp3')
    expect(urls.word).not.toContain('001_yinhang')
    expect(urls.word_slow).toContain('/word_slow/new.mp3')
    expect(urls.sentence).toContain('/sentence/new.mp3')
    expect(urls.sentence_slow).toBe(null)
  })

  it('returns an empty set for a card with no vocabulary row', () => {
    expect(flashcardAudio(null)).toEqual({ word: null, word_slow: null, sentence: null, sentence_slow: null })
  })

  it('returns no legacy URL when the word has no audio_path either', () => {
    expect(flashcardAudio({ id: VOCAB_ID }).word).toBe(null)
  })
})

describe('utteranceAudio', () => {
  it('exposes the normal and slow narration for a line', async () => {
    const id = '33333333-3333-3333-3333-333333333333'
    const { client } = fakeClient([
      row(id, 'utterance', 'tts/zh-CN/story_utterance/' + id + '/utterance/a.mp3'),
      row(id, 'utterance_slow', 'tts/zh-CN/story_utterance/' + id + '/utterance_slow/a.mp3'),
    ])
    await loadTtsAudio('story_utterance', [id], { client })

    const urls = utteranceAudio(id)
    expect(urls.utterance).toContain('/utterance/a.mp3')
    expect(urls.utterance_slow).toContain('/utterance_slow/a.mp3')
  })

  it('reports nothing for a line that has not been narrated', () => {
    expect(utteranceAudio('44444444-4444-4444-4444-444444444444'))
      .toEqual({ utterance: null, utterance_slow: null })
  })
})
