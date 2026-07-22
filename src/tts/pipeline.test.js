import { describe, it, expect, vi } from 'vitest'
import { withRetry, backoffDelay } from './retry.js'
import { mapWithConcurrency } from './concurrency.js'
import { createLogger, redactSecrets, secretsFromConfig } from './log.js'
import { TtsProviderError, TtsCancelledError, TTS_ERROR_CODES } from './errors.js'

const noSleep = () => Promise.resolve()

function rateLimited() {
  return new TtsProviderError('Rate limited', { status: 429, code: TTS_ERROR_CODES.RATE_LIMIT, retryable: true })
}
function permanent() {
  return new TtsProviderError('Bad request', { status: 400, retryable: false })
}

describe('backoffDelay', () => {
  it('grows exponentially before the jitter draw', () => {
    const ceilingDraw = () => 0.999999
    const first = backoffDelay(0, { baseMs: 100, random: ceilingDraw })
    const third = backoffDelay(2, { baseMs: 100, random: ceilingDraw })
    expect(third).toBeGreaterThan(first)
  })

  it('never exceeds the cap', () => {
    expect(backoffDelay(20, { baseMs: 500, maxMs: 15000, random: () => 0.999999 })).toBeLessThanOrEqual(15000)
  })

  it('jitters, so a batch of retries does not land in one burst', () => {
    expect(backoffDelay(3, { baseMs: 100, random: () => 0 })).toBe(0)
    expect(backoffDelay(3, { baseMs: 100, random: () => 0.5 })).toBeGreaterThan(0)
  })
})

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    const sleep = vi.fn(noSleep)
    const fn = vi.fn(async () => 'ok')
    expect(await withRetry(fn, { sleep })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries a rate limit and eventually succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => { calls += 1; if (calls < 3) throw rateLimited(); return 'ok' })
    expect(await withRetry(fn, { retries: 3, sleep: noSleep, random: () => 0 })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('never retries a permanent failure', async () => {
    const fn = vi.fn(async () => { throw permanent() })
    await expect(withRetry(fn, { retries: 5, sleep: noSleep })).rejects.toThrow(/Bad request/)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('never retries an authentication failure - retrying a bad key just burns time', async () => {
    const authErr = new TtsProviderError('rejected the credentials', { status: 401, code: TTS_ERROR_CODES.AUTH, retryable: false })
    const fn = vi.fn(async () => { throw authErr })
    await expect(withRetry(fn, { retries: 5, sleep: noSleep })).rejects.toThrow(/credentials/)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after the retry budget and surfaces the last error', async () => {
    const fn = vi.fn(async () => { throw rateLimited() })
    await expect(withRetry(fn, { retries: 2, sleep: noSleep, random: () => 0 })).rejects.toThrow(/Rate limited/)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("obeys the provider's Retry-After instead of guessing", async () => {
    const slept = []
    const err = rateLimited()
    err.retryAfterMs = 2500
    let calls = 0
    await withRetry(async () => { calls += 1; if (calls === 1) throw err; return 'ok' }, {
      retries: 2, sleep: (ms) => { slept.push(ms); return Promise.resolve() }, random: () => 0,
    })
    expect(slept).toEqual([2500])
  })

  it('stops immediately when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = vi.fn(async () => 'ok')
    await expect(withRetry(fn, { signal: controller.signal, sleep: noSleep })).rejects.toBeInstanceOf(TtsCancelledError)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once', async () => {
    let inFlight = 0
    let peak = 0
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    await mapWithConcurrency(items, 3, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      await Promise.resolve()
      inFlight -= 1
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('processes every item exactly once', async () => {
    const seen = []
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => { seen.push(n) })
    expect(seen.slice().sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('returns results in input order regardless of completion order', async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (n) => {
      await new Promise(r => setTimeout(r, n / 10))
      return n
    })
    expect(results.map(r => r.value)).toEqual([30, 10, 20])
  })

  it('keeps going after one item fails', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n * 10
    })
    expect(results.map(r => r.ok)).toEqual([true, false, true])
    expect(results[1].error.message).toBe('boom')
    expect(results[2].value).toBe(30)
  })

  it('reports progress as items complete', async () => {
    const seen = []
    await mapWithConcurrency([1, 2, 3], 1, async (n) => n, {
      onProgress: ({ completed, total }) => seen.push(completed + '/' + total),
    })
    expect(seen).toEqual(['1/3', '2/3', '3/3'])
  })

  it('short-circuits the remaining items once cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const worker = vi.fn(async (n) => n)
    const results = await mapWithConcurrency([1, 2, 3], 2, worker, { signal: controller.signal })
    expect(worker).not.toHaveBeenCalled()
    expect(results.every(r => r.error instanceof TtsCancelledError)).toBe(true)
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})

describe('redactSecrets', () => {
  const key = 'super-secret-azure-key-value-1234'

  it('removes a secret wherever it appears', () => {
    expect(redactSecrets('using ' + key + ' now', [key])).toBe('using [redacted] now')
  })

  it('removes every occurrence, not just the first', () => {
    const out = redactSecrets(key + ' and ' + key, [key])
    expect(out.indexOf(key)).toBe(-1)
  })

  it('leaves short values alone so ordinary output is not mangled', () => {
    expect(redactSecrets('the id is abc', ['abc'])).toBe('the id is abc')
  })

  it('pulls the secret list straight off a validated config', () => {
    expect(secretsFromConfig({ azure: { key } })).toEqual([key])
    expect(secretsFromConfig({ azure: null })).toEqual([])
  })
})

describe('createLogger', () => {
  const key = 'super-secret-azure-key-value-1234'
  function sinkSpy() {
    const lines = []
    return { lines, sink: { log: (l) => lines.push(l), warn: (l) => lines.push(l), error: (l) => lines.push(l), debug: (l) => lines.push(l) } }
  }

  it('scrubs a secret even when a caller accidentally logs it', () => {
    const { lines, sink } = sinkSpy()
    createLogger({ secrets: [key], sink }).info('calling with', key)
    expect(lines[0].indexOf(key)).toBe(-1)
    expect(lines[0]).toContain('[redacted]')
  })

  it('scrubs structured output too', () => {
    const { lines, sink } = sinkSpy()
    createLogger({ secrets: [key], sink }).json({ ok: true, key })
    expect(lines[0].indexOf(key)).toBe(-1)
  })

  it('honours the level threshold', () => {
    const { lines, sink } = sinkSpy()
    const log = createLogger({ level: 'warn', sink })
    log.info('quiet')
    log.warn('loud')
    expect(lines).toEqual(['loud'])
  })

  it('renders an Error without a stack trace', () => {
    const { lines, sink } = sinkSpy()
    createLogger({ sink }).error(new TtsProviderError('nope', { status: 400 }))
    expect(lines[0]).toBe('TtsProviderError: nope')
  })
})
