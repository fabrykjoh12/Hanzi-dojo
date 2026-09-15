// The story generation target — FAB-9 (2026-08-31).
//
// Every generated story gets ONE machine-readable statement of what it is for,
// written before a single token is generated and carried through validation
// unchanged. Without it "did this story do its job?" has no answer that a
// program can give: the serial generator picks its focus words positionally
// (the tier's next slice of sort_order) and then asks a model to score prose,
// so nothing anywhere records WHY those words, or whether they arrived.
//
// A manifest says four things, and they are deliberately separate:
//
//   WHICH WORDS       required[], each with the cohort it was drawn from and
//                     the evidence for choosing it. A required word is a
//                     promise: the validator fails a candidate that drops one,
//                     so the generator cannot quietly write around an awkward
//                     word.
//   HOW OFTEN         minOccurrences per word, and a stuffing ceiling. Presence
//                     alone is a bad target — it is satisfied by a sentence
//                     that names the word once and means nothing — but so is
//                     "as often as possible", which is how you get 我受到了她
//                     的笑容. Both bounds are stated, and both are enforced.
//   WHAT IS ALLOWED   the vocabulary boundary: the band the learner is inside.
//                     Words above it are not forbidden outright (the Reader
//                     lets a learner tap anything) but they are budgeted.
//   WHAT SHAPE        line counts, line length, speakers, title — the format
//                     the existing story rows and the Reader already require.
//
// The selection cohorts answer "why this word", which is the half the old
// pipeline could not express:
//
//   NEWLY_TAUGHT   the learner meets it at this band right now.
//   UNDER_COVERED  taught, but it appears in only one or a few stories the
//                  learner can actually read yet (storyCoverage's `single` and
//                  `weak` buckets over availableByLevel).
//   COVERAGE_GAP   taught and appears in NO story available at its level. The
//                  learner is asked to learn a word the corpus never reinforces.
//   REQUESTED      a human named it. No evidence needed beyond the request.
//
// Pure: no network, no fs, no clock, no LLM. Give it vocabulary rows and a
// coverage report; generate-targeted-stories.mjs is the wrapper that fetches.

export const MANIFEST_SCHEMA = 'fab9-story-target@1'

/** Why a word is in the manifest. Closed set — the validator reports it back. */
export const COHORT = {
  NEWLY_TAUGHT: 'NEWLY_TAUGHT',
  UNDER_COVERED: 'UNDER_COVERED',
  COVERAGE_GAP: 'COVERAGE_GAP',
  REQUESTED: 'REQUESTED',
}

// The tie-break when two words are equally unreinforced. NEED COMES FIRST and
// the cohort only settles ties: an explicit request outranks any measurement,
// then a word taught at the very band being written for, then one the learner
// could already read but no story carries, then ordinary under-coverage.
//
// Ordering by cohort BEFORE exposure was wrong and measured wrong: against the
// real corpus it put a word with four reinforcing stories ahead of one with
// none, because the first happened to be labelled UNDER_COVERED and the second
// NEWLY_TAUGHT. The label describes why a word qualifies; the exposure count is
// how badly it needs a story.
export const COHORT_PRIORITY = [
  COHORT.REQUESTED,
  COHORT.NEWLY_TAUGHT,
  COHORT.COVERAGE_GAP,
  COHORT.UNDER_COVERED,
]

export class ManifestError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ManifestError'
  }
}

// Defaults for the encounter expectations. Two occurrences is the smallest
// number that is evidence of USE rather than mention: a word can be dropped
// into one sentence without the story depending on it, and a learner who meets
// it twice in two different sentences has seen it work.
export const DEFAULT_MIN_OCCURRENCES = 2
// The anti-stuffing ceiling. A required word that appears six times in a
// twenty-line story is no longer a story about anything else.
export const DEFAULT_MAX_OCCURRENCES = 5
// Share of all resolvable tokens that may be required-word occurrences. Above
// this the text reads as a vocabulary drill however natural each sentence is.
export const DEFAULT_MAX_TARGET_SHARE = 0.25

