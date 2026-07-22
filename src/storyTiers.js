// Story tier definitions (unlock thresholds + labels), shared by the Stories
// screen and the post-study recap's story matcher. Kept in its own tiny module
// so importing the config doesn't drag the heavy Stories/reader chunk into
// other screens.
//
// Two principles govern this file:
//
// 1. **Tier 1 is unlocked from day one (minWords 0)** so a brand-new learner can
//    start reading immediately — every word is tappable and addable to their
//    deck, which is itself a gentle way to learn. The story generator's CONFIGS
//    use 30–40 there; the app deliberately overrides that to 0. Later tiers gate
//    on the learned-word count *for the story's own level*.
//
// 2. **Tiers are keyed by (language, level), not language alone.** One Chinese
//    table used to gate every Chinese level while describing "the first 100 most
//    common HSK 1 words" — wrong copy at HSK 2 and badly wrong once HSK 3–6
//    became reachable. The per-level thresholds/caps below mirror
//    `generate-serial-stories.mjs` CONFIGS (the word ranges the stories were
//    actually written against), with one guardrail: a threshold may never rise
//    for a level that already has published stories, so nobody loses a story
//    they can read today. HSK 1 is unchanged; HSK 2 moves 100/200 → 80/130
//    (strictly more generous). Levels 3–6 are new gates over content that does
//    not exist yet, so the guardrail does not bind there.
//
// Levels with no explicit entry fall back to their language's default table, so
// Japanese and Russian keep exactly their current thresholds.

import { getLevelLabel } from './utils'
import { isLearned } from './mastery'

const TIER_LABELS = { 1: 'First Steps', 2: 'Growing', 3: 'Fluent' }

// Threshold specs: { tier, minWords, cap }. `cap` is the sort_order ceiling the
// tier's stories were written against — it drives the word-range copy only, not
// gating. A null cap means "the whole level".
const CHINESE_DEFAULT = [
  { tier: 1, minWords: 0, cap: 100 },
  { tier: 2, minWords: 100, cap: 200 },
  { tier: 3, minWords: 200, cap: 300 },
]
const CHINESE_HSK_3_TO_6 = [
  { tier: 1, minWords: 0, cap: 170 },
  { tier: 2, minWords: 110, cap: 340 },
  { tier: 3, minWords: 220, cap: 500 },
]
const JAPANESE_DEFAULT = [
  { tier: 1, minWords: 0, cap: 100 },
  { tier: 2, minWords: 100, cap: 200 },
  { tier: 3, minWords: 200, cap: 400 },
]
const RUSSIAN_DEFAULT = [
  { tier: 1, minWords: 0, cap: 50 },
  { tier: 2, minWords: 50, cap: 100 },
  { tier: 3, minWords: 100, cap: null },
]

// language → { system, default, levels }. `system` is only needed so the copy
// can resolve a level label (HSK 3 / N4 / B1) via getLevelLabel.
const TIER_SPECS = {
  chinese: {
    system: 'hsk_3',
    default: CHINESE_DEFAULT,
    levels: {
      1: CHINESE_DEFAULT,
      2: [
        { tier: 1, minWords: 0, cap: 66 },
        { tier: 2, minWords: 80, cap: 132 },
        { tier: 3, minWords: 130, cap: 198 },
      ],
      3: CHINESE_HSK_3_TO_6,
      4: CHINESE_HSK_3_TO_6,
      5: CHINESE_HSK_3_TO_6,
      6: CHINESE_HSK_3_TO_6,
    },
  },
  japanese: { system: 'jlpt', default: JAPANESE_DEFAULT, levels: {} },
  russian: { system: 'russian', default: RUSSIAN_DEFAULT, levels: {} },
}

function describeTier(spec, levelLabel) {
  // No level in hand (the legacy language-only constants): keep the original
  // generic copy so nothing that reads those shifts underfoot.
  if (!levelLabel) {
    if (spec.tier === 1) return 'Short stories from the most common words at your level.'
    if (spec.tier === 2) return 'Stories that bring in more of your level’s vocabulary.'
    return 'Stories that use your level’s full word list.'
  }
  if (spec.cap == null || spec.tier === 3) {
    return 'Stories that use the full ' + levelLabel + ' word list.'
  }
  if (spec.tier === 1) {
    return 'Short stories from the first ' + spec.cap + ' most common ' + levelLabel + ' words.'
  }
  return 'Stories that bring in more ' + levelLabel + ' vocabulary — the first ' + spec.cap + ' words.'
}

function buildTiers(specs, levelLabel) {
  return specs.map(s => ({
    tier: s.tier,
    minWords: s.minWords,
    label: TIER_LABELS[s.tier] || 'Tier ' + s.tier,
    wordRange: s.cap == null ? 'all' : '1–' + s.cap,
    description: describeTier(s, levelLabel),
  }))
}

