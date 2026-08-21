import { describe, it, expect, vi, afterEach } from 'vitest'
import { directProvider, usageDelta, newUsage, DIRECT_PROVIDERS } from './llmDirect.mjs'

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
    mockFetch(async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'rate limit' } }) }))
    const p = directProvider('gemini', 'gemini-2.5-pro', ENV)
    await expect(p.send({ prompt: 'x', maxTokens: 10 })).rejects.toThrow(/gemini\/gemini-2\.5-pro HTTP 429: rate limit/)
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
    const after = { ...before, requests: 5, promptTokens: 400, completionTokens: 200, latencyMsTotal: 3000, failures: 1 }
    expect(usageDelta(before, after)).toEqual({
      requests: 3, failures: 0, promptTokens: 300, completionTokens: 150, latencyMsTotal: 2100,
    })
  })
})