/**
 * Rank the vocabulary by how much a new story would help it.
 *
 * `report` is storyCoverage.buildCoverageReport(...)'s `words` array — the
 * canonical exposure measurement, which counts a word as present only when the
 * Reader's own engine resolves it. Nothing here re-counts anything.
 */
export function classifyNeed(word, { level, newlyTaughtLevel = null } = {}) {
  const avail = (word && word.availableByLevel && word.availableByLevel.stories) || 0
  if (newlyTaughtLevel != null && word.level === newlyTaughtLevel && avail <= 1) {
    // A word taught at the band being written for, with at most one story
    // behind it, is the reason this band's stories exist.
    return { cohort: COHORT.NEWLY_TAUGHT, exposure: avail }
  }
  if (avail === 0) return { cohort: COHORT.COVERAGE_GAP, exposure: 0 }
  if (avail <= 4) return { cohort: COHORT.UNDER_COVERED, exposure: avail }
  return null
}

const whyFor = (cohort, exposure, level) => {
  if (cohort === COHORT.REQUESTED) return 'explicitly requested'
  if (cohort === COHORT.COVERAGE_GAP) {
    return 'no published story at or below HSK ' + level + ' contains it'
  }
  if (cohort === COHORT.UNDER_COVERED) {
    return exposure + ' available-by-level ' + (exposure === 1 ? 'story' : 'stories') + ' reinforce it'
  }
  return 'newly taught at HSK ' + level + ', ' + exposure + ' available ' + (exposure === 1 ? 'story' : 'stories')
}

/**
 * Choose the words one story should carry.
 *
 * Deterministic: same inputs, same order, every time — a batch that reruns
 * must ask for the same thing, or resume would silently retarget.
 */
export function selectTargets({
  words = [],
  level,
  count = 6,
  requested = [],
  cohorts = null,
  exclude = [],
} = {}) {
  if (!Number.isInteger(level)) throw new ManifestError('level must be an integer')
  const wanted = cohorts && cohorts.length ? new Set(cohorts) : null
  const excluded = new Set(exclude)
  const byWord = new Map()
  for (const w of words) if (w && w.word) byWord.set(w.word, w)

  const picked = []
  const seen = new Set()

  // Requested words first, and they are never filtered by cohort or evidence —
  // a request IS the reason. A requested word the vocabulary does not carry is
  // an error, not a silent omission: generating a story for a word the learner
  // can never tap is worse than refusing.
  for (const req of requested) {
    if (seen.has(req)) continue
    const row = byWord.get(req)
    if (!row) throw new ManifestError('requested word is not in the vocabulary: ' + req)
    if (row.level > level) {
      throw new ManifestError('requested word ' + req + ' is HSK ' + row.level + ', above the target band ' + level)
    }
    seen.add(req)
    picked.push({
      word: req,
      level: row.level,
      cohort: COHORT.REQUESTED,
      exposure: (row.availableByLevel && row.availableByLevel.stories) || 0,
      why: whyFor(COHORT.REQUESTED),
    })
  }

  const candidates = []
  for (const w of words) {
    if (!w || !w.word || seen.has(w.word) || excluded.has(w.word)) continue
    if (!Number.isFinite(w.level) || w.level > level) continue
    const need = classifyNeed(w, { level, newlyTaughtLevel: level })
    if (!need) continue
    if (wanted && !wanted.has(need.cohort)) continue
    candidates.push({
      word: w.word,
      level: w.level,
      cohort: need.cohort,
      exposure: need.exposure,
      // Frequency rank, when the caller supplies it. Ties on need are common
      // (hundreds of words share an exposure of 0), and breaking them by
      // frequency is the product's own rule — most useful words first —
      // rather than by whatever the character happens to sort as.
      sortOrder: Number.isFinite(w.sortOrder) ? w.sortOrder : null,
      why: whyFor(need.cohort, need.exposure, w.level),
    })
  }

  // Least-reinforced first, then cohort as the tie-break, then lowest band
  // (the most basic words are the ones a story can actually build around),
  // then the word itself so ties never depend on input order.
  candidates.sort((a, b) => {
    if (a.exposure !== b.exposure) return a.exposure - b.exposure
    const ca = COHORT_PRIORITY.indexOf(a.cohort)
    const cb = COHORT_PRIORITY.indexOf(b.cohort)
    if (ca !== cb) return ca - cb
    if (a.level !== b.level) return a.level - b.level
    const sa = a.sortOrder == null ? Infinity : a.sortOrder
    const sb = b.sortOrder == null ? Infinity : b.sortOrder
    if (sa !== sb) return sa - sb
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
  })

  for (const c of candidates) {
    if (picked.length >= count) break
    picked.push(c)
    seen.add(c.word)
  }
  return picked
}

