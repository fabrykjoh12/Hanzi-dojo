import { describe, it, expect, vi, afterEach } from 'vitest'
import { directProvider, usageDelta, newUsage, stripReasoning, estimateTokens, retryAfterMs, DIRECT_PROVIDERS } from './llmDirect.mjs'

const ENV = { GROQ_API_KEY: 'k-groq', GEMINI_API_KEY: 'k-gemini' }

function mockFetch(impl) {
  const fn = vi.fn(impl)
  globalThis.fetch = fn
  return fn
}
afterEach(() => { vi.restoreAllMocks() })

const okResponse = (content, usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage }),
})

describe('directProvider', () => {
  it('refuses an unknown provider or a missing key', () => {
    expect(() => directProvider('mistral', 'x', ENV)).toThrow(/Unknown provider/)
    expect(() => directProvider('groq', 'x', {})).toThrow(/GROQ_API_KEY is not set/)
  })

  it('posts to the provider endpoint with the exact model and records usage', async () => {
    const fetchMock = mockFetch(async () => okResponse('你好'))
    const p = directProvider('groq', 'qwen/qwen3-32b', ENV)
    const text = await p.send({ prompt: 'hi', maxTokens: 100 })
    expect(text).toBe('你好')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(DIRECT_PROVIDERS.groq.baseURL + '/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer k-groq')
    expect(JSON.parse(init.body).model).toBe('qwen/qwen3-32b')
    expect(p.usage).toMatchObject({ requests: 1, failures: 0, promptTokens: 10, completionTokens: 5 })
  })

  it('never fails over — an HTTP error surfaces with provider, model and status', async () => {
    mockFetch(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { message: 'server exploded' } }) }))
    const p = directProvider('gemini', 'gemini-2.5-pro', ENV)
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/gemini\/gemini-2\.5-pro HTTP 500: server exploded/)
    expect(p.usage.failures).toBe(1)
  })

  it('treats empty content as a retryable error, not an empty story', async () => {
    mockFetch(async () => okResponse(''))
    const p = directProvider('groq', 'm', ENV)
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/empty content/)
  })

  it('reports network failures with the provider named', async () => {
    mockFetch(async () => { throw new Error('ECONNRESET') })
    const p = directProvider('groq', 'm', ENV)
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/groq\/m network error: ECONNRESET/)
    expect(p.usage.failures).toBe(1)
  })
})

describe('usageDelta', () => {
  it('attributes usage between two snapshots', () => {
    const before = { ...newUsage(), requests: 2, promptTokens: 100, completionTokens: 50, latencyMsTotal: 900, failures: 1 }
    const after = { ...before, requests: 5, promptTokens: 400, completionTokens: 200, latencyMsTotal: 3000, failures: 1, retryAfterWaitMs: 5000 }
    expect(usageDelta(before, after)).toEqual({
      requests: 3, failures: 0, promptTokens: 300, completionTokens: 150, latencyMsTotal: 2100,
      rateLimit429s: 0, throttleWaitMs: 0, retryAfterWaitMs: 5000,
    })
  })
})

describe('stripReasoning', () => {
  it('removes a closed <think> block and keeps the answer', () => {
    expect(stripReasoning('<think>plan plan plan</think>\n我的邻居很好。')).toBe('我的邻居很好。')
  })

  it('an unclosed <think> yields nothing — a truncated scratchpad is not a story', () => {
    expect(stripReasoning('<think>I should start by...')).toBe('')
  })

  it('handles a stray closing tag', () => {
    expect(stripReasoning('reasoning text</think>\n他打算去。')).toBe('他打算去。')
  })

  it('leaves ordinary output untouched', () => {
    expect(stripReasoning('TITLE: 去旅行\n李明去问邻居。')).toBe('TITLE: 去旅行\n李明去问邻居。')
  })

  it('a reasoning-only response surfaces as the retryable empty-content error', async () => {
    mockFetch(async () => okResponse('<think>still thinking'))
    const p = directProvider('groq', 'qwen/qwen3.6-27b', ENV)
    await expect(p.send({ prompt: 'x', maxTokens: 100 })).rejects.toThrow(/empty content/)
  })
})

describe('reasoning_effort', () => {
  it('is sent only when set', async () => {
    const fetchMock = mockFetch(async () => okResponse('ok'))
    await directProvider('groq', 'qwen/qwen3.6-27b', ENV, { reasoningEffort: 'none' }).send({ prompt: 'x', maxTokens: 10 })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning_effort).toBe('none')

    const plain = mockFetch(async () => okResponse('ok'))
    await directProvider('groq', 'm', ENV).send({ prompt: 'x', maxTokens: 10 })
    expect(JSON.parse(plain.mock.calls[0][1].body)).not.toHaveProperty('reasoning_effort')
  })
})

