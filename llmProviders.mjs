// Pure provider-selection logic for the content generators. No SDK, no network,
// no side effects — so it can be unit-tested, which the client in `llm.mjs`
// cannot be (importing that file constructs clients and exits the process when
// no key is set).

// How many consecutive quota refusals from the active provider before giving up
// on it for the rest of the run.
//
// Why not 1: a 429 means either "too many requests this minute" (wait, it
// clears) or "the daily free tier is gone" (it will not clear today), and the
// providers do not reliably say which. The generators already retry a refused
// batch four times with 15s/30s/60s backoff, so three thrown refusals means the
// provider has said no across more than two minutes of wall clock — long past
// any per-minute window. At that point switching is right, and switching back
// mid-run would only rediscover the same wall.
export const QUOTA_STRIKES_BEFORE_FAILOVER = 3

// Is this the provider refusing on quota/rate limits, as opposed to a bad
// request, a rejected key, or a network blip? Only this class of error is worth
// failing over on — a malformed prompt fails identically on every provider.
export function isQuotaRefusal(err) {
  if (!err) return false
  if (err.status === 429) return true
  const text = ((err.message || '') + ' ' + (err.code || '')).toLowerCase()
  if (text.indexOf('429') !== -1) return true
  if (text.indexOf('rate limit') !== -1 || text.indexOf('rate_limit') !== -1) return true
  if (text.indexOf('quota') !== -1) return true
  if (text.indexOf('resource_exhausted') !== -1) return true
  return false
}

// What a failed call does to the failover state.
//
// Returns the next `{ active, strikes }` plus two flags: `switched` (log it, and
// retry the same request on the new provider) and `rethrow` (hand the error back
// to the caller's own retry/backoff loop, which is where the waiting happens).
// Exactly one of the two is ever true.
export function nextFailoverState(state, err) {
  const active = state.active
  const strikes = state.strikes
  const last = active >= state.chainLength - 1
  // A bad request, a rejected key or a 500 fails identically on the standby, and
  // a strike for it would spend the one switch we have on an unrelated problem.
  if (!isQuotaRefusal(err) || last) return { active, strikes, switched: false, rethrow: true }
  const struck = strikes + 1
  if (struck < QUOTA_STRIKES_BEFORE_FAILOVER) return { active, strikes: struck, switched: false, rethrow: true }
  return { active: active + 1, strikes: 0, switched: true, rethrow: false }
}

// The providers to try, best first.
//
// Gemini leads when its key is present: a far more generous free tier than Groq
// and noticeably better at natural non-English text. Groq follows as the
// standby — before this chain existed the choice was made once at import time,
// so an exhausted Gemini quota failed the whole job with a working Groq key
// sitting right there in the environment (2026-07-28: three HSK 3 words, four
// attempts each, all 429, zero written).
//
// The LLM_BASE_URL / LLM_MODEL overrides apply to the FIRST entry only. They
// name a specific endpoint and model, which belong to whichever provider is
// primary; pushing a Gemini model id onto the Groq standby would guarantee the
// fallback fails too.
export function providerChain(env) {
  const source = env || {}
  const chain = []
  if (source.GEMINI_API_KEY) {
    chain.push({
      provider: 'gemini',
      apiKey: source.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      // flash-lite: much higher free-tier rate limits and no heavy "thinking"
      // pass, so the bulk jobs (hundreds of example sentences) actually finish.
      model: 'gemini-2.5-flash-lite',
    })
  }
  if (source.GROQ_API_KEY) {
    chain.push({
      provider: 'groq',
      apiKey: source.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
    })
  }
  if (chain.length) {
    if (source.LLM_BASE_URL) chain[0].baseURL = source.LLM_BASE_URL
    if (source.LLM_MODEL) chain[0].model = source.LLM_MODEL
  }
  return chain
}