/**
 * The token budget one candidate is allowed to spend.
 *
 * Derived from the manifest rather than fixed, because a fixed 6000 is what
 * made every draft fail on Groq's 8000-tokens-per-minute tier: prompt plus
 * budget exceeded the window before the model wrote a character. Deriving it
 * from the shape actually asked for keeps the request inside the smallest tier
 * that can serve it.
 */
export function outputBudgetFor({ lines, maxLineChars }) {
  const [, maxLines] = lines
  // ~1.6 tokens per CJK character, plus the title line and format overhead,
  // plus 60% headroom for a model that writes long before it is trimmed.
  const body = Math.ceil(maxLines * maxLineChars * 1.6)
  return Math.max(1200, Math.ceil((body + 200) * 1.6))
}

/**
 * Build the manifest. Everything the generator and the validator need, and
 * nothing either of them has to infer.
 */
export function buildManifest({
  id,
  batch = null,
  language = 'chinese',
  system = 'hsk_3',
  level,
  levelName = null,
  tier = null,
  targets = [],
  poolSize = 0,
  poolSource = null,
  format = {},
  premise = null,
  minOccurrences = DEFAULT_MIN_OCCURRENCES,
  maxOccurrences = DEFAULT_MAX_OCCURRENCES,
  maxTargetShare = DEFAULT_MAX_TARGET_SHARE,
  minCoverage = 0.9,
  maxOutOfBandDistinct = 3,
  maxOutOfBandOccurrences = 6,
} = {}) {
  if (!id || typeof id !== 'string') throw new ManifestError('id is required')
  if (!Number.isInteger(level)) throw new ManifestError('level must be an integer')
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new ManifestError('a manifest with no required words targets nothing')
  }
  const lines = format.lines || [18, 26]
  const maxLineChars = format.maxLineChars || 34
  const manifest = {
    schema: MANIFEST_SCHEMA,
    id,
    batch,
    language,
    system,
    level,
    levelName: levelName || ('HSK ' + level),
    tier,
    // The promise. Order is the selection order, so a reader of the file can
    // see what the pipeline thought mattered most.
    required: targets.map(t => ({
      word: t.word,
      reading: t.reading || null,
      meaning: t.meaning || null,
      level: t.level,
      cohort: t.cohort,
      why: t.why,
      minOccurrences: t.minOccurrences || minOccurrences,
    })),
    allowedVocabulary: {
      maxLevel: level,
      size: poolSize,
      source: poolSource,
    },
    limits: {
      lines,
      maxLineChars,
      minCoverage,
      maxOutOfBandDistinct,
      maxOutOfBandOccurrences,
      maxOccurrencesPerTarget: maxOccurrences,
      maxTargetShare,
    },
    format: {
      speakers: format.speakers || [],
      colon: format.colon || '：',
      titleChars: format.titleChars || [1, 12],
    },
    premise,
    outputBudget: outputBudgetFor({ lines, maxLineChars }),
  }
  validateManifest(manifest)
  return manifest
}

/**
 * Fail closed on a manifest that cannot mean what it says.
 *
 * The generator and the validator both read this file; a malformed one would
 * otherwise produce a candidate judged against limits nobody set.
 */
