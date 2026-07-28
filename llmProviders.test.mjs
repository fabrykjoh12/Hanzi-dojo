import { describe, it, expect } from 'vitest'
import { providerChain, isQuotaRefusal, nextFailoverState, QUOTA_STRIKES_BEFORE_FAILOVER } from './llmProviders.mjs'

describe('providerChain', () => {
  it('puts Gemini first and keeps Groq as the standby when both keys are set', () => {
    const chain = providerChain({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' })
    expect(chain.map(c => c.provider)).toEqual(['gemini', 'groq'])
    expect(chain[0].model).toBe('gemini-2.5-flash-lite')
    expect(chain[1].model).toBe('llama-3.3-70b-versatile')
  })

  it('uses Groq as the primary when it is the only key', () => {
    const chain = providerChain({ GROQ_API_KEY: 'q' })
    expect(chain.map(c => c.provider)).toEqual(['groq'])
  })

  it('has no provider without a key', () => {
    expect(providerChain({})).toEqual([])
    expect(providerChain(undefined)).toEqual([])
  })

  it('applies LLM_MODEL / LLM_BASE_URL to the primary only', () => {
    // The regression this guards: a Gemini model id pushed onto the Groq
    // standby would make the fallback fail too, so the failover buys nothing.
    const chain = providerChain({
      GEMINI_API_KEY: 'g',
      GROQ_API_KEY: 'q',
      LLM_MODEL: 'gemini-2.5-pro',
      LLM_BASE_URL: 'https://example.test/v1/',
    })
    expect(chain[0].model).toBe('gemini-2.5-pro')
    expect(chain[0].baseURL).toBe('https://example.test/v1/')
    expect(chain[1].model).toBe('llama-3.3-70b-versatile')
    expect(chain[1].baseURL).toBe('https://api.groq.com/openai/v1')
  })

  it('honours LLM_MODEL when Groq is the primary', () => {
    const chain = providerChain({ GROQ_API_KEY: 'q', LLM_MODEL: 'llama-3.1-8b-instant' })
    expect(chain[0].model).toBe('llama-3.1-8b-instant')
  })

  it('carries the keys through to the caller', () => {
    const chain = providerChain({ GEMINI_API_KEY: 'gkey', GROQ_API_KEY: 'qkey' })
    expect(chain[0].apiKey).toBe('gkey')
    expect(chain[1].apiKey).toBe('qkey')
  })
})

describe('isQuotaRefusal', () => {
  it('recognises a 429 status', () => {
    expect(isQuotaRefusal({ status: 429 })).toBe(true)
  })

  it('recognises the message the SDK gives when the body is empty', () => {
    // Exactly what the 2026-07-28 HSK 3 fill logged, four times per batch.
    expect(isQuotaRefusal(new Error('429 status code (no body)'))).toBe(true)
  })

  it('recognises quota and rate-limit wording from either provider', () => {
    expect(isQuotaRefusal(new Error('RESOURCE_EXHAUSTED: quota exceeded'))).toBe(true)
    expect(isQuotaRefusal(new Error('Rate limit reached for model'))).toBe(true)
    expect(isQuotaRefusal({ message: 'nope', code: 'insufficient_quota' })).toBe(true)
  })

  it('does not fail over on errors another provider would repeat', () => {
    expect(isQuotaRefusal(new Error('400 invalid request: max_tokens too large'))).toBe(false)
    expect(isQuotaRefusal({ status: 401, message: 'invalid api key' })).toBe(false)
    expect(isQuotaRefusal({ status: 500, message: 'internal error' })).toBe(false)
    expect(isQuotaRefusal(null)).toBe(false)
    expect(isQuotaRefusal(undefined)).toBe(false)
  })
})

describe('nextFailoverState', () => {
  const two = { active: 0, strikes: 0, chainLength: 2 }
  const quota = { status: 429, message: '429 status code (no body)' }

  it('counts a quota refusal but leaves the caller to back off first', () => {
    const next = nextFailoverState(two, quota)
    expect(next).toEqual({ active: 0, strikes: 1, switched: false, rethrow: true })
  })

  it('switches to the standby on the last strike', () => {
    let state = two
    for (let i = 1; i < QUOTA_STRIKES_BEFORE_FAILOVER; i += 1) {
      state = { ...state, ...nextFailoverState(state, quota) }
      expect(state.switched).toBe(false)
    }
    const next = nextFailoverState(state, quota)
    expect(next.switched).toBe(true)
    expect(next.rethrow).toBe(false)
    expect(next.active).toBe(1)
    expect(next.strikes).toBe(0)
  })

  it('never switches past the end of the chain', () => {
    const last = { active: 1, strikes: QUOTA_STRIKES_BEFORE_FAILOVER, chainLength: 2 }
    expect(nextFailoverState(last, quota)).toEqual({ active: 1, strikes: last.strikes, switched: false, rethrow: true })
    // A single-provider run has nowhere to go either.
    const alone = { active: 0, strikes: 0, chainLength: 1 }
    expect(nextFailoverState(alone, quota).rethrow).toBe(true)
  })

  it('does not spend a strike on an error the standby would repeat', () => {
    const next = nextFailoverState({ active: 0, strikes: 2, chainLength: 2 }, new Error('400 bad request'))
    expect(next).toEqual({ active: 0, strikes: 2, switched: false, rethrow: true })
  })
})

describe('QUOTA_STRIKES_BEFORE_FAILOVER', () => {
  it('waits out a per-minute limit before abandoning the provider', () => {
    // The generators retry a refused batch with 15s/30s/60s backoff, so more
    // than one strike is what makes this "the day's quota is gone" rather than
    // "too many requests this minute".
    expect(QUOTA_STRIKES_BEFORE_FAILOVER).toBeGreaterThan(1)
  })
})
