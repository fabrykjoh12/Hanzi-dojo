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

export function newUsage() {
  return { requests: 0, failures: 0, promptTokens: 0, completionTokens: 0, latencyMsTotal: 0 }
}

// Snapshot arithmetic, so a caller can attribute usage to one candidate.
export function usageDelta(before, after) {
  return {
    requests: after.requests - before.requests,
    failures: after.failures - before.failures,
    promptTokens: after.promptTokens - before.promptTokens,
    completionTokens: after.completionTokens - before.completionTokens,
    latencyMsTotal: after.latencyMsTotal - before.latencyMsTotal,
  }
}

export function directProvider(providerName, model, env = process.env) {
  const cfg = DIRECT_PROVIDERS[providerName]
  if (!cfg) throw new Error('Unknown provider "' + providerName + '" (known: ' + Object.keys(DIRECT_PROVIDERS).join(', ') + ')')
  const key = env[cfg.keyName]
  if (!key) throw new Error(cfg.keyName + ' is not set — cannot use provider "' + providerName + '"')
  const url = cfg.baseURL.replace(/\/$/, '') + '/chat/completions'
  const usage = newUsage()

  const send = async ({ prompt, maxTokens }) => {
    const started = Date.now()
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      })
    } catch (err) {
      usage.requests += 1
      usage.failures += 1
      usage.latencyMsTotal += Date.now() - started
      throw new Error(providerName + '/' + model + ' network error: ' + (err.message || err))
    }
    const body = await res.text()
    usage.requests += 1
    usage.latencyMsTotal += Date.now() - started
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
    }
    const choice = json.choices && json.choices[0]
    let text = choice && choice.message && choice.message.content
    if (Array.isArray(text)) text = text.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
    if (typeof text !== 'string' || !text.trim()) {
      // Reasoning models can spend the whole budget on hidden thinking and
      // return empty content; surface it as a retryable error rather than
      // handing the pipeline an empty string it would score as unparseable.
      throw new Error(providerName + '/' + model + ' returned empty content (finish_reason=' + (choice && choice.finish_reason) + ')')
    }
    return text
  }

  return { send, name: providerName, model, usage }
}