export function validateManifest(m, { source = 'the manifest' } = {}) {
  const fail = (why) => { throw new ManifestError(source + ': ' + why) }
  if (!m || typeof m !== 'object' || Array.isArray(m)) fail('is not an object')
  if (m.schema !== MANIFEST_SCHEMA) {
    fail('schema is ' + JSON.stringify(m.schema) + ', expected ' + JSON.stringify(MANIFEST_SCHEMA))
  }
  if (!m.id || typeof m.id !== 'string') fail('id must be a non-empty string')
  if (!Number.isInteger(m.level)) fail('level must be an integer')
  if (!Array.isArray(m.required) || m.required.length === 0) fail('required must be a non-empty array')

  const seen = new Set()
  const cohorts = new Set(Object.values(COHORT))
  for (const t of m.required) {
    if (!t || typeof t.word !== 'string' || !t.word) fail('a required entry has no word')
    if (seen.has(t.word)) fail('required word ' + t.word + ' appears twice')
    seen.add(t.word)
    if (!cohorts.has(t.cohort)) {
      fail('required word ' + t.word + ' has unknown cohort ' + JSON.stringify(t.cohort))
    }
    if (typeof t.why !== 'string' || !t.why.trim()) {
      fail('required word ' + t.word + ' records no reason for being selected')
    }
    if (!Number.isInteger(t.minOccurrences) || t.minOccurrences < 1) {
      fail('required word ' + t.word + ' has a non-positive minOccurrences')
    }
    if (Number.isFinite(t.level) && t.level > m.level) {
      fail('required word ' + t.word + ' is HSK ' + t.level + ', above the target band ' + m.level)
    }
  }

  const lim = m.limits
  if (!lim || typeof lim !== 'object') fail('limits is missing')
  if (!Array.isArray(lim.lines) || lim.lines.length !== 2
    || !Number.isInteger(lim.lines[0]) || !Number.isInteger(lim.lines[1])
    || lim.lines[0] > lim.lines[1] || lim.lines[0] < 1) {
    fail('limits.lines must be [min, max] integers with min <= max')
  }
  if (!Number.isInteger(lim.maxLineChars) || lim.maxLineChars < 1) fail('limits.maxLineChars must be a positive integer')
  if (!(lim.minCoverage > 0 && lim.minCoverage <= 1)) fail('limits.minCoverage must be in (0, 1]')
  if (!Number.isInteger(lim.maxOutOfBandDistinct) || lim.maxOutOfBandDistinct < 0) {
    fail('limits.maxOutOfBandDistinct must be a non-negative integer')
  }
  if (!Number.isInteger(lim.maxOccurrencesPerTarget) || lim.maxOccurrencesPerTarget < 1) {
    fail('limits.maxOccurrencesPerTarget must be a positive integer')
  }
  // The two encounter bounds must be able to hold at once, or every candidate
  // fails whatever it does.
  for (const t of m.required) {
    if (t.minOccurrences > lim.maxOccurrencesPerTarget) {
      fail('required word ' + t.word + ' asks for at least ' + t.minOccurrences +
        ' occurrences but the stuffing ceiling is ' + lim.maxOccurrencesPerTarget +
        ' — no candidate could satisfy both')
    }
  }
  if (!(lim.maxTargetShare > 0 && lim.maxTargetShare <= 1)) fail('limits.maxTargetShare must be in (0, 1]')
  if (!m.allowedVocabulary || !Number.isInteger(m.allowedVocabulary.maxLevel)) {
    fail('allowedVocabulary.maxLevel must be an integer')
  }
  if (m.allowedVocabulary.maxLevel < m.level) {
    fail('allowedVocabulary.maxLevel (' + m.allowedVocabulary.maxLevel +
      ') is below the target band (' + m.level + '), so the band\'s own words are out of bounds')
  }
  return m
}

/** A stable, human-readable manifest id. Same inputs → same id. */
export function manifestId({ level, index, targets = [] }) {
  const head = targets.slice(0, 3).map(t => (typeof t === 'string' ? t : t.word)).join('')
  return 'hsk' + level + '-' + String(index).padStart(2, '0') + (head ? '-' + head : '')
}
