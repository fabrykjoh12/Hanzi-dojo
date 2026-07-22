// A provider that costs nothing.
//
// Every automated test and every dry run goes through this, so the full
// pipeline - hashing, storage paths, job transitions, retries, the CLI - is
// exercised without a single paid request. The bytes it returns are derived
// deterministically from the SSML, so identical input produces identical
// output and a cache-hit test is meaningful.

import { TtsProviderError, TtsCancelledError, TTS_ERROR_CODES } from '../errors.js'
import { OUTPUT_FORMAT_CONTENT_TYPE } from '../constants.js'

// Small deterministic byte generator (FNV-1a seeded). Not audio - nothing plays
// it - but stable, non-empty, and different for different text.
function fakeAudioBytes(seedText, length = 64) {
  let h = 0x811c9dc5
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const out = new Uint8Array(length)
  // A real MP3 frame header, so anything sniffing the format sees audio/mpeg.
  out[0] = 0xff
  out[1] = 0xfb
  for (let i = 2; i < length; i += 1) {
    h ^= h << 13; h >>>= 0
    h ^= h >>> 17
    h ^= h << 5; h >>>= 0
    out[i] = h & 0xff
  }
  return out
}

export class MockTTSProvider {
  // `failFor(request, callIndex)` returns an Error to throw, or null. That is
  // how the tests drive retry, rate-limit and permanent-failure paths.
  constructor({ failFor = null, latencyMs = 0, sleep = null } = {}) {
    this.name = 'mock'
    this.apiVersion = 'mock/1'
    this.calls = []
    this.failFor = failFor
    this.latencyMs = latencyMs
    this.sleep = sleep || ((ms) => new Promise(r => setTimeout(r, ms)))
  }

  get requestCount() { return this.calls.length }
  get characterCount() { return this.calls.reduce((n, c) => n + (c.characterCount || 0), 0) }

  async synthesize(request, { signal = null } = {}) {
    if (signal && signal.aborted) throw new TtsCancelledError()
    const callIndex = this.calls.length
    this.calls.push({
      ssml: request.ssml,
      voice: request.voice,
      locale: request.locale,
      speakingRate: request.speakingRate,
      contentType: request.contentType,
      characterCount: request.characterCount,
    })

    if (this.latencyMs) await this.sleep(this.latencyMs)
    if (signal && signal.aborted) throw new TtsCancelledError()

    if (this.failFor) {
      const err = this.failFor(request, callIndex)
      if (err) throw err
    }

    const audio = fakeAudioBytes(request.ssml)
    if (audio.byteLength === 0) {
      throw new TtsProviderError('Mock produced no audio', { code: TTS_ERROR_CODES.EMPTY_AUDIO })
    }

    return {
      audio,
      contentType: OUTPUT_FORMAT_CONTENT_TYPE,
      provider: this.name,
      providerVersion: this.apiVersion,
      voice: request.voice,
      locale: request.locale,
      speakingRate: request.speakingRate,
      outputFormat: request.outputFormat,
      characterCount: request.characterCount,
      requestCount: 1,
      byteLength: audio.byteLength,
      durationMs: this.latencyMs,
    }
  }
}
