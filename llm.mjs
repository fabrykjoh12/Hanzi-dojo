import OpenAI from 'openai'
import { providerChain, nextFailoverState, QUOTA_STRIKES_BEFORE_FAILOVER } from './llmProviders.mjs'

// Central LLM provider config for all content generators.
//
// Prefers Google Gemini's OpenAI-compatible endpoint — cheap, a far more
// generous free tier than Groq, and noticeably better at natural non-English
// text (Japanese/Russian example sentences) and non-trivial questions — and
// keeps Groq as a standby it switches to *at runtime* when Gemini's quota runs
// out mid-job. Every knob is overridable by env, so switching providers or
// models is a config change, not a code change:
//   GEMINI_API_KEY   preferred key
//   GROQ_API_KEY     standby key (also the primary when it is the only one set)
//   LLM_BASE_URL     override the primary's OpenAI-compatible base URL
//   LLM_MODEL        override the primary's model id
// Provider order and the failover rules live in `llmProviders.mjs`, where they
// are unit-tested.
const chain = providerChain(process.env)
if (!chain.length) {
  console.error('Missing LLM key. Set GEMINI_API_KEY (preferred) or GROQ_API_KEY.')
  process.exit(1)
}

// A per-request timeout so a stalled provider call fails fast and the script's
// own backoff/retry kicks in, instead of hanging on the SDK's 10-minute default.
const clients = chain.map(c => ({
  ...c,
  client: new OpenAI({ apiKey: c.apiKey, baseURL: c.baseURL, timeout: 60000, maxRetries: 2 }),
}))

let active = 0
let strikes = 0

// Every generator calls the client through this, so the standby covers all of
// them without a call-site change. The caller's `model` is replaced once we have
// moved down the chain: a model id names a provider, and the callers captured
// theirs (`LLM_MODEL`, or the premium id) at import time. That includes premium
// calls — a serial-story run finishing on the standby's model beats one failing
// outright, and the run logs the switch either way.
async function createCompletion(params) {
  for (;;) {
    const current = clients[active]
    const request = active === 0 ? params : { ...params, model: current.model }
    try {
      const response = await current.client.chat.completions.create(request)
      strikes = 0
      return response
    } catch (err) {
      const next = nextFailoverState({ active, strikes, chainLength: clients.length }, err)
      active = next.active
      strikes = next.strikes
      if (next.rethrow) throw err
      console.log('')
      console.log(`[llm] ${current.provider} is out of quota (${QUOTA_STRIKES_BEFORE_FAILOVER} refusals) — switching to ${clients[active].provider} model=${clients[active].model} for the rest of this run.`)
    }
  }
}

// Shaped like the OpenAI client the generators used to import directly.
export const llm = { chat: { completions: { create: createCompletion } } }
export const LLM_MODEL = chain[0].model
export const LLM_PROVIDER = chain[0].provider

// Which provider calls are actually landing on right now — `LLM_PROVIDER` is the
// one the run started with.
export function activeProvider() {
  return clients[active].provider
}

const standby = chain.length > 1 ? `, standby=${chain[1].provider}` : ''
console.log(`[llm] provider=${chain[0].provider} model=${chain[0].model}${standby}`)

// Premium tier for the small, quality-critical jobs (serial story writing:
// ~100 calls per level, so even a top model costs a dollar or two per run).
// Prefers Anthropic via its OpenAI-compatible endpoint when ANTHROPIC_API_KEY
// is set; otherwise falls back to the standard client above so the scripts
// still run (at lower quality) with only a Gemini/Groq key. Deliberately NOT
// part of the provider chain: the bulk jobs (hundreds of example sentences)
// should never silently switch to the expensive tier just because the key
// exists.
//   ANTHROPIC_API_KEY    selects Anthropic for premium calls
//   LLM_MODEL_PREMIUM    override the premium model id
export function premiumLlm() {
  const key = process.env.ANTHROPIC_API_KEY
  if (key) {
    return {
      client: new OpenAI({
        apiKey: key,
        baseURL: process.env.LLM_BASE_URL_PREMIUM || 'https://api.anthropic.com/v1/',
        timeout: 120000,
        maxRetries: 2,
      }),
      model: process.env.LLM_MODEL_PREMIUM || 'claude-sonnet-5',
      provider: 'anthropic',
    }
  }
  // No Anthropic key: reuse the standard client. On Gemini, default the
  // premium tier to gemini-2.5-flash — a real step up from the flash-lite the
  // bulk jobs use, but far faster and far less prone to the empty-"thinking"
  // responses that gemini-2.5-pro returns on smaller calls (pro made the first
  // serial run take 31 min and produce nothing). Set LLM_MODEL_PREMIUM to
  // gemini-2.5-pro to opt into the slower, top-quality tier. Bulk jobs keep
  // using LLM_MODEL (flash-lite), so this never inflates their cost.
  const premiumDefault = chain[0].provider === 'gemini' ? 'gemini-2.5-flash' : chain[0].model
  return { client: llm, model: process.env.LLM_MODEL_PREMIUM || premiumDefault, provider: chain[0].provider }
}
