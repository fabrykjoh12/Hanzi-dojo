// Azure Speech provider (REST).
//
// REST rather than the Speech SDK on purpose: the whole pipeline runs in short
// Node scripts, the SDK is a large dependency built for streaming/microphone
// scenarios we do not have, and the existing generators in this repo already
// call a TTS REST endpoint with plain fetch. One HTTPS POST returns the MP3.
//
// The credential arrives as a constructor argument and only ever appears in the
// Ocp-Apim-Subscription-Key request header. It is never logged, never returned,
// never interpolated into a URL, and never included in an error message.

import {
  TtsProviderError,
  TtsTimeoutError,
  TtsCancelledError,
  providerErrorFromStatus,
  TTS_ERROR_CODES,
} from '../errors.js'
import { OUTPUT_FORMAT_CONTENT_TYPE, DEFAULT_OUTPUT_FORMAT } from '../constants.js'

// Our format names to Azure's. Keeping our own names means a future provider
// does not inherit Azure's vocabulary.
export const AZURE_OUTPUT_FORMATS = {
  'mp3-24khz-48kbit-mono': 'audio-24khz-48kbitrate-mono-mp3',
  'mp3-16khz-32kbit-mono': 'audio-16khz-32kbitrate-mono-mp3',
}

export function azureEndpoint(region) {
  return 'https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1'
}

// Azure sends Retry-After in seconds on a throttle. Honouring it beats guessing.
function retryAfterMs(headers) {
  if (!headers || !headers.get) return null
  const raw = headers.get('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.min(seconds * 1000, 60000)
}

export class AzureTTSProvider {
  constructor({
    key,
    region,
    timeoutMs = 20000,
    fetchImpl = null,
    userAgent = 'hanzi-dojo-tts',
  } = {}) {
    if (!key) throw new TtsProviderError('AzureTTSProvider requires a subscription key', { code: TTS_ERROR_CODES.CONFIG })
    if (!region) throw new TtsProviderError('AzureTTSProvider requires a region', { code: TTS_ERROR_CODES.CONFIG })
    this.name = 'azure'
    // The API version we are speaking. Stored on every generated row so a
    // future behaviour change on Azure's side is attributable.
    this.apiVersion = 'cognitiveservices/v1'
    this.key = key
    this.region = region
    this.timeoutMs = timeoutMs
    this.userAgent = userAgent
    this.fetchImpl = fetchImpl || ((...args) => fetch(...args))
  }

  // synthesize(request) -> TTSResult
  //
  // `signal` cancels an in-flight request (used when a batch is interrupted);
  // the internal timeout is separate, so a hung socket fails as a timeout even
  // when nobody cancelled.
  async synthesize(request, { signal = null } = {}) {
    const format = AZURE_OUTPUT_FORMATS[request.outputFormat || DEFAULT_OUTPUT_FORMAT]
    if (!format) {
      throw new TtsProviderError('Azure has no mapping for output format "' + request.outputFormat + '"', {
        code: TTS_ERROR_CODES.CONFIG,
      })
    }
    if (signal && signal.aborted) throw new TtsCancelledError()

    const controller = new AbortController()
    const onAbort = () => controller.abort()
    if (signal) signal.addEventListener('abort', onAbort)
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, this.timeoutMs)
    const startedAt = Date.now()

    let response
    try {
      response = await this.fetchImpl(azureEndpoint(this.region), {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': format,
          'User-Agent': this.userAgent,
        },
        body: request.ssml,
        signal: controller.signal,
      })
    } catch {
      if (timedOut) throw new TtsTimeoutError(this.timeoutMs)
      if (signal && signal.aborted) throw new TtsCancelledError()
      // A transport failure (DNS, reset socket). Retryable - and the message is
      // ours, not the raw error, so nothing from the request can leak into it.
      throw new TtsProviderError('Could not reach the Azure Speech endpoint', { retryable: true })
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    if (!response.ok) {
      // Azure puts a short diagnostic in the body; the request (and therefore
      // the key) is never echoed back, so including a truncated body is safe
      // and is usually the difference between "400" and "invalid voice name".
      let detail = ''
      try { detail = (await response.text()).slice(0, 300) } catch { /* body already consumed or empty */ }
      const err = providerErrorFromStatus(response.status, detail)
      const wait = retryAfterMs(response.headers)
      if (wait) err.retryAfterMs = wait
      throw err
    }

    const buffer = await response.arrayBuffer()
    const audio = new Uint8Array(buffer)
    if (audio.byteLength === 0) {
      throw new TtsProviderError('Azure returned an empty audio body', {
        code: TTS_ERROR_CODES.EMPTY_AUDIO, retryable: true,
      })
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
      durationMs: Date.now() - startedAt,
    }
  }
}
