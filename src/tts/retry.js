// Exponential backoff with full jitter.
//
// Jitter is not decoration: a batch run fires many requests at once, so without
// it every retry after a 429 lands at the same instant and gets throttled
// again. Full jitter spreads them across the window.
//
// Time and randomness are injected so the tests are instant and deterministic.

import { isRetryableError, TtsCancelledError } from './errors.js'

export const DEFAULT_BASE_MS = 500
export const DEFAULT_MAX_MS = 15000

// Full jitter: a uniform draw from [0, capped exponential]. `attempt` is
// 0-based (the delay before the first retry).
export function backoffDelay(attempt, { baseMs = DEFAULT_BASE_MS, maxMs = DEFAULT_MAX_MS, random = Math.random } = {}) {
  const ceiling = Math.min(maxMs, baseMs * Math.pow(2, attempt))
  return Math.floor(random() * ceiling)
}

const defaultSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Run `fn` until it succeeds, is not retryable, or the retry budget runs out.
// `fn` receives the 0-based attempt number.
//
// A provider that tells us how long to wait (Azure sends Retry-After on 429) is
// obeyed: honouring it is strictly better than guessing, and ignoring it is how
// a throttle turns into a ban.
export async function withRetry(fn, {
  retries = 3,
  baseMs = DEFAULT_BASE_MS,
  maxMs = DEFAULT_MAX_MS,
  sleep = defaultSleep,
  random = Math.random,
  isRetryable = isRetryableError,
  signal = null,
  onRetry = null,
} = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal && signal.aborted) throw new TtsCancelledError()
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      const canRetry = attempt < retries && isRetryable(err)
      if (!canRetry) throw err
      const hinted = Number(err && err.retryAfterMs)
      const delay = Number.isFinite(hinted) && hinted > 0
        ? Math.min(hinted, maxMs)
        : backoffDelay(attempt, { baseMs, maxMs, random })
      if (onRetry) onRetry({ attempt, delay, error: err })
      await sleep(delay)
    }
  }
  throw lastError
}
