// The pre-signup guided path: experience → purpose → style → daily minutes →
// an assembled "your path" → a first micro-lesson (你好) → then the account.
// Rendered by Landing.jsx, PathBuilding.jsx and FirstLesson.jsx.
//
// The order is the owner's deliberate design (2026-08-08): the account ask
// comes AFTER the first win, because someone who has just learned their first
// expression has a reason to save it. Every question can be skipped, and
// every answer can be changed later — these are preferences, not a contract.
//
// All copy here is honest on purpose. The daily estimates state what the
// number of minutes actually buys; the assembled path names a real story that
// really is readable at the stated level. Overpromising in the first minute
// is how the second day goes badly.

// ── Screen: How much Chinese do you know? ──────────────────────────────────
// `startLevel` seeds the post-signup onboarding's level pick; 'unsure' sets
// placementLater instead, which points at the existing level test.
export const EXPERIENCE_LEVELS = [
  { key: 'new', label: 'I’m completely new', startLevel: 1 },
  { key: 'few', label: 'I know a few words', startLevel: 1 },
  { key: 'hsk1', label: 'Around HSK 1', startLevel: 1 },
  { key: 'hsk2', label: 'Around HSK 2', startLevel: 2 },
  { key: 'hsk3plus', label: 'HSK 3 or higher', startLevel: 3 },
  { key: 'unsure', label: 'I’m not sure', startLevel: 1, placementLater: true },
]

export const DEFAULT_EXPERIENCE = 'new'

// ── Screen: Why are you learning? (multi-select) ───────────────────────────
// `reason` maps each purpose onto the single-reason vocabulary the rest of
// the app already personalizes by (prelogin.js REASONS), so the signup intro
// and post-signup onboarding keep working unchanged.
export const PURPOSES = [
  { key: 'travel', label: 'Travel', hanzi: '旅', reason: 'travel' },
  { key: 'conversations', label: 'Conversations', hanzi: '说', reason: 'family' },
  { key: 'study', label: 'Study or HSK', hanzi: '考', reason: 'exam' },
  { key: 'work', label: 'Work', hanzi: '工', reason: 'work' },
  { key: 'media', label: 'Chinese media', hanzi: '影', reason: 'culture' },
  { key: 'personal', label: 'Personal interest', hanzi: '好', reason: 'curious' },
]

// The single reason key the existing personalization understands: the first
// purpose picked wins (it was picked first for a reason), 'curious' when
// nothing was.
export function primaryReason(purposeKeys) {
  const first = (purposeKeys || [])[0]
  const p = PURPOSES.find(x => x.key === first)
  return p ? p.reason : 'curious'
}

// ── Screen: What sounds most enjoyable? ────────────────────────────────────
export const TRAINING_STYLES = [
  { key: 'stories', label: 'Stories & manhua', desc: 'Read your way in', hanzi: '读' },
  { key: 'flashcards', label: 'Flashcards', desc: 'Focused memory work', hanzi: '记' },
  { key: 'conversations', label: 'Conversations', desc: 'Words you can say', hanzi: '说' },
  { key: 'writing', label: 'Writing characters', desc: 'Stroke by stroke', hanzi: '写' },
  { key: 'balanced', label: 'A balanced mix', desc: 'A little of everything', hanzi: '和' },
]

// Preselected so the screen can be continued instantly.
export const DEFAULT_STYLE = 'balanced'

// ── Screen: Daily commitment ───────────────────────────────────────────────
// The estimate is the honest arithmetic of the default session: roughly a
// minute per new word plus a short review of what's due.
export const DAILY_PLANS = [
  { minutes: 5, label: 'Relaxed', words: 5 },
  { minutes: 10, label: 'Recommended', words: 10 },
  { minutes: 15, label: 'Focused', words: 15 },
  { minutes: 25, label: 'Intensive', words: 25 },
]

export const DEFAULT_MINUTES = 10

export function planEstimate(minutes) {
  const plan = DAILY_PLANS.find(p => p.minutes === minutes) || DAILY_PLANS[1]
  return plan.minutes + ' minutes a day ≈ ' + plan.words +
    ' new words and one short review session.'
}

// ── Screen: the assembled path ─────────────────────────────────────────────
// Four rows, revealed one by one. Each is something the app will actually do,
// which is why the story recommendation branches on level: 第一话 of the
// noodle-shop manhua genuinely is all-HSK 1, and promising it to an HSK 3
// learner (or a level test to a beginner) would be decoration, not a plan.
export function buildPath({ experience, purposes, minutes } = {}) {
  const exp = EXPERIENCE_LEVELS.find(e => e.key === experience) || EXPERIENCE_LEVELS[0]
  const plan = DAILY_PLANS.find(p => p.minutes === minutes) || DAILY_PLANS[1]

  const start = exp.placementLater
    ? { title: 'Starting point', value: 'A short placement test finds your level' }
    : { title: 'Starting point', value: 'HSK ' + exp.startLevel + ', most useful words first' }

  const firstStory = exp.startLevel >= 3
    ? { title: 'First story', value: 'Unlocks from the words you already know' }
    : { title: 'First story', value: 'The Rainy-Day Noodle Shop · 第一话 — every word at your level' }

  const focus = (purposes || []).length > 0
    ? PURPOSES.filter(p => purposes.includes(p.key)).map(p => p.label).join(' · ')
    : 'A balanced start'

  return [
    start,
    { title: 'Daily training', value: plan.minutes + ' minutes — about ' + plan.words + ' new words a day' },
    firstStory,
    { title: 'Tuned for', value: focus },
  ]
}

// ── The first micro-lesson: 你好 ───────────────────────────────────────────
// One expression, for real. Audio resolves like a flashcard's: the Azure
// neural clip from tts_audio first (vocabId is 你好's row; an anon RLS policy
// makes ready rows readable pre-signup), then the legacy recording, then
// speech synthesis — each strictly a fallback for the one before.
export const FIRST_LESSON = {
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  meaning: 'hello',
  vocabId: '7144c752-7385-4062-91e9-81e27fbeaa50',
  audioPath: 'chinese/hsk_3/level_1/147_ni_hao.mp3',
  parts: '你 is “you”. 好 is “good”. Saying “you good” is how half a billion people say hello every day.',
  // The tiny conversation. 小雨 opens; both replies are the SAME correct
  // answer with different framing, because a brand-new learner knows exactly
  // one expression — asking them to choose between it and a word they have
  // never seen is a trick, not a lesson.
  conversation: {
    prompt: '小雨 waves at you from the dojo door.',
    line: '你好！',
    replies: [
      { text: '你好', note: 'say hello back' },
      { text: '你好！', note: 'with feeling' },
    ],
  },
  done: {
    title: 'First training complete',
    line: 'You learned your first expression. 你好 — you can greet anyone who speaks Chinese.',
  },
}
