// What the Practice screen shows, and in what order.
//
// This is the layout decision on its own, away from JSX: which single drill is
// the screen's primary action, which drills fall in behind it, and which of them
// still carry a "this is waiting for you" count. Practice.jsx only maps the
// result onto panels and icons.
//
// Pure data in, pure data out — no React, no Supabase, no colours (one import:
// the mastery threshold, which is a rule rather than a value this file gets to
// pick). A drill carries a `tone` ('signal' when a real count is behind it,
// otherwise 'accent'); the screen decides what those look like, so the palette
// stays in one place.

import { TEST_UNLOCK_MASTERY_PCT } from './mastery'

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

// Every drill key this hub can offer, as a stable set.
//
// The `practice_drill_started` event keys on these, so a drill added to the plan
// without being added here would be a measurement hole — `practicePlan.test.js`
// walks every script/cjk/speech combination and fails if one appears.
//
// Not drills, deliberately: `test` is progression and the six `TOOLS` are places
// to look things up. Counting a dictionary lookup as practice would make the
// numbers useless for the question they exist to answer.
export const DRILL_KEYS = [
  'weak', 'grammarpractice', 'listen', 'speak', 'writing', 'fillblank', 'builder',
  'tones', 'kana', 'cyrillic', 'strokes',
]

export function isDrillKey(key) {
  return DRILL_KEYS.indexOf(key) !== -1
}

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

// The level test's place on this screen.
//
// It used to have none. `test` is owned by the Practice tab (navStack.js
// VIEW_CLASS) and the desktop rail gives it a slot next to Practice, but on a
// phone it lived in the "More" sheet between Profile and Log out — so the gate
// on progression, the one thing in the app that requires 100%, was filed with
// the account settings and nothing on any screen linked to it.
//
// This is a DISCOVERABILITY surface, not the gate. Test.jsx owns the gate: it
// fetches its own status and also unlocks for anyone who already passed this
// level, which the Home counts do not carry. So the row is always openable and
// the locked state is an explanation, never a refusal — a screen that can't see
// the whole rule must not be the thing that says no.
export function levelTestEntry({ masteredCount = 0, totalWords = 0 } = {}) {
  const mastered = Math.max(0, masteredCount)
  // The same threshold Test.jsx prints, so the two screens never advertise
  // different targets.
  const needed = Math.ceil(totalWords * TEST_UNLOCK_MASTERY_PCT)
  return {
    key: 'test',
    unlocked: totalWords > 0 && mastered >= needed,
    masteredCount: mastered,
    totalWords,
    needed,
    remaining: Math.max(0, needed - mastered),
    pct: totalWords > 0 ? Math.min(100, Math.round((mastered / totalWords) * 100)) : 0,
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
export function buildPracticePlan({
  script, cjk = false, speech = true, weakCount = 0, grammarDueCount = 0,
  masteredCount = 0, totalWords = 0,
} = {}) {
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

  return {
    primary: primary,
    levelTest: levelTestEntry({ masteredCount, totalWords }),
    drills: waiting.concat(rest),
    tools: TOOLS,
  }
}
