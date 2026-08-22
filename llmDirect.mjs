// Explicit provider+model client for benchmarking (FAB-9).
//
// llm.mjs picks a provider by which keys exist and fails over mid-run — right
// for unattended bulk jobs, wrong for a comparison, where "which model wrote
// this" must be certain. This talks to exactly the provider and model it is
// told to, never fails over, and records per-call usage and latency so a
// benchmark can report cost and speed per candidate.
//
// Both providers speak the OpenAI-compatible chat-completions shape (Gemini
// via its /v1beta/openai/ endpoint), so one code path covers both. No SDK: the
// generators only ever need one endpoint, and fetch reports HTTP errors
// verbatim, which is exactly what a provider-behaviour report needs.

export const DIRECT_PROVIDERS = {
  gemini: {
    keyName: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  },
  groq: {
    keyName: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
  },
}

// Reasoning models (Qwen3, gpt-oss) emit their scratchpad in the content
// stream, wrapped in <think>…</think>. Left in place it would become story
// text — English prose the validator counts as lines, and a truncated
// scratchpad can swallow the entire answer. Strip it at the client boundary so
// every caller sees only the model's actual output.
//
// An UNCLOSED <think> means the response hit its token ceiling before it
// finished thinking: there is no answer in there, so stripping yields empty
// content and the caller's retry logic takes over — which is the honest
// outcome, not a silently truncated story.
export function stripReasoning(text) {
  let out = String(text || '')
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '')
  out = out.replace(/<think>[\s\S]*$/i, '')
  // Some models emit the closing tag only (opened before the visible stream).
  out = out.replace(/^[\s\S]*?<\/think>/i, '')
  return out.trim()
}

// Rough token estimate for pacing: CJK ~1 token per character, everything
// else ~1 per 3.5 characters. Overestimating slightly is safe — it just waits
// a little longer; underestimating re-creates the 413s.
export function estimateTokens(text) {
  let cjk = 0
  let other = 0
  for (const ch of String(text || '')) {
    const c = ch.codePointAt(0)
    if (c >= 0x3400 && c <= 0x9FFF) cjk += 1
    else other += 1
  }
  return cjk + Math.ceil(other / 3.5)
}

// Groq's free tier meters TOKENS PER MINUTE per model (prompt + max_tokens,
// checked before the request runs). bench-1..5 burned 70-80% of their
// requests on predictable 429s; this limiter spends the same budget on
// waiting instead:
//   - a sliding 60s window of spent tokens; a request that will not fit
//     waits until enough of the window has expired (never sent-to-fail);
//   - a 429 that still happens waits per its Retry-After header (or the
//     "try again in Ns" text) and retries INSIDE send(), so rate-limit
//     waiting never consumes a generation/repair attempt upstream.
// Clock and sleep are injectable so specs run on virtual time.
export const GROQ_TPM_DEFAULT = 8000

export function newRateLimiter({ tpmBudget, now = Date.now, sleep = null } = {}) {
  const slp = sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)))
  const window = []            // { at, tokens }
  const prune = () => {
    const cutoff = now() - 60000
    while (window.length && window[0].at <= cutoff) window.shift()
  }
  return {
    // Wait until `tokens` fits in the minute budget, then reserve them.
    // Returns the entry so the caller can correct the reservation to actual
    // usage once the provider reports it.
    async reserve(tokens) {
      let waited = 0
      if (tpmBudget) {
        for (;;) {
          prune()
          const spent = window.reduce((sum, e) => sum + e.tokens, 0)
          if (spent + tokens <= tpmBudget || window.length === 0) break
          const wait = Math.max(250, window[0].at + 60000 - now())
          waited += wait
          await slp(wait)
        }
      }
      const entry = { at: now(), tokens }
      window.push(entry)
      return { entry, waitedMs: waited }
    },
    sleep: slp,
    now,
  }
}

export function newUsage() {
  return {
    requests: 0, failures: 0, promptTokens: 0, completionTokens: 0, latencyMsTotal: 0,
    rateLimit429s: 0, throttleWaitMs: 0, retryAfterWaitMs: 0,
  }
}

// Snapshot arithmetic, so a caller can attribute usage to one candidate.
export function usageDelta(before, after) {
  return {
    requests: after.requests - before.requests,
    failures: after.failures - before.failures,
    promptTokens: after.promptTokens - before.promptTokens,
    completionTokens: after.completionTokens - before.completionTokens,
    latencyMsTotal: after.latencyMsTotal - before.latencyMsTotal,
    rateLimit429s: (after.rateLimit429s || 0) - (before.rateLimit429s || 0),
    throttleWaitMs: (after.throttleWaitMs || 0) - (before.throttleWaitMs || 0),
    retryAfterWaitMs: (after.retryAfterWaitMs || 0) - (before.retryAfterWaitMs || 0),
  }
}

