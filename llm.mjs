import OpenAI from 'openai'

// Central LLM provider config for all content generators.
//
// Defaults to Google Gemini's OpenAI-compatible endpoint — cheap, a far more
// generous free tier than Groq, and noticeably better at natural non-English
// text (Japanese/Russian example sentences) and non-trivial questions. Falls
// back to Groq when only GROQ_API_KEY is set, so older workflow tasks keep
// working. Every knob is overridable by env, so switching providers or models
// is a config change, not a code change:
//   GEMINI_API_KEY   preferred key (selects Gemini)
//   GROQ_API_KEY     fallback key (selects Groq)
//   LLM_BASE_URL     override the OpenAI-compatible base URL
//   LLM_MODEL        override the model id
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

function pickConfig() {
  if (GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: GEMINI_API_KEY,
      baseURL: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
      // flash-lite: much higher free-tier rate limits and no heavy "thinking"
      // pass, so the bulk jobs (hundreds of example sentences) actually finish.
      // Plenty good for short sentences + MCQs; override with LLM_MODEL for max
      // quality (e.g. gemini-2.5-flash) on the smaller story runs.
      model: process.env.LLM_MODEL || 'gemini-2.5-flash-lite',
    }
  }
  if (GROQ_API_KEY) {
    return {
      provider: 'groq',
      apiKey: GROQ_API_KEY,
      baseURL: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
      model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    }
  }
  return null
}

const cfg = pickConfig()
if (!cfg) {
  console.error('Missing LLM key. Set GEMINI_API_KEY (preferred) or GROQ_API_KEY.')
  process.exit(1)
}

// A per-request timeout so a stalled provider call fails fast and the script's
// own backoff/retry kicks in, instead of hanging on the SDK's 10-minute default.
export const llm = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, timeout: 60000, maxRetries: 2 })
export const LLM_MODEL = cfg.model
export const LLM_PROVIDER = cfg.provider

console.log(`[llm] provider=${cfg.provider} model=${cfg.model}`)
