// Per-language story configuration — the character bibles and the per-level,
// per-tier targets (vocabulary caps, chapter counts, line ranges, coverage
// thresholds) that define what "correct for this level" means.
//
// Pure data, in its own module because two very different things need it: the
// LLM generator, and the offline checker that validates hand-authored stories.
// When these numbers lived inside the generator, the only way to know whether
// an authored chapter met HSK 4's bar was to run the generator — which needs
// Supabase credentials and an LLM key to even start.

// ── Character bibles ─────────────────────────────────────────────────────────
// Recurring characters with actual personalities and speech habits — the thing
// the old generator never had. Chinese names must stay within the reader's
// CHARACTER_READINGS map (src/characterNames.js) so name-taps keep working.

export const BIBLE_CHINESE = {
  speakers: ['李明', '小红', '小明', '妈妈'],
  // What each character is called in an ENGLISH document. The names with a
  // pinyin form are read out of the text below; 妈妈 has none, so an English
  // plan calls her "Mom" and the validator refused her as a stranger to her
  // own cast (a32-fresh-2 lost a shape to exactly that). This is the story
  // bible completing its own cast list, not a vocabulary mapping.
  aliases: { 妈妈: ['mom', 'mother', 'mama'] },
  text:
    '- 李明 (Lǐ Míng): a curious, slightly impulsive 12-year-old boy. Always hungry. Speaks in short, eager sentences and asks a lot of questions.\n' +
    '- 小红 (Xiǎo Hóng): his classmate. Sharp-eyed and quick — she notices what others miss, and teases 李明, but is kind underneath.\n' +
    '- 小明 (Xiǎo Míng): 李明\'s best friend. Easygoing, a little lazy, loyal.\n' +
    '- 妈妈: 李明\'s mother. Patient, practical, gently firm.\n' +
    '- 大毛 (Dà Máo): a white neighborhood cat. Does not talk, but keeps appearing where things happen.',
}

export const BIBLE_JAPANESE = {
  speakers: ['たかし', 'はな', 'おかあさん', 'おじいさん'],
  text:
    '- たかし (Takashi): a shy, careful boy who loves trains and notices small details. Speaks briefly and politely.\n' +
    '- はな (Hana): his classmate. Energetic, always hungry, speaks fast and decides fast.\n' +
    '- おかあさん (Mother): kind but busy; keeps everyone on schedule.\n' +
    '- おじいさん (an elderly neighbor): grows vegetables, walks slowly, knows everything about the town.',
}

export const BIBLE_RUSSIAN = {
  speakers: ['Иван', 'Аня', 'мама', 'бабушка'],
  text:
    '- Иван (Ivan): a friendly student who loves sport and is always a little late.\n' +
    '- Аня (Anya): his friend. Loves music, very organized, mildly exasperated by Иван.\n' +
    '- мама: Ivan\'s mother. Warm and practical.\n' +
    '- бабушка: the grandmother. Bakes constantly, speaks in short warm sentences, always right.',
}

// Per-tier premise seeds so re-runs and tiers don't converge on the same plot.
// --season-offset N rotates which seed each tier draws, so an APPEND run (no
// --replace) gets different season shapes than the level's existing seasons.
export const SEASON_SEEDS = [
  'a small neighborhood mystery (something goes missing or keeps happening) that resolves warmly',
  'preparing for something over several days (a trip, a festival, a small competition) with setbacks',
  'a bigger outing or adventure away from home with a genuine surprise in the middle',
  'a new friend or visitor arrives and daily life is a little different for a while',
  'secretly helping someone prepare a surprise without them finding out',
  'the characters take on a small job or responsibility for the first time and almost mess it up',
  'a plan for the day keeps going wrong in small ways until an accident turns out better than the plan',
  'the characters look after an animal that is not theirs and grow attached to it',
  'something old is found (a photo, a letter, a broken object) and the characters piece together its story',
  'two of the characters disagree about something small, avoid each other, and find their way back',
  'the weather changes everything for a few days and the characters have to rearrange their lives around it',
  'a competition or test the characters have been dreading, and what actually happens on the day',
  'the characters try to make or cook something difficult and fail repeatedly before getting it right',
  'a day when nothing goes to schedule: a missed bus, a wrong turn, an unfamiliar part of town',
  'someone is leaving soon and the characters quietly prepare a send-off',
  'the characters trade places or swap responsibilities for a few days and see the other side',
  'a small business or stall nearby is in trouble and the characters decide to help it',
  'the characters keep noticing the same stranger, animal or object around town and finally learn why',
]