describe('rate awareness (bench-1..5: 70-80% of requests were predictable 429s)', () => {
  // Virtual clock: sleep advances time instead of waiting.
  function virtualTime() {
    let t = 1_000_000
    return { now: () => t, sleep: async (ms) => { t += ms }, advance: (ms) => { t += ms } }
  }

  it('estimateTokens: CJK ~1/char, other ~1/3.5 chars', () => {
    expect(estimateTokens('我们去')).toBe(3)
    expect(estimateTokens('abcdefg')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('retryAfterMs prefers the header, falls back to the message text', () => {
    expect(retryAfterMs('2', '')).toBe(2000)
    expect(retryAfterMs(null, 'Please try again in 7.66s.')).toBe(7660)
    expect(retryAfterMs(undefined, 'Please try again in 250ms.')).toBe(250)
    expect(retryAfterMs(null, 'no hint here')).toBeNull()
  })

  it('a request that cannot fit the minute budget WAITS instead of being sent to fail', async () => {
    const vt = virtualTime()
    const fetchMock = mockFetch(async () => okResponse('好', { prompt_tokens: 3000, completion_tokens: 1000 }))
    const p = directProvider('groq', 'm', ENV, { tpmBudget: 8000, sleep: vt.sleep, now: vt.now })
    await p.send({ prompt: 'x', maxTokens: 3000 })          // spends 4000 actual
    await p.send({ prompt: 'x', maxTokens: 3000 })          // 4000 + 4000 = fits exactly
    expect(p.usage.throttleWaitMs).toBe(0)
    await p.send({ prompt: 'x', maxTokens: 3000 })          // would be 12000 > 8000 → waits
    expect(p.usage.throttleWaitMs).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBe(3)             // never sent-to-fail
    expect(p.usage.rateLimit429s).toBe(0)
  })

  it('a 429 waits per Retry-After INSIDE send() and then succeeds — no error escapes', async () => {
    const vt = virtualTime()
    let n = 0
    mockFetch(async () => {
      n += 1
      if (n === 1) {
        return {
          ok: false, status: 429,
          headers: { get: (k) => (k === 'retry-after' ? '3' : null) },
          text: async () => JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 3s.' } }),
        }
      }
      return okResponse('好', { prompt_tokens: 10, completion_tokens: 5 })
    })
    const p = directProvider('groq', 'm', ENV, { tpmBudget: 8000, sleep: vt.sleep, now: vt.now })
    const before = vt.now()
    const text = await p.send({ prompt: 'x', maxTokens: 100 })
    expect(text).toBe('好')
    expect(p.usage.rateLimit429s).toBe(1)
    expect(p.usage.retryAfterWaitMs).toBe(3000)
    expect(vt.now() - before).toBeGreaterThanOrEqual(3000)  // it really waited
  })

  it('gives up only after the wait budget, with a clear error', async () => {
    const vt = virtualTime()
    mockFetch(async () => ({
      ok: false, status: 429,
      headers: { get: () => '60' },
      text: async () => '{}',
    }))
    const p = directProvider('groq', 'm', ENV, { tpmBudget: null, maxWaitMs: 100000, sleep: vt.sleep, now: vt.now })
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/waited \d+s, provider asks for 60s more/)
    expect(p.usage.rateLimit429s).toBeGreaterThan(1)
  })

  // blueprint-smoke-1 failed four times with "still rate-limited after 0s of
  // waiting", which reads like the pacing never ran. It had: the provider
  // asked for longer than this client may wait, which is a quota window and
  // not throttling. The error has to say which of the two it is.
  it('a backoff longer than the cap is reported as the provider asking, not as no waiting', async () => {
    const vt = virtualTime()
    mockFetch(async () => ({ ok: false, status: 429, headers: { get: () => '900' }, text: async () => '{}' }))
    const p = directProvider('groq', 'm', ENV, { tpmBudget: null, maxWaitMs: 240000, sleep: vt.sleep, now: vt.now })
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/waited 0s, provider asks for 900s more \(cap 240s\)/)
  })

  it('a 413 still fails immediately — permanent errors are not waited on', async () => {
    const vt = virtualTime()
    mockFetch(async () => ({ ok: false, status: 413, text: async () => JSON.stringify({ error: { message: 'Request too large' } }) }))
    const p = directProvider('groq', 'm', ENV, { sleep: vt.sleep, now: vt.now })
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/HTTP 413/)
  })

  it('gemini has no TPM pacing by default; groq defaults to 8000', async () => {
    const vt = virtualTime()
    mockFetch(async () => okResponse('好', { prompt_tokens: 9000, completion_tokens: 2000 }))
    const g = directProvider('gemini', 'm', ENV, { sleep: vt.sleep, now: vt.now })
    await g.send({ prompt: 'x', maxTokens: 100 })
    await g.send({ prompt: 'x', maxTokens: 100 })
    expect(g.usage.throttleWaitMs).toBe(0)
  })
})
