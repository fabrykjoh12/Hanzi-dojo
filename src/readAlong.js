// Word-by-word read-along timing.
//
// Story narration is one clip per line, with no word-boundary data. This module
// estimates where each word falls inside that clip, which works because of two
// facts: segmentLine's tokens TILE the line exactly (every character belongs to
// exactly one token, in order), and Mandarin is close to one character per
// syllable. Story lines are short, so accumulated drift stays under a syllable.
//
// Deliberately regex-free: the OXC parser this repo builds with is strict about
// regex literals, so character classification is done with code-point maths.
//
// If exact timings ever arrive (Azure's batch-synthesis API can return word
// boundaries), buildTimeline's return shape is the seam — replace the estimate
// and no reader changes.

// Azure leaves a little silence at each edge of a clip. Absorbing it keeps the
// first word from lighting before it is spoken.
export const LEAD_IN_MS = 60
export const TAIL_OUT_MS = 90

// Offered in the reader settings panel. 1x is last and is the default, so no
// existing learner's audio silently slows.
export const SPEED_RATES = [0.6, 0.8, 1]
export const DEFAULT_RATE = 1

// How far the un-spoken part of the line recedes.
export const SPOTLIGHT_DIM = 0.45

// Punctuation takes time without taking width. Values are in syllables.
const PAUSE_WEIGHTS = {
  '，': 0.5, '、': 0.5, ',': 0.5,
  '：': 0.5, ':': 0.5, '；': 0.5, ';': 0.5,
  '。': 1, '！': 1, '？': 1, '.': 1, '!': 1, '?': 1, '…': 1, '—': 0.5,
}

// Small kana ride on the previous mora rather than adding one of their own.
const SMALL_KANA = 'ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮ'

const VOWELS = 'aeiouyаеёиоуыэюя'

// One character, one syllable: CJK ideographs (incl. extension A) and kana.
function isSyllabic(ch) {
  const c = ch.codePointAt(0)
  if (c >= 0x3400 && c <= 0x9fff) return true
  if (c >= 0x3040 && c <= 0x30ff) return true
  return false
}

// A regex-free alphabetic test that covers latin and Cyrillic: only letters
// have a different lower and upper case.
function isAlpha(ch) {
  return ch.toLowerCase() !== ch.toUpperCase()
}

function isVowel(ch) {
  return VOWELS.indexOf(ch.toLowerCase()) !== -1
}

// The time one token takes, split into syllables (width) and pause (silence).
// Both are in "syllable units"; buildTimeline converts units to milliseconds.
export function tokenWeight(text) {
  let syllables = 0
  let pause = 0
  let inVowelRun = false
  let sawAlpha = false
  const chars = String(text || '')
  for (const ch of chars) {
    // Small kana MUST be tested before isSyllabic — they live inside the kana
    // code-point range, so the syllabic check would otherwise claim them and
    // きょう would count as three moras instead of two.
    if (SMALL_KANA.indexOf(ch) !== -1) { inVowelRun = false; continue }
    if (isSyllabic(ch)) { syllables += 1; inVowelRun = false; continue }
    const p = PAUSE_WEIGHTS[ch]
    if (p != null) { pause += p; inVowelRun = false; continue }
    if (isAlpha(ch)) {
      sawAlpha = true
      // One syllable per RUN of vowels, so "queue" is one, not four.
      if (isVowel(ch)) {
        if (!inVowelRun) { syllables += 1; inVowelRun = true }
      } else {
        inVowelRun = false
      }
      continue
    }
    inVowelRun = false
  }
  // A vowel-less alphabetic token still takes time to say.
  if (sawAlpha && syllables === 0) syllables = 1
  return { syllables, pause }
}

// tokens → per-token time spans, or null when no honest timeline exists.
// Returning null rather than throwing IS the degradation story: no timeline
// means no highlight, and the reader behaves exactly as it did before.
export function buildTimeline(tokens, { durationMs } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null
  const usable = durationMs - LEAD_IN_MS - TAIL_OUT_MS
  if (usable <= 0) return null

  const parts = tokens.map(t => tokenWeight(t && t.text))
  let units = 0
  parts.forEach(p => { units += p.syllables + p.pause })
  if (units <= 0) return null

  const perUnit = usable / units
  const spans = []
  let at = LEAD_IN_MS
  parts.forEach(p => {
    const width = (p.syllables + p.pause) * perUnit
    spans.push({ start: at, end: at + width })
    at += width
  })
  return { spans, durationMs, leadInMs: LEAD_IN_MS }
}

// Which token is sounding at `ms`. -1 during the lead-in; the last token is
// held lit through the tail-out silence, which reads calmer than blinking off
// a beat before the next line starts.
export function tokenAtTime(timeline, ms) {
  if (!timeline || !timeline.spans || timeline.spans.length === 0) return -1
  if (!Number.isFinite(ms)) return -1
  const spans = timeline.spans
  if (ms < spans[0].start) return -1
  for (let i = 0; i < spans.length; i += 1) {
    if (ms < spans[i].end) return i
  }
  return spans.length - 1
}

// Where to seek to start reading from a given word.
export function startOfToken(timeline, i) {
  if (!timeline || !timeline.spans) return null
  const span = timeline.spans[i]
  if (!span) return null
  return span.start
}

// The spotlight: the spoken word stays full and gains weight, the rest of the
// line recedes. Colour is deliberately untouched — the line already spends its
// colour channel on word status (accent = not started, amber = learning), and a
// third colour would turn a calm line into a traffic light.
//
// `hasActive` false returns an EMPTY object, so a line whose timeline could not
// be built is never left greyed out.
export function spotlightStyle(isActive, hasActive, reduceMotion) {
  if (!hasActive) return {}
  return {
    opacity: isActive ? 1 : SPOTLIGHT_DIM,
    fontWeight: isActive ? 700 : undefined,
    transition: reduceMotion ? 'none' : 'opacity .18s ease',
  }
}
