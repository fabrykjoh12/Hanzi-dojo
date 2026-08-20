// Manifest planner — the "how do chosen targets become individual stories"
// half of targeted generation (FAB-9). The coverage planner
// (storyCoveragePlanner.mjs) decides WHICH words need reinforcement; this
// module composes them into structured story manifests: the machine-readable
// spec that the generator writes against and the validator (FAB-10) enforces.
//
// Grouping is deterministic (priority order, fixed chunk size, rotating season
// seeds). Semantic/theme compatibility is a pluggable step: composeManifests
// accepts an async `themePlanner` which may name a theme for a group and
// exclude words it judges incompatible (they return to the pool for later
// manifests). An LLM can sit behind that hook later — but nothing the planner
// says is trusted: every candidate still faces the deterministic validator.
//
// Defaults are PROVISIONAL, derived from the corpus calibration — the evidence
// lives in docs/audits/story-defaults-calibration.json (regenerate with
// calibrate-story-defaults.mjs). Revisit after the first pilot.
//
// Pure: no I/O, no clock, no Supabase.

import { SEASON_SEEDS, BIBLE_CHINESE, levelConfig } from './storyLevels.mjs'

export const MANIFEST_SCHEMA = 'story-manifest@1'

// From docs/audits/story-defaults-calibration.json (2026-08-20 run over the
// 204-story corpus). targetsPerStory for HSK 3-6 uses the healthy-corpus
// reference payload, NOT those levels' own degenerate medians — see
// proposeDefaults in storyCorpusCalibration.mjs for the full reasoning.
export const MANIFEST_DEFAULTS = {
  1: { targetsPerStory: 12, occurrences: { min: 2, max: 5 }, maxOutOfLevelDistinct: 4, maxOutOfLevelCharShare: 0.08, maxUnknownDistinct: 2, maxUnknownCharShare: 0.02, lines: [18, 40], maxRepeatedTrigramShare: 0.24 },
  2: { targetsPerStory: 8, occurrences: { min: 2, max: 4 }, maxOutOfLevelDistinct: 9, maxOutOfLevelCharShare: 0.12, maxUnknownDistinct: 2, maxUnknownCharShare: 0.03, lines: [14, 42], maxRepeatedTrigramShare: 0.195 },
  3: { targetsPerStory: 8, occurrences: { min: 2, max: 4 }, maxOutOfLevelDistinct: 3, maxOutOfLevelCharShare: 0.07, maxUnknownDistinct: 2, maxUnknownCharShare: 0.07, lines: [14, 38], maxRepeatedTrigramShare: 0.165 },
  4: { targetsPerStory: 8, occurrences: { min: 2, max: 4 }, maxOutOfLevelDistinct: 3, maxOutOfLevelCharShare: 0.02, maxUnknownDistinct: 4, maxUnknownCharShare: 0.04, lines: [27, 38], maxRepeatedTrigramShare: 0.09 },
  5: { targetsPerStory: 8, occurrences: { min: 2, max: 4 }, maxOutOfLevelDistinct: 2, maxOutOfLevelCharShare: 0.02, maxUnknownDistinct: 6, maxUnknownCharShare: 0.04, lines: [26, 37], maxRepeatedTrigramShare: 0.075 },
  6: { targetsPerStory: 8, occurrences: { min: 2, max: 4 }, maxOutOfLevelDistinct: 2, maxOutOfLevelCharShare: 0.02, maxUnknownDistinct: 6, maxUnknownCharShare: 0.04, lines: [26, 37], maxRepeatedTrigramShare: 0.09 },
}

// Near-duplicate thresholds (validator config, shared here so one table rules
// the batch): WARN just under the most similar legitimate pair in the corpus
// (0.338 jaccard / 0.649 containment — two same-format chat stories), FAIL far
// above anything legitimate. Evidence in the calibration JSON.
export const NEAR_DUPLICATE_THRESHOLDS = {
  warn: { jaccard: 0.3, containment: 0.6 },
  fail: { jaccard: 0.55, containment: 0.85 },
}

export function manifestDefaults(level) {
  return MANIFEST_DEFAULTS[level] || MANIFEST_DEFAULTS[3]
}

// Build one manifest. `targets` may be plain words (defaults fill the
// occurrence bounds) or { word, min, max } objects.
export function buildManifest({
  batchId,
  seq,
  level,
  targets,
  language = 'chinese',
  system = 'hsk_3',
  defaults,
  theme = null,
  seasonSeed = null,
  series = null,
  forbidden = null,
  presentation = 'paced',
  speakers,
  extraNames,
} = {}) {
  const d = { ...manifestDefaults(level), ...(defaults || {}) }
  const cfg = levelConfig(language, system, level)
  return {
    schema: MANIFEST_SCHEMA,
    id: String(batchId) + '-L' + level + '-' + String(seq).padStart(3, '0'),
    batchId,
    language,
    system,
    level,
    presentation,
    targets: (targets || []).map(t => (typeof t === 'string'
      ? { word: t, min: d.occurrences.min, max: d.occurrences.max }
      : { word: t.word, min: t.min != null ? t.min : d.occurrences.min, max: t.max != null ? t.max : d.occurrences.max })),
    difficulty: {
      maxOutOfLevelDistinct: d.maxOutOfLevelDistinct,
      maxOutOfLevelCharShare: d.maxOutOfLevelCharShare,
      maxUnknownDistinct: d.maxUnknownDistinct,
      maxUnknownCharShare: d.maxUnknownCharShare,
    },
    length: {
      minLines: d.lines[0],
      maxLines: d.lines[1],
      maxLineChars: (cfg && cfg.maxLineChars) || 36,
    },
    quality: {
      maxRepeatedTrigramShare: d.maxRepeatedTrigramShare,
      nearDuplicate: NEAR_DUPLICATE_THRESHOLDS,
    },
    speakers: speakers || BIBLE_CHINESE.speakers,
    extraNames: extraNames || (language === 'chinese' ? ['大毛'] : []),
    theme,
    seasonSeed,
    series,
    forbidden: forbidden || { words: [], topics: [] },
  }
}

