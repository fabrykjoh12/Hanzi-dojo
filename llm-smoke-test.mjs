// LLM provider/model smoke test — which models do the keys we ALREADY have
// actually serve today, and which of them can write usable Chinese?
//
// Two phases, both read-only and cheap:
//   1. INVENTORY — report which keys are present (presence + length only, never
//      the value) and list every model each provider's API actually offers.
//      Model ids rot; this asks the provider instead of trusting a constant.
//   2. PROBE — one minimal Chinese generation per candidate model, through the
//      SAME OpenAI-compatible path the generators use, recording success,
//      exact API error, latency and token usage. The probe doubles as a
//      capability check: it asks for 3 short lines containing two given HSK 3
//      words, so the result reveals instruction-following, Chinese ability and
//      format compliance rather than just "the endpoint answered".
//
// Usage:
//   node llm-smoke-test.mjs                          # inventory + auto-selected probes
//   node llm-smoke-test.mjs --models groq:qwen/qwen3-32b,gemini:gemini-2.5-pro
//   node llm-smoke-test.mjs --list-only              # inventory, zero generation calls
//   node llm-smoke-test.mjs --max-tests 8 --out reports/llm-smoke.json
//
// No Supabase, no story pipeline — this only talks to the LLM providers.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] != null ? args[i + 1] : def }
const has = (name) => args.includes('--' + name)

const outPath = arg('out', 'reports/llm-smoke.json')
const maxTests = parseInt(arg('max-tests', '12'), 10)
const explicitModels = arg('models', null)
const listOnly = has('list-only')

const PROVIDERS = {
  gemini: {
    keyName: 'GEMINI_API_KEY',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    listRequest: (key) => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key),
      headers: {},
    }),
    parseList: (json) => (json.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, '')),
  },
  groq: {
    keyName: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    listRequest: (key) => ({
      url: 'https://api.groq.com/openai/v1/models',
      headers: { Authorization: 'Bearer ' + key },
    }),
    parseList: (json) => (json.data || []).map(m => String(m.id || '')),
  },
}

// Models that cannot write a story: embeddings, audio, safety classifiers,
// image/video generators, and the tiny always-on utility models.
const EXCLUDE = /embedding|embed|whisper|tts|audio|speech|guard|safety|moderation|imagen|image|video|veo|vision|aqa|rerank|prompt-guard|learnlm|compound|allam|playai/i

// Preference ranking for auto-selection. Chinese quality is the whole point of
// this exercise, so models with strong Chinese training (Qwen, Kimi/Moonshot,
// GLM, DeepSeek) rank above general-purpose Western models of similar size,
// and small "instant"/"lite" tiers rank last.
const PREFER = [
  [/qwen/i, 100],
  [/kimi|moonshot/i, 95],
  [/glm|zhipu/i, 90],
  [/deepseek/i, 85],
  [/gemini-3.*pro|gemini-2\.5-pro/i, 80],
  [/gpt-oss-120b/i, 70],
  [/llama-4|maverick/i, 65],
  [/gemini-3|gemini-2\.5-flash(?!-lite)/i, 60],
  [/llama-3\.3-70b/i, 55],
  [/scout|gpt-oss-20b/i, 40],
  [/flash-lite|8b-instant|gemma/i, 10],
]
function preference(id) {
  for (const [re, score] of PREFER) if (re.test(id)) return score
  return 30
}

// The probe: two real HSK 3 target words, three short lines, plain text.
const PROBE_WORDS = ['邻居', '打算']
const PROBE_PROMPT =
  'Write exactly 3 short lines of simple Chinese (HSK 3 level) about a neighbour helping with a plan.\n' +
  'Both of these words must appear: ' + PROBE_WORDS.join('、') + '\n' +
  'Output plain text only: 3 lines, one sentence per line, no numbering, no explanation, no pinyin, no English.'

function hasCjk(s) {
  for (const ch of String(s || '')) {
    const c = ch.codePointAt(0)
    if (c >= 0x3400 && c <= 0x9FFF) return true
  }
  return false
}

async function listModels(name, cfg, key) {
  const { url, headers } = cfg.listRequest(key)
  const started = Date.now()
  try {
    const res = await fetch(url, { headers })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 300), latencyMs: Date.now() - started, models: [] }
    }
    const json = JSON.parse(text)
    return { ok: true, status: res.status, latencyMs: Date.now() - started, models: cfg.parseList(json).sort() }
  } catch (err) {
    return { ok: false, status: null, error: String(err.message || err).slice(0, 300), latencyMs: Date.now() - started, models: [] }
  }
}

