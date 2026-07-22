import { describe, it, expect, vi } from 'vitest'
import { AzureTTSProvider, azureEndpoint, AZURE_OUTPUT_FORMATS } from './azure.js'
import { MockTTSProvider } from './mock.js'
import { buildTtsRequest } from '../request.js'
import { TtsTimeoutError, TtsCancelledError, TTS_ERROR_CODES } from '../errors.js'

// No test in this file makes a network call: every provider is handed a fake
// `fetchImpl`. Paid Azure requests happen only in the opt-in integration test.
const FAKE_KEY = 'test-key-0123456789abcdef0123456789abcdef'

function request(overrides = {}) {
  return buildTtsRequest({
    text: '银行', locale: 'zh-CN', voice: 'zh-CN-XiaoxiaoNeural', contentType: 'word', ...overrides,
  })
}

function audioResponse(bytes = [0xff, 0xfb, 0x10, 0x20]) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    text: async () => '',
  }
}

function errorResponse(status, body = '', headers = {}) {
  return {
    ok: false,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  }
}

function provider(fetchImpl, opts = {}) {
  return new AzureTTSProvider({ key: FAKE_KEY, region: 'westeurope', fetchImpl, ...opts })
}

describe('azureEndpoint', () => {
  it('builds the regional synthesis endpoint', () => {
    expect(azureEndpoint('westeurope')).toBe('https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1')
  })
})

describe('AzureTTSProvider construction', () => {
  it('refuses to construct without a credential', () => {
    expect(() => new AzureTTSProvider({ region: 'westeurope' })).toThrow(/subscription key/)
  })

  it('refuses to construct without a region', () => {
    expect(() => new AzureTTSProvider({ key: FAKE_KEY })).toThrow(/region/)
  })
})