// `reasoningEffort` maps to Groq's reasoning_effort parameter. Qwen3 burns its
// entire token budget on a hidden scratchpad by default — 2000 tokens of
// thinking to produce three lines — so a graded-reader job wants it dialled
// down or off. Sent only when set, so models that do not accept the parameter
// are unaffected; a model that rejects it returns a 400 the probe reports.
// Pull a wait from a 429: the Retry-After header when present, else the
// "Please try again in 7.66s" text Groq puts in the message, else null.
export function retryAfterMs(headerValue, bodyText) {
  const h = parseFloat(headerValue)
  if (Number.isFinite(h) && h > 0) return Math.ceil(h * 1000)
  const m = String(bodyText || '').match(/try again in\s+([0-9.]+)\s*(m?s)\b/i)
  if (m) return Math.ceil(parseFloat(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000))
  return null
}

export function directProvider(providerName, model, env = process.env, {
  reasoningEffort = null,
  tpmBudget = undefined,       // tokens/minute; default GROQ_TPM_DEFAULT for groq, off for gemini
  maxWaitMs = 240000,          // total rate-limit waiting allowed per send()
  sleep = null,                // injectable for specs
  now = Date.now,
} = {}) {
  const cfg = DIRECT_PROVIDERS[providerName]
  if (!cfg) throw new Error('Unknown provider "' + providerName + '" (known: ' + Object.keys(DIRECT_PROVIDERS).join(', ') + ')')
  const key = env[cfg.keyName]
  if (!key) throw new Error(cfg.keyName + ' is not set — cannot use provider "' + providerName + '"')
  const url = cfg.baseURL.replace(/\/$/, '') + '/chat/completions'
  const usage = newUsage()
  const budget = tpmBudget !== undefined ? tpmBudget
    : (providerName === 'groq' ? parseInt(env.GROQ_TPM || '', 10) || GROQ_TPM_DEFAULT : null)
  const limiter = newRateLimiter({ tpmBudget: budget, now, sleep })

  // One HTTP round trip. Returns { text } on success or { retryMs } when the
  // provider said "too fast, come back later" — everything else throws.
  const attempt = async ({ prompt, maxTokens, reservation }) => {
    const started = now()
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        }),
      })
    } catch (err) {
      usage.requests += 1
      usage.failures += 1
      usage.latencyMsTotal += now() - started
      throw new Error(providerName + '/' + model + ' network error: ' + (err.message || err))
    }
    const body = await res.text()
    usage.requests += 1
    usage.latencyMsTotal += now() - started
    if (res.status === 429) {
      usage.failures += 1
      usage.rateLimit429s += 1
      // A refused request spent nothing — release the reservation so the
      // window reflects what the provider actually counted.
      reservation.tokens = 0
      return { retryMs: retryAfterMs(res.headers && res.headers.get && res.headers.get('retry-after'), body) || 15000 }
    }
    if (!res.ok) {
      usage.failures += 1
      let detail = body.slice(0, 300)
      try {
        const j = JSON.parse(body)
        detail = (j.error && (j.error.message || j.error.code)) || detail
      } catch { /* keep the raw body */ }
      throw new Error(providerName + '/' + model + ' HTTP ' + res.status + ': ' + String(detail).slice(0, 300))
    }
    const json = JSON.parse(body)
    if (json.usage) {
      usage.promptTokens += json.usage.prompt_tokens || 0
      usage.completionTokens += json.usage.completion_tokens || 0
      // Correct the pacing reservation to what the provider really counted.
      reservation.tokens = (json.usage.prompt_tokens || 0) + (json.usage.completion_tokens || 0)
    }
    const choice = json.choices && json.choices[0]
    let text = choice && choice.message && choice.message.content
    if (Array.isArray(text)) text = text.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
    if (typeof text === 'string') text = stripReasoning(text)
    if (typeof text !== 'string' || !text.trim()) {
      // Reasoning models can spend the whole budget on hidden thinking and
      // return empty content; surface it as a retryable error rather than
      // handing the pipeline an empty string it would score as unparseable.
      throw new Error(providerName + '/' + model + ' returned empty content (finish_reason=' + (choice && choice.finish_reason) + ')')
    }
    return { text }
  }

  const send = async ({ prompt, maxTokens }) => {
    const need = estimateTokens(prompt) + maxTokens
    let waitedTotal = 0
    for (;;) {
      const { entry, waitedMs } = await limiter.reserve(need)
      usage.throttleWaitMs += waitedMs
      waitedTotal += waitedMs
      const result = await attempt({ prompt, maxTokens, reservation: entry })
      if (result.text != null) return result.text
      // 429 despite pacing: honor the provider's own clock, inside send(), so
      // the caller's generation/repair attempts are never spent on waiting.
      if (waitedTotal + result.retryMs > maxWaitMs) {
        // Say how long the provider asked for. Without it "still rate-limited
        // after 0s of waiting" reads like a pacing bug, when a 0s wait plus a
        // refusal means the opposite: the provider handed back a backoff
        // longer than this client is allowed to wait, which is a quota
        // window, not per-minute throttling. The smoke run could not be
        // diagnosed from its own artifact without this number.
        throw new Error(providerName + '/' + model + ' HTTP 429: waited ' + Math.round(waitedTotal / 1000)
          + 's, provider asks for ' + Math.round(result.retryMs / 1000) + 's more (cap ' + Math.round(maxWaitMs / 1000) + 's)')
      }
      usage.retryAfterWaitMs += result.retryMs
      waitedTotal += result.retryMs
      await limiter.sleep(result.retryMs)
    }
  }

  return { send, name: providerName, model, usage }
}
