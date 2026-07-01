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
      model: process.env.LLM_MODEL || 'gemini-2.5-flash',
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

export const llm = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
export const LLM_MODEL = cfg.model
export const LLM_PROVIDER = cfg.provider

console.log(`[llm] provider=${cfg.provider} model=${cfg.model}`)