async function probe(providerName, cfg, key, model) {
  const started = Date.now()
  const body = {
    model,
    max_tokens: 400,
    messages: [{ role: 'user', content: PROBE_PROMPT }],
  }
  try {
    const res = await fetch(cfg.baseURL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    })
    const latencyMs = Date.now() - started
    const text = await res.text()
    if (!res.ok) {
      let apiError = text.slice(0, 400)
      try {
        const j = JSON.parse(text)
        apiError = (j.error && (j.error.message || j.error.code)) || apiError
      } catch { /* keep raw */ }
      return { provider: providerName, model, ok: false, status: res.status, apiError: String(apiError).slice(0, 400), latencyMs }
    }
    const json = JSON.parse(text)
    const choice = json.choices && json.choices[0]
    let out = choice && choice.message && choice.message.content
    if (Array.isArray(out)) out = out.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
    out = typeof out === 'string' ? out.trim() : ''
    const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
    const usage = json.usage || {}
    return {
      provider: providerName,
      model,
      ok: out.length > 0,
      status: res.status,
      latencyMs,
      finishReason: choice && choice.finish_reason,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      chinese: hasCjk(out),
      lineCount: lines.length,
      wordsPresent: PROBE_WORDS.filter(w => out.includes(w)),
      followedFormat: lines.length === 3 && hasCjk(out) && !/[a-zA-Z]{4,}/.test(out),
      output: out,
      apiError: out.length > 0 ? null : 'empty content (finish_reason=' + (choice && choice.finish_reason) + ')',
    }
  } catch (err) {
    return { provider: providerName, model, ok: false, status: null, apiError: String(err.message || err).slice(0, 400), latencyMs: Date.now() - started }
  }
}

// ── Inventory ────────────────────────────────────────────────────────────────
const keyPresence = {}
for (const [name, cfg] of Object.entries(PROVIDERS)) {
  const v = process.env[cfg.keyName]
  keyPresence[cfg.keyName] = { present: Boolean(v && v.trim()), length: v ? v.trim().length : 0 }
}
for (const extra of ['ANTHROPIC_API_KEY', 'LLM_MODEL', 'LLM_MODEL_PREMIUM', 'LLM_BASE_URL']) {
  const v = process.env[extra]
  keyPresence[extra] = { present: Boolean(v && v.trim()), length: v ? v.trim().length : 0 }
}
console.log('Key inventory (presence only, values never printed):')
for (const [k, v] of Object.entries(keyPresence)) {
  console.log('  ' + k.padEnd(20) + (v.present ? 'present (' + v.length + ' chars)' : 'ABSENT'))
}

const inventory = {}
for (const [name, cfg] of Object.entries(PROVIDERS)) {
  const key = process.env[cfg.keyName]
  if (!key) { inventory[name] = { ok: false, error: cfg.keyName + ' not set', models: [] }; continue }
  inventory[name] = await listModels(name, cfg, key)
  const inv = inventory[name]
  console.log('\n' + name + ' /models → ' + (inv.ok ? inv.models.length + ' models (' + inv.latencyMs + 'ms)' : 'FAILED ' + inv.status + ': ' + inv.error))
  if (inv.ok) for (const m of inv.models) console.log('    ' + m)
}

// ── Candidate selection ──────────────────────────────────────────────────────
let candidates = []
if (explicitModels) {
  candidates = explicitModels.split(',').map(s => s.trim()).filter(Boolean).map(spec => {
    const idx = spec.indexOf(':')
    return { provider: spec.slice(0, idx), model: spec.slice(idx + 1) }
  })
} else {
  for (const [name, inv] of Object.entries(inventory)) {
    if (!inv.ok) continue
    for (const model of inv.models) {
      if (EXCLUDE.test(model)) continue
      candidates.push({ provider: name, model, score: preference(model) })
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))
  candidates = candidates.slice(0, maxTests)
}

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
  console.log('\nwrote ' + path)
}

if (listOnly) {
  write(outPath, { generatedAt: new Date().toISOString(), keyPresence, inventory, candidates })
  console.log('\n--list-only: no generation calls made.')
  process.exit(0)
}

// ── Probe ────────────────────────────────────────────────────────────────────
console.log('\nProbing ' + candidates.length + ' model(s) with one minimal Chinese request each:\n')
const results = []
for (const c of candidates) {
  const cfg = PROVIDERS[c.provider]
  if (!cfg) { console.log('  skip ' + c.provider + ':' + c.model + ' — unknown provider'); continue }
  const key = process.env[cfg.keyName]
  if (!key) { console.log('  skip ' + c.provider + ':' + c.model + ' — no key'); continue }
  const r = await probe(c.provider, cfg, key, c.model)
  results.push(r)
  const verdict = r.ok
    ? 'OK   ' + String(r.latencyMs).padStart(6) + 'ms  ' + String(r.promptTokens + '/' + r.completionTokens).padStart(9) + ' tok'
      + '  zh=' + (r.chinese ? 'yes' : 'NO') + '  lines=' + r.lineCount + '  words=' + r.wordsPresent.length + '/2'
      + (r.followedFormat ? '  format=ok' : '  format=off')
    : 'FAIL ' + String(r.latencyMs).padStart(6) + 'ms  ' + (r.status || '-') + ': ' + String(r.apiError).slice(0, 120)
  console.log('  ' + (c.provider + ':' + c.model).padEnd(52) + verdict)
}

const working = results.filter(r => r.ok && r.chinese)
write(outPath, { generatedAt: new Date().toISOString(), keyPresence, inventory, probePrompt: PROBE_PROMPT, results })

console.log('\n' + working.length + '/' + results.length + ' model(s) returned usable Chinese.')
for (const r of working.sort((a, b) => (b.wordsPresent.length - a.wordsPresent.length) || (a.latencyMs - b.latencyMs))) {
  console.log('  ' + r.provider + ':' + r.model)
  for (const line of String(r.output).split('\n').filter(Boolean).slice(0, 4)) console.log('      ' + line)
}