// ── Per-target config ─────────────────────────────────────────────────────────
// Tier caps mirror the old generator so tier gating (tier_min_words) and level
// pools stay consistent. maxLineChars is a SOFT target now — the reader wraps
// text fine and choppy 15-char baby prose was a big part of why stories read
// badly. Only egregiously long lines (2x) get flagged for revision.
//
// Per-tier knobs for "longer + richer" (user request):
//   lines      target line count — bumped ~50% so chapters read like real scenes
//   minCov     min in-pool vocabulary coverage. GRADUATED: rank beginners
//              (tier 1) need near-full comprehension; by tier 3 the reader can
//              handle a few reach words, which surface as tappable "new words".
//   maxMisses  cap on DISTINCT out-of-pool words — lets a chapter reach for a
//              handful of vivid words without turning into a word salad.

export const CONFIGS = {
  'chinese|hsk_3|1': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 1',
    maxLineChars: 30, prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, minWords: 0, prevCap: 0, cap: 100, chapters: 6, lines: [18, 26], minCov: 0.85, maxMisses: 10 },
      { tier: 2, minWords: 100, prevCap: 100, cap: 200, chapters: 6, lines: [24, 34], minCov: 0.85, maxMisses: 12 },
      { tier: 3, minWords: 200, prevCap: 200, cap: 300, chapters: 6, lines: [30, 42], minCov: 0.83, maxMisses: 14 },
    ],
  },
  'chinese|hsk_3|2': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 2',
    maxLineChars: 32, prereqLevel: 1, prereqMax: 150,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 66, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 6 },
      { tier: 2, minWords: 80, prevCap: 66, cap: 132, chapters: 5, lines: [24, 34], minCov: 0.88, maxMisses: 9 },
      { tier: 3, minWords: 130, prevCap: 132, cap: 198, chapters: 5, lines: [30, 42], minCov: 0.85, maxMisses: 12 },
    ],
  },
  // HSK 3-6: seeded from the reference dictionary (frequency-capped ~460-480
  // words/level, sort_order 1..~500 after cleanup). tier-3 cap 500 captures the
  // whole level; coverage gates loosen a touch as the vocabulary gets harder.
  'chinese|hsk_3|3': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 3',
    maxLineChars: 34, prereqLevel: 2, prereqMax: 200,
    tiers: [
      { tier: 1, minWords: 40, prevCap: 0, cap: 170, chapters: 5, lines: [20, 28], minCov: 0.88, maxMisses: 8 },
      { tier: 2, minWords: 110, prevCap: 170, cap: 340, chapters: 5, lines: [26, 36], minCov: 0.86, maxMisses: 11 },
      { tier: 3, minWords: 220, prevCap: 340, cap: 500, chapters: 5, lines: [32, 44], minCov: 0.84, maxMisses: 14 },
    ],
  },
  'chinese|hsk_3|4': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 4',
    maxLineChars: 36, prereqLevel: 3, prereqMax: 300,
    tiers: [
      { tier: 1, minWords: 40, prevCap: 0, cap: 170, chapters: 5, lines: [20, 28], minCov: 0.88, maxMisses: 8 },
      { tier: 2, minWords: 110, prevCap: 170, cap: 340, chapters: 5, lines: [26, 36], minCov: 0.86, maxMisses: 11 },
      { tier: 3, minWords: 220, prevCap: 340, cap: 500, chapters: 5, lines: [32, 44], minCov: 0.84, maxMisses: 14 },
    ],
  },
  'chinese|hsk_3|5': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 5',
    maxLineChars: 38, prereqLevel: 4, prereqMax: 300,
    tiers: [
      { tier: 1, minWords: 40, prevCap: 0, cap: 170, chapters: 5, lines: [20, 28], minCov: 0.87, maxMisses: 9 },
      { tier: 2, minWords: 110, prevCap: 170, cap: 340, chapters: 5, lines: [26, 36], minCov: 0.85, maxMisses: 12 },
      { tier: 3, minWords: 220, prevCap: 340, cap: 500, chapters: 5, lines: [32, 44], minCov: 0.83, maxMisses: 15 },
    ],
  },
  'chinese|hsk_3|6': {
    bible: BIBLE_CHINESE, promptLang: 'Chinese', levelName: 'HSK 6',
    maxLineChars: 40, prereqLevel: 5, prereqMax: 300,
    tiers: [
      { tier: 1, minWords: 40, prevCap: 0, cap: 170, chapters: 5, lines: [20, 28], minCov: 0.87, maxMisses: 9 },
      { tier: 2, minWords: 110, prevCap: 170, cap: 340, chapters: 5, lines: [26, 36], minCov: 0.85, maxMisses: 12 },
      { tier: 3, minWords: 220, prevCap: 340, cap: 500, chapters: 5, lines: [32, 44], minCov: 0.83, maxMisses: 15 },
    ],
  },
  'japanese|jlpt|1': {
    // N5 stories use kanji (with furigana in the reader) so they match the
    // kanji-keyed vocabulary and words stay tappable — a kana-only story fails
    // both (looks wrong, and can't be looked up). Was kanaOnly: true.
    bible: BIBLE_JAPANESE, promptLang: 'Japanese', levelName: 'JLPT N5',
    maxLineChars: 36, prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 100, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 6 },
      { tier: 2, minWords: 100, prevCap: 100, cap: 200, chapters: 5, lines: [24, 34], minCov: 0.88, maxMisses: 9 },
      { tier: 3, minWords: 200, prevCap: 200, cap: 400, chapters: 5, lines: [30, 42], minCov: 0.85, maxMisses: 12 },
    ],
  },
  'japanese|jlpt|2': {
    // N5 Part 2 — same difficulty band as Part 1, so the same line targets and
    // coverage knobs; the basics of Part 1 ride along as prereq vocabulary.
    bible: BIBLE_JAPANESE, promptLang: 'Japanese', levelName: 'JLPT N5 (Part 2)',
    maxLineChars: 36, prereqLevel: 1, prereqMax: 150,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 134, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 6 },
      { tier: 2, minWords: 100, prevCap: 134, cap: 268, chapters: 5, lines: [24, 34], minCov: 0.88, maxMisses: 9 },
      { tier: 3, minWords: 200, prevCap: 268, cap: 402, chapters: 5, lines: [30, 42], minCov: 0.85, maxMisses: 12 },
    ],
  },
  'japanese|jlpt|3': {
    bible: BIBLE_JAPANESE, promptLang: 'Japanese', levelName: 'JLPT N4',
    maxLineChars: 40, prereqLevel: 1, prereqMax: 150,
    tiers: [
      { tier: 1, minWords: 30, prevCap: 0, cap: 200, chapters: 5, lines: [18, 26], minCov: 0.90, maxMisses: 7 },
      { tier: 2, minWords: 150, prevCap: 200, cap: 400, chapters: 5, lines: [24, 34], minCov: 0.87, maxMisses: 10 },
      { tier: 3, minWords: 300, prevCap: 400, cap: 636, chapters: 5, lines: [30, 42], minCov: 0.84, maxMisses: 14 },
    ],
  },
  'russian|russian|1': {
    bible: BIBLE_RUSSIAN, promptLang: 'Russian', levelName: 'CEFR A1',
    colon: ':', maxLineChars: 70, prereqLevel: null, prereqMax: 0,
    tiers: [
      { tier: 1, minWords: 15, prevCap: 0, cap: 50, chapters: 4, lines: [16, 24], minCov: 0.88, maxMisses: 8 },
      { tier: 2, minWords: 40, prevCap: 50, cap: 100, chapters: 4, lines: [20, 30], minCov: 0.86, maxMisses: 11 },
      { tier: 3, minWords: 80, prevCap: 100, cap: 147, chapters: 4, lines: [26, 38], minCov: 0.83, maxMisses: 14 },
    ],
  },
}

export function levelConfig(language, system, level) {
  return CONFIGS[language + '|' + system + '|' + level] || null
}
