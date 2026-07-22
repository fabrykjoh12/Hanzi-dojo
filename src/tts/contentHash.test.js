import { describe, it, expect } from 'vitest'
import { buildHashInput, sha256Hex, contentHashFor, isStale } from './contentHash.js'
import { ttsStoragePath, ttsVariantPrefix } from './storagePath.js'

const base = {
  normalizedText: '银行',
  locale: 'zh-CN',
  provider: 'azure',
  voice: 'zh-CN-XiaoxiaoNeural',
  speakingRate: 1,
  overrideVersion: 'none',
  outputFormat: 'mp3-24khz-48kbit-mono',
  contentType: 'word',
}

describe('buildHashInput', () => {
  it('refuses to hash an incomplete request rather than producing a bogus key', () => {
    expect(() => buildHashInput({ ...base, voice: null })).toThrow(/voice/)
    expect(() => buildHashInput({ ...base, normalizedText: '' })).toThrow(/normalizedText/)
  })

  it('normalizes the rate so 0.8 and 0.80 are one cache entry', () => {
    expect(buildHashInput({ ...base, speakingRate: 0.8 }))
      .toBe(buildHashInput({ ...base, speakingRate: 0.80 }))
  })

  it('puts the text last so a truncated log still shows the settings', () => {
    expect(buildHashInput(base).split('\n').pop()).toBe('text=银行')
  })
})

describe('contentHashFor', () => {
  it('is deterministic', () => {
    expect(contentHashFor(base)).toBe(contentHashFor({ ...base }))
  })

  it('is a 64-character hex digest', () => {
    const h = contentHashFor(base)
    expect(h).toHaveLength(64)
    expect(h).toBe(h.toLowerCase())
  })

  // Every one of these is a real way audio can change. A missing input here is
  // the bug that serves a stale recording forever.
  const inputs = [
    ['text', { normalizedText: '银行卡' }],
    ['locale', { locale: 'zh-TW' }],
    ['provider', { provider: 'minimax' }],
    ['voice', { voice: 'zh-CN-YunxiNeural' }],
    ['speaking rate', { speakingRate: 0.8 }],
    ['pronunciation overrides', { overrideVersion: '银行=yínháng' }],
    ['output format', { outputFormat: 'mp3-16khz-32kbit-mono' }],
    ['content type', { contentType: 'sentence' }],
    ['synthesis config version', { synthesisConfigVersion: 99 }],
  ]
  for (const [label, patch] of inputs) {
    it('changes when the ' + label + ' changes', () => {
      expect(contentHashFor({ ...base, ...patch })).not.toBe(contentHashFor(base))
    })
  }
})

describe('sha256Hex', () => {
  it('matches the known digest of the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('isStale', () => {
  it('treats a missing record as stale', () => {
    expect(isStale(null, 'abc')).toBe(true)
  })

  it('treats a record with no hash as stale, so legacy audio is regenerable', () => {
    expect(isStale({ storage_path: 'chinese/hsk_3/level_1/001_ni3hao3.mp3' }, 'abc')).toBe(true)
  })

  it('is not stale when the hash still matches', () => {
    expect(isStale({ content_hash: 'abc' }, 'abc')).toBe(false)
  })

  it('is stale once any input changed the hash', () => {
    expect(isStale({ content_hash: 'abc' }, 'def')).toBe(true)
  })
})

describe('storage paths', () => {
  const parts = {
    locale: 'zh-CN', sourceType: 'vocabulary',
    sourceId: '11111111-2222-3333-4444-555555555555', variant: 'word_slow',
    contentHash: 'a'.repeat(64),
  }

  it('is content-addressed, so identical inputs resolve to one object', () => {
    expect(ttsStoragePath(parts)).toBe(
      'tts/zh-CN/vocabulary/11111111-2222-3333-4444-555555555555/word_slow/' + 'a'.repeat(64) + '.mp3'
    )
  })

  it('writes a different object when the content changes', () => {
    expect(ttsStoragePath({ ...parts, contentHash: 'b'.repeat(64) })).not.toBe(ttsStoragePath(parts))
  })

  it('exposes the prefix holding every generation of a variant', () => {
    expect(ttsVariantPrefix(parts)).toBe('tts/zh-CN/vocabulary/11111111-2222-3333-4444-555555555555/word_slow')
  })

  it('refuses a path segment that could escape the prefix', () => {
    expect(() => ttsStoragePath({ ...parts, sourceId: '../../secrets' })).toThrow(/unsafe character/)
    expect(() => ttsStoragePath({ ...parts, variant: 'word slow' })).toThrow(/unsafe character/)
  })

  it('refuses an empty segment', () => {
    expect(() => ttsStoragePath({ ...parts, sourceId: '' })).toThrow(/is empty/)
  })
})