// Manifest sanity — the generator and validator refuse to run on a manifest
// that fails this, so a malformed batch dies before any tokens are spent.
export function validateManifest(m) {
  const problems = []
  if (!m || typeof m !== 'object') return { ok: false, problems: ['not an object'] }
  if (m.schema !== MANIFEST_SCHEMA) problems.push('unknown schema: ' + m.schema)
  if (!m.id) problems.push('missing id')
  if (m.language !== 'chinese') problems.push('unsupported language: ' + m.language)
  if (!Number.isFinite(m.level) || m.level < 1 || m.level > 9) problems.push('invalid level: ' + m.level)
  if (!Array.isArray(m.targets) || m.targets.length === 0) problems.push('no targets')
  else {
    const seen = new Set()
    for (const t of m.targets) {
      if (!t || !t.word) { problems.push('target without word'); continue }
      if (seen.has(t.word)) problems.push('duplicate target: ' + t.word)
      seen.add(t.word)
      if (!(t.min >= 1)) problems.push('target ' + t.word + ': min must be >= 1')
      if (!(t.max >= t.min)) problems.push('target ' + t.word + ': max < min')
    }
    if ((m.forbidden && m.forbidden.words || []).some(w => seen.has(w))) {
      problems.push('a word is both target and forbidden')
    }
  }
  if (!m.length || !(m.length.minLines >= 4) || !(m.length.maxLines > m.length.minLines)) {
    problems.push('invalid length bounds')
  }
  if (!m.difficulty) problems.push('missing difficulty bounds')
  if (!Array.isArray(m.speakers) || m.speakers.length === 0) problems.push('no speakers')
  return { ok: problems.length === 0, problems }
}

// Compose manifests for a batch: pull targets from the coverage plan in
// priority order, chunk them, let the (optional) theme planner name a theme
// and bounce incompatible words back to the pool, and emit validated
// manifests. Deterministic when no themePlanner is given: themes rotate
// through SEASON_SEEDS from `seedOffset`.
//
// `selectTargets` comes from storyCoveragePlanner — passed in rather than
// imported so tests can drive composition with a stub plan.
export async function composeManifests({
  batchId,
  level,
  plan,
  select,                      // (plan, count) => ({ plan, selected }) — storyCoveragePlanner.selectTargets
  count,                       // manifests to compose
  defaults,
  seedOffset = 0,
  themePlanner = null,         // optional async ({ level, targets: [{word, meaning?}], theme }) => { theme?, exclude?: [word] }
  meanings = {},               // word → meaning, for the theme planner and prompts
} = {}) {
  const d = { ...manifestDefaults(level), ...(defaults || {}) }
  const manifests = []
  let currentPlan = plan
  let leftovers = []
  for (let seq = 1; seq <= count; seq += 1) {
    let group = leftovers.splice(0, d.targetsPerStory)
    if (group.length < d.targetsPerStory) {
      const take = d.targetsPerStory - group.length
      const res = select(currentPlan, take, new Set(group))
      currentPlan = res.plan
      group = group.concat(res.selected)
    }
    if (group.length === 0) break

    const seasonSeed = SEASON_SEEDS[(seq - 1 + seedOffset) % SEASON_SEEDS.length]
    let theme = null
    if (themePlanner) {
      const advice = await themePlanner({
        level,
        targets: group.map(w => ({ word: w, meaning: meanings[w] || null })),
        seasonSeed,
      })
      if (advice && typeof advice === 'object') {
        if (typeof advice.theme === 'string' && advice.theme.trim()) theme = advice.theme.trim()
        const excluded = Array.isArray(advice.exclude) ? advice.exclude.filter(w => group.includes(w)) : []
        // The planner advises, it does not starve a manifest: at most half the
        // group may be bounced, and bounced words go back to the FRONT of the
        // pool so they land in the very next manifest.
        const allowed = excluded.slice(0, Math.floor(group.length / 2))
        if (allowed.length) {
          group = group.filter(w => !allowed.includes(w))
          leftovers = allowed.concat(leftovers)
        }
      }
    }

    const manifest = buildManifest({ batchId, seq, level, targets: group, defaults: d, theme, seasonSeed })
    const check = validateManifest(manifest)
    if (!check.ok) throw new Error('composed an invalid manifest (' + manifest.id + '): ' + check.problems.join('; '))
    manifests.push(manifest)
  }
  return { manifests, plan: currentPlan, leftovers }
}
