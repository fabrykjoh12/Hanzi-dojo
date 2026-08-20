// Story corpus vocabulary coverage — the measurement half of the Story
// Learning System work (pre-FAB-8/FAB-9 baseline).
//
// Answers, for every taught vocabulary item: which published stories contain
// it, how many times, and — the number that actually matters to a learner —
// how much of that exposure is AVAILABLE at the point the word is taught
// (story level <= vocab level). An HSK 1 word that only ever appears in an
// HSK 5 story is unreinforced for the HSK 1 learner who just met it, however
// healthy its corpus-wide count looks.
//
// "Contains the word" is deliberately NOT defined here. The one canonical
// definition lives in src/storyReading.js — calculateStoryReadability, the
// same greedy longest-match + zh atomic-span engine the reader renders with —
// so a word this audit counts is exactly a word the reader would highlight.
// No second tokenizer: if the reader wouldn't count 太 inside 太阳, neither
// does the audit.
//
// Pure: no Supabase, no network, no clock. Give it story rows and vocab rows;
// audit-story-coverage.mjs is the fetch-and-print wrapper.

import { calculateStoryReadability } from './src/storyReading.js'

// Exposure buckets over UNIQUE-story counts. The headline classification uses
// available-by-level exposure; the same buckets over corpus-wide exposure are
// kept for diagnostics.
export const EXPOSURE_BUCKETS = ['zero', 'single', 'weak', 'well']
export function classifyExposure(uniqueStories) {
  if (uniqueStories <= 0) return 'zero'
  if (uniqueStories === 1) return 'single'
  if (uniqueStories <= 4) return 'weak'
  return 'well'
}

// The published Chinese corpus, and nothing else. Held rows, other languages
// and rows with no content never enter the audit.
export function publishedChineseStories(rows) {
  return (rows || []).filter(s =>
    s && s.language === 'chinese' && s.is_published === true && String(s.content || '').trim() !== ''
  )
}

// Word-keyed map over the FULL active pool — the corpus-level equivalent of
// the reader's learner-capped map. Duplicate words (none exist in production
// today) are surfaced rather than silently last-write-wins.
export function buildVocabIndex(vocabRows) {
  const vocabMap = {}
  const duplicates = []
  for (const v of vocabRows || []) {
    if (!v || !v.word) continue
    if (vocabMap[v.word]) duplicates.push(v.word)
    else vocabMap[v.word] = v
  }
  return { vocabMap, duplicates }
}

// One story's vocabulary content, straight from the canonical engine:
// Map word → occurrence count (occurrences within the story, duplicates
// counted; a word present maps to >= 1).
export function analyzeStoryCoverage(story, vocabMap) {
  const { counts } = calculateStoryReadability({
    content: story.content,
    vocabMap,
    cards: {},
    language: 'chinese',
  })
  return counts
}

// Median of a numeric array (average of the two middles for even length).
export function median(values) {
  const v = [...values].sort((a, b) => a - b)
  if (!v.length) return 0
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0)

// Bucket counts + mean/median over a list of unique-story exposure numbers.
function exposureStats(uniqueCounts) {
  const buckets = { zero: 0, single: 0, weak: 0, well: 0 }
  let sum = 0
  for (const n of uniqueCounts) {
    buckets[classifyExposure(n)] += 1
    sum += n
  }
  const total = uniqueCounts.length
  return {
    ...buckets,
    pctZero: pct(buckets.zero, total),
    pctSingle: pct(buckets.single, total),
    pctWeak: pct(buckets.weak, total),
    pctWell: pct(buckets.well, total),
    mean: total ? Math.round((sum / total) * 100) / 100 : 0,
    median: median(uniqueCounts),
  }
}

// The full report. `stories` must already be the published corpus
// (publishedChineseStories); `vocab` is the active pool.
export function buildCoverageReport({ stories, vocab }) {
  const { vocabMap, duplicates } = buildVocabIndex(vocab)

  // One pass per story with the full pool; every per-scope number below is a
  // re-slice of these counts, so all scopes agree by construction.
  const perStory = stories.map(story => ({
    story,
    counts: analyzeStoryCoverage(story, vocabMap),
  }))

  const storiesPerLevel = {}
  for (const s of stories) storiesPerLevel[s.level] = (storiesPerLevel[s.level] || 0) + 1

  const words = (vocab || []).map(v => {
    // Production data holds a few active rows with NULL level (dictionary-seed
    // strays). They can't anchor a level-relative metric, so their level-scoped
    // counts stay zero and they are excluded from the level aggregates below —
    // but they are still reported, not hidden.
    const hasLevel = Number.isFinite(v.level)
    const hits = []                // { id, title, level, occurrences }
    const levelDist = {}
    let sameStories = 0, sameOcc = 0
    let availStories = 0, availOcc = 0
    let allStories = 0, allOcc = 0
    for (const { story, counts } of perStory) {
      const n = counts.get(v.word) || 0
      if (!n) continue
      hits.push({ id: story.id, title: story.title, level: story.level, occurrences: n })
      levelDist[story.level] = (levelDist[story.level] || 0) + 1
      allStories += 1; allOcc += n
      if (hasLevel && story.level <= v.level) { availStories += 1; availOcc += n }
      if (hasLevel && story.level === v.level) { sameStories += 1; sameOcc += n }
    }
    return {
      id: v.id,
      word: v.word,
      level: v.level,
      sameLevel: { stories: sameStories, occurrences: sameOcc },
      availableByLevel: { stories: availStories, occurrences: availOcc },
      all: { stories: allStories, occurrences: allOcc },
      levelDist,
      classification: classifyExposure(availStories),
      stories: hits,
    }
  })

  // Aggregates per vocab level, and the two bands: HSK 1–6 is the primary
  // report (the published corpus ends at level 6); HSK 7–9 currently has no
  // story corpus at its own level, so it is reported apart rather than
  // letting its structural zeros distort the headline numbers.
  const byVocabLevel = []
  const levels = [...new Set((vocab || []).map(v => v.level).filter(Number.isFinite))].sort((a, b) => a - b)
  for (const level of levels) {
    const group = words.filter(w => w.level === level)
    byVocabLevel.push({
      vocabLevel: level,
      totalItems: group.length,
      storiesAtLevel: storiesPerLevel[level] || 0,
      storiesAvailable: stories.filter(s => s.level <= level).length,
      availableByLevel: exposureStats(group.map(w => w.availableByLevel.stories)),
      all: exposureStats(group.map(w => w.all.stories)),
    })
  }

  const band = (name, min, max, noStoryCorpus) => {
    const group = words.filter(w => w.level >= min && w.level <= max)
    return {
      name,
      levels: levels.filter(l => l >= min && l <= max),
      noStoryCorpus,
      totalItems: group.length,
      availableByLevel: exposureStats(group.map(w => w.availableByLevel.stories)),
      all: exposureStats(group.map(w => w.all.stories)),
    }
  }

  return {
    corpus: {
      publishedStories: stories.length,
      storiesPerLevel,
      vocabItems: (vocab || []).length,
      duplicateWords: duplicates,
      unleveledWords: (vocab || []).filter(v => !Number.isFinite(v.level)).map(v => ({ id: v.id, word: v.word })),
    },
    bands: {
      hsk1to6: band('HSK 1–6', 1, 6, false),
      hsk7to9: band('HSK 7–9', 7, 9, true),
    },
    byVocabLevel,
    words,
  }
}