// Language-only tables. Still exported (Onboarding reads the Chinese tier-2
// threshold; tests read them) and used as the per-language fallback.
export const CATEGORIES_CHINESE = buildTiers(CHINESE_DEFAULT, null)
export const CATEGORIES_JAPANESE = buildTiers(JAPANESE_DEFAULT, null)
export const CATEGORIES_RUSSIAN = buildTiers(RUSSIAN_DEFAULT, null)

export const CATEGORIES_BY_LANGUAGE = {
  chinese: CATEGORIES_CHINESE,
  japanese: CATEGORIES_JAPANESE,
  russian: CATEGORIES_RUSSIAN,
}

// tiersFor(language, level) → the tier list that gates and describes stories at
// that level, with copy naming the level ("the first 170 most common HSK 3
// words"). Falls back to the language's default table for any level with no
// explicit entry, and to Chinese for an unknown language (matching the previous
// `CATEGORIES_BY_LANGUAGE[lang] || CATEGORIES_CHINESE` behavior).
//
// Memoized per (language, level): the Stories screen resolves this inside
// render for every level group, and the result is a stable, frozen-by-contract
// value that callers only read.
const tiersCache = new Map()
export function tiersFor(language, level) {
  const key = language + '|' + level
  const hit = tiersCache.get(key)
  if (hit) return hit
  const spec = TIER_SPECS[language] || TIER_SPECS.chinese
  const specs = (level != null && spec.levels[level]) || spec.default
  const label = level == null ? null : getLevelLabel(language, spec.system, level)
  const built = buildTiers(specs, label)
  tiersCache.set(key, built)
  return built
}

// learnedByLevel(vocabRows, cards) → { [level]: learnedWordCount }.
//
// The cumulative shelf gates each level's stories on that level's own progress,
// so both the Stories screen and the post-study recap need per-level counts from
// the same rule. `vocabRows` need only carry `{ id, level }`; `cards` need
// `{ vocab_id, learned, state }` (whatever `isLearned` reads).
export function learnedByLevel(vocabRows, cards) {
  const levelOf = new Map()
  for (const v of vocabRows || []) if (v && v.level != null) levelOf.set(v.id, v.level)
  const counts = {}
  for (const c of cards || []) {
    if (!isLearned(c)) continue
    const lvl = levelOf.get(c.vocab_id)
    if (lvl == null) continue
    counts[lvl] = (counts[lvl] || 0) + 1
  }
  return counts
}

// storyLevels(stories, currentLevel) → the levels that actually have stories on
// the cumulative shelf, the learner's current level first and the rest
// descending (newest shelf on top, the way progress reads).
//
// Rows above `currentLevel` are ignored so the grouping can never show a level
// the query wouldn't return (a stale offline snapshot, or a track sent back to
// an earlier level). A row with no `level` is treated as the current level.
export function storyLevels(stories, currentLevel) {
  const seen = new Set()
  for (const s of stories || []) {
    if (!s) continue
    const lvl = s.level == null ? currentLevel : s.level
    if (lvl == null) continue
    if (currentLevel != null && lvl > currentLevel) continue
    seen.add(lvl)
  }
  const rest = [...seen].filter(l => l !== currentLevel).sort((a, b) => b - a)
  return seen.has(currentLevel) ? [currentLevel, ...rest] : rest
}

// How many learned words count toward a level's tier gates.
//
// The current level gates on the learner's real progress there. A level they
// have already moved past is treated as complete: either they passed its level
// test (100% correct, 90% mastery) or they were placed above it and its
// vocabulary is assumed known — in both cases its stories should be open, not
// re-locked behind a count they will never rebuild. Levels above the current
// one are never shown at all.
export function readingGateCount({ level, currentLevel, learnedAtLevel, tiers }) {
  const learned = Math.max(0, learnedAtLevel || 0)
  if (level != null && currentLevel != null && level < currentLevel) {
    const top = (tiers || []).reduce((m, t) => Math.max(m, t.minWords || 0), 0)
    return Math.max(learned, top)
  }
  return learned
}

// The next tier the learner hasn't unlocked yet that actually has stories
// waiting, plus how many more learned words unlock it. Pure and tested — the
// reader uses it to turn "you've read everything you can" into a concrete
// "learn N more to unlock the next story" nudge instead of a dead end.
//
// `tiersWithStories` is the set of tier numbers that have published stories, so
// a locked-but-empty tier never becomes a nudge that leads nowhere. Returns null
// when every tier that has stories is already unlocked (nothing left to aim at).
export function nextLockedTier(categories, learnedCount, tiersWithStories) {
  if (!Array.isArray(categories)) return null
  const has = tiersWithStories instanceof Set ? tiersWithStories : new Set(tiersWithStories || [])
  const learned = Math.max(0, learnedCount || 0)
  const locked = categories
    .filter(c => learned < c.minWords && has.has(c.tier))
    .sort((a, b) => a.minWords - b.minWords)
  if (locked.length === 0) return null
  const t = locked[0]
  return {
    tier: t.tier,
    label: t.label,
    wordRange: t.wordRange,
    remaining: Math.max(1, t.minWords - learned),
  }
}