describe('Azure request construction', () => {
  it('posts the SSML to the regional endpoint with the documented headers', async () => {
    const fetchImpl = vi.fn(async () => audioResponse())
    await provider(fetchImpl).synthesize(request())

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(init.method).toBe('POST')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe(FAKE_KEY)
    expect(init.headers['Content-Type']).toBe('application/ssml+xml')
    expect(init.headers['X-Microsoft-OutputFormat']).toBe(AZURE_OUTPUT_FORMATS['mp3-24khz-48kbit-mono'])
    expect(init.body.indexOf('<speak')).toBe(0)
    expect(init.body.indexOf('银行')).toBeGreaterThan(-1)
  })

  it('never puts the credential in the URL', async () => {
    const fetchImpl = vi.fn(async () => audioResponse())
    await provider(fetchImpl).synthesize(request())
    expect(fetchImpl.mock.calls[0][0].indexOf(FAKE_KEY)).toBe(-1)
  })

  it('sends the slow variant with a prosody rate', async () => {
    const fetchImpl = vi.fn(async () => audioResponse())
    await provider(fetchImpl).synthesize(request({ speakingRate: 0.8 }))
    expect(fetchImpl.mock.calls[0][1].body.indexOf('rate="-20%"')).toBeGreaterThan(-1)
  })

  it('rejects an output format it has no mapping for, before spending a request', async () => {
    const fetchImpl = vi.fn(async () => audioResponse())
    await expect(provider(fetchImpl).synthesize(request({ outputFormat: 'flac-96khz' })))
      .rejects.toThrow(/no mapping for output format/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('Azure results', () => {
  it('returns the audio bytes with the accounting an audit needs', async () => {
    const result = await provider(async () => audioResponse([1, 2, 3, 4, 5])).synthesize(request())
    expect(result.audio).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBe(5)
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.provider).toBe('azure')
    expect(result.providerVersion).toBe('cognitiveservices/v1')
    expect(result.requestCount).toBe(1)
    expect(result.characterCount).toBe(2)
  })

  it('treats an empty body as a retryable failure, not as valid silence', async () => {
    await expect(provider(async () => audioResponse([])).synthesize(request()))
      .rejects.toMatchObject({ code: TTS_ERROR_CODES.EMPTY_AUDIO, retryable: true })
  })
})

describe('Azure error handling', () => {
  it('marks a 401 as a non-retryable authentication failure', async () => {
    await expect(provider(async () => errorResponse(401)).synthesize(request()))
      .rejects.toMatchObject({ code: TTS_ERROR_CODES.AUTH, retryable: false })
  })

  it('marks a 429 as retryable and carries the Retry-After hint', async () => {
    try {
      await provider(async () => errorResponse(429, '', { 'retry-after': '3' })).synthesize(request())
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe(TTS_ERROR_CODES.RATE_LIMIT)
      expect(err.retryable).toBe(true)
      expect(err.retryAfterMs).toBe(3000)
    }
  })

  it('marks a 5xx as retryable', async () => {
    await expect(provider(async () => errorResponse(503)).synthesize(request()))
      .rejects.toMatchObject({ retryable: true, status: 503 })
  })

  it('marks a 400 as permanent and includes the provider diagnostic', async () => {
    await expect(provider(async () => errorResponse(400, 'Invalid voice name')).synthesize(request()))
      .rejects.toMatchObject({ retryable: false, status: 400 })
    await expect(provider(async () => errorResponse(400, 'Invalid voice name')).synthesize(request()))
      .rejects.toThrow(/Invalid voice name/)
  })

  it('never re-attaches the credential to an error', async () => {
    const leaky = errorResponse(400, 'some provider detail')
    try {
      await provider(async () => leaky).synthesize(request())
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.message.indexOf(FAKE_KEY)).toBe(-1)
      expect(err.message.indexOf('Ocp-Apim-Subscription-Key')).toBe(-1)
      expect(Object.keys(err.toRecord()).sort()).toEqual(['code', 'message', 'status'])
    }
  })

  it('reports a transport failure as retryable without echoing the request', async () => {
    await expect(provider(async () => { throw new TypeError('fetch failed') }).synthesize(request()))
      .rejects.toMatchObject({ retryable: true })
  })
})

describe('Azure timeout and cancellation', () => {
  const hanging = (url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      reject(err)
    })
  })

  it('times out a hung request instead of stalling the batch', async () => {
    await expect(provider(hanging, { timeoutMs: 10 }).synthesize(request()))
      .rejects.toBeInstanceOf(TtsTimeoutError)
  })

  it('does not call the endpoint at all when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn(async () => audioResponse())
    await expect(provider(fetchImpl).synthesize(request(), { signal: controller.signal }))
      .rejects.toBeInstanceOf(TtsCancelledError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('cancels a request already in flight', async () => {
    const controller = new AbortController()
    const promise = provider(hanging, { timeoutMs: 5000 }).synthesize(request(), { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toBeInstanceOf(TtsCancelledError)
  })
})

describe('MockTTSProvider', () => {
  it('satisfies the same interface and costs nothing', async () => {
    const mock = new MockTTSProvider()
    const result = await mock.synthesize(request())
    expect(result.provider).toBe('mock')
    expect(result.audio.byteLength).toBeGreaterThan(0)
    expect(mock.requestCount).toBe(1)
    expect(mock.characterCount).toBe(2)
  })

  it('is deterministic, so a cache-hit test means something', async () => {
    const a = await new MockTTSProvider().synthesize(request())
    const b = await new MockTTSProvider().synthesize(request())
    expect(Array.from(a.audio)).toEqual(Array.from(b.audio))
  })

  it('produces different bytes for different text', async () => {
    const a = await new MockTTSProvider().synthesize(request({ text: '银行' }))
    const b = await new MockTTSProvider().synthesize(request({ text: '你好' }))
    expect(Array.from(a.audio)).not.toEqual(Array.from(b.audio))
  })

  it('can be told to fail, which is how the retry paths are driven', async () => {
    const mock = new MockTTSProvider({ failFor: (_req, i) => (i === 0 ? new Error('first call fails') : null) })
    await expect(mock.synthesize(request())).rejects.toThrow(/first call fails/)
    await expect(mock.synthesize(request())).resolves.toBeTruthy()
  })
})
