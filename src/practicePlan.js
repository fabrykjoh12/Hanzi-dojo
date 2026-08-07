// What the Practice screen shows, and in what order.
//
// This is the layout decision on its own, away from JSX: which single drill is
// the screen's primary action, which drills fall in behind it, and which of them
// still carry a "this is waiting for you" count. Practice.jsx only maps the
// result onto panels and icons.
//
// Pure data in, pure data out — no React, no Supabase, no colours. A drill
// carries a `tone` ('signal' when a real count is behind it, otherwise
// 'accent'); the screen decides what those look like, so the palette stays in
// one place.

// The script drill matches the language's writing system. Keyed by
// `languageTheme().script` rather than by language name, so a new language is
// still a data change (CLAUDE.md §1).
const SCRIPT_DRILLS = {
  hanzi: { key: 'tones', title: 'Tones', desc: 'Hear a word, name its tone' },
  kana: { key: 'kana', title: 'Kana', desc: 'Hiragana and katakana' },
  cyrillic: { key: 'cyrillic', title: 'Alphabet', desc: 'Cyrillic letters and sounds' },
}

// Lookup and reference. These are places to go, not things to practise, so the
// screen renders them as quiet rows rather than as drills.
const TOOLS = [
  { key: 'words', title: 'Word list', desc: 'Every word and its status' },
  { key: 'known', title: 'Words you already know', desc: 'Import a list or tick off what you know' },
  { key: 'dictionary', title: 'Dictionary', desc: 'Look up any word, hear it, save it' },
  { key: 'analyzer', title: 'Analyze text', desc: 'Paste text, see the share you know' },
  { key: 'grammar', title: 'Grammar guide', desc: 'How the language works' },
  { key: 'youtube', title: 'Videos', desc: 'Curated listening' },
]

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's')
}

function weakDrill(count) {
  return {
    key: 'weak',
    title: 'Weak words',
    desc: count > 0 ? plural(count, 'word') + ' keep slipping' : 'Clean up the words that trip you',
    badge: count > 0 ? count : null,
    tone: count > 0 ? 'signal' : 'accent',
  }
}

function grammarDrill(count) {
  return {
    key: 'grammarpractice',
    title: 'Grammar review',
    desc: count > 0 ? plural(count, 'pattern') + ' due' : 'Keep your patterns sharp',
    badge: count > 0 ? count : null,
    tone: count > 0 ? 'signal' : 'accent',
  }
}

// The one thing the screen asks you to do. Anything genuinely waiting wins,
// because that is the only case where the screen knows something the learner
// doesn't; otherwise it opens on Listening, the lightest way back in.
//
// Copy stays observational — a count and what it means, never a warning.
function pickPrimary(weakCount, grammarDueCount) {
  if (weakCount > 0) {
    return {
      key: 'weak',
      title: 'Weak words',
      eyebrow: 'Waiting for you',
      reason: plural(weakCount, 'word') + ' keep slipping. A short pass puts them back in the queue.',
      cta: 'Practise these',
      tone: 'signal',
    }
  }
  if (grammarDueCount > 0) {
    return {
      key: 'grammarpractice',
      title: 'Grammar review',
      eyebrow: 'Waiting for you',
      reason: plural(grammarDueCount, 'pattern') + ' are due. Ten quiet minutes keeps them.',
      cta: 'Review patterns',
      tone: 'signal',
    }
  }
  return {
    key: 'listen',
    title: 'Listening',
    eyebrow: 'Start here',
    reason: 'Nothing is overdue. Hear a word and pick it out — the fastest way to make reading words into words you know.',
    cta: 'Start listening',
    tone: 'accent',
  }
}

// The full screen plan.
//
//   script  — languageTheme().script ('hanzi' | 'kana' | 'cyrillic')
//   cjk     — languageTheme().cjk; stroke order only exists for CJK scripts
//
// `drills` never repeats `primary`, so the hero and the grid can never show the
// same drill twice — that duplication is what made the old two-grid layout read
// as a pile rather than a list.
//   speech  — whether browser speech recognition is usable here. False in the
//             store apps' webviews (see speechSupport.js), where the Speaking
//             drill can only show a "not available" screen — so the hub simply
//             doesn't offer it rather than advertising a dead end.
export function buildPracticePlan({ script, cjk = false, speech = true, weakCount = 0, grammarDueCount = 0 } = {}) {
  const primary = pickPrimary(weakCount, grammarDueCount)
  const scriptDrill = SCRIPT_DRILLS[script] || null

  const drills = [
    weakDrill(weakCount),
    grammarDrill(grammarDueCount),
    { key: 'listen', title: 'Listening', desc: 'Hear a word, pick it', badge: null, tone: 'accent' },
    speech ? { key: 'speak', title: 'Speaking', desc: 'Say it aloud, get it checked', badge: null, tone: 'accent' } : null,
    { key: 'writing', title: 'Writing', desc: 'Type words from memory', badge: null, tone: 'accent' },
    { key: 'fillblank', title: 'Fill in the blank', desc: 'Complete the sentence', badge: null, tone: 'accent' },
    { key: 'builder', title: 'Sentence builder', desc: 'Reorder the words', badge: null, tone: 'accent' },
    scriptDrill ? { ...scriptDrill, badge: null, tone: 'accent' } : null,
    cjk ? { key: 'strokes', title: 'Stroke order', desc: 'Animated writing', badge: null, tone: 'accent' } : null,
  ].filter(Boolean).filter(d => d.key !== primary.key)

  // Anything still carrying a count leads the grid, so a second waiting drill
  // isn't buried three rows down just because the hero could only take one.
  const waiting = drills.filter(d => d.badge != null)
  const rest = drills.filter(d => d.badge == null)

  return { primary: primary, drills: waiting.concat(rest), tools: TOOLS }
}
