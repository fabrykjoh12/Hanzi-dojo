// Target suitability — the layer between "this word has zero story exposure"
// and "require it 2-4 times in a story" (FAB-9).
//
//   coverage gap → target suitability → semantic grouping → story manifest
//
// The duo-1 pilot showed the coverage planner treating 中, 被, 该, 或 exactly
// like 机场 or 护照. They are not the same kind of target. The vocabulary
// table has no POS column, so classification is built from two reproducible
// signals present in the real data (inspected 2026-08-21):
//
//   1. WORD FORM. Single-character items at a level are dominated by grammar
//      markers, bound morphemes and polysemous heads — and their CC-CEDICT
//      glosses frequently describe a different sense than the one the level
//      teaches (被 "quilt; to cover" for the passive marker; 中 "China";
//      刚 "hard; firm"; 加 "Canada; surname Jia"). There is a second,
//      mechanical reason they make bad occurrence targets: the canonical
//      matcher is greedy-longest, so a single character inside any compound
//      (中 in 中文, 中间, 中学…) does not count as the word, which makes
//      "appears 2-4 times" ambiguous for the writer and brutal to satisfy.
//      → class 'structural'. Stays visible in FAB-5 coverage reporting;
//      excluded from mechanical story targeting; later these connect to the
//      grammar-progression work instead.
//
//   2. GLOSS KEYWORDS. Multi-character words whose English gloss reads as a
//      connective / modal / adverbial / classifier (if, moreover, must,
//      perhaps, according to, classifier for …) are real vocabulary a story
//      can absolutely contain — but forcing 而且 to appear exactly 2-4 times
//      produces filler. → class 'soft': scheduled with min 1, so an
//      otherwise excellent story is not failed for using a connective once.
//
//   Everything else → class 'hard': contentful nouns/verbs/adjectives that
//   can anchor 2-4 natural occurrences (需要, 生活, 参加, 机场, 护照 …).
//
// The keyword lists are data, committed here, calibrated against the actual
// HSK 3 glosses — extend them from evidence, never by vibes.

export const TARGET_CLASSES = ['hard', 'soft', 'structural']

// Gloss patterns that mark a word as soft (connective / modal / adverbial /
// function-ish). Checked against the lowercased gloss.
const SOFT_GLOSS_PATTERNS = [
  /\bif\b|in case|if only|so long as/,
  /moreover|but also|however|\bbut\b/,
  /^or;|; or\b|\bmaybe\b|perhaps|possibly/,
  /merely|nothing but|\bsimply\b|\bjust\b/,
  /surely|certainly|of course|only natural|as it should be/,
  /\bmust\b|have to|ought to|\bshould\b/,
  /actually|in fact/,
  /pertaining|concerning|according to|based on|with regard/,
  /as if|to seem|seem like/,
  /\balways\b|continuously|frequently|\boften\b|usually/,
  /especially|particularly/,
  /recently|at last|in the end|formerly|a moment ago|just recently|afterwards|after that/,
  /^after\b|^before\b|^then\b|^same\b|besides|apart from/,
  /for the purpose|in order to/,
  /only have|there is only/,
  /\belse\b/,
  /classifier for|measure word|prefix used|suffix used|particle/,
]

export function classifyTarget(vocabRow) {
  const word = String((vocabRow && vocabRow.word) || '')
  if (!word) return { class: 'structural', reason: 'empty word' }
  if ([...word].length === 1) {
    return { class: 'structural', reason: 'single character — grammar-like, and greedy matching folds it into compounds' }
  }
  const gloss = String((vocabRow && vocabRow.meaning) || '').toLowerCase()
  for (const re of SOFT_GLOSS_PATTERNS) {
    if (re.test(gloss)) return { class: 'soft', reason: 'gloss reads as connective/modal/adverbial: "' + gloss.slice(0, 40) + '"' }
  }
  return { class: 'hard', reason: 'contentful vocabulary' }
}

// Occurrence requirements per class. Hard targets anchor the story; soft
// targets must appear but never sink a story for appearing once.
export function occurrenceBounds(cls, defaults) {
  if (cls === 'soft') return { min: 1, max: defaults.max }
  return { min: defaults.min, max: defaults.max }
}

// ── Semantic grouping ────────────────────────────────────────────────────────
// Theme buckets over the English glosses — deterministic and inspectable. A
// travel story gets 机场+护照+行李 because their glosses all hit the travel
// bucket, not because they are adjacent in frequency order. Words whose gloss
// matches nothing land in 'general' (top-frequency HSK 3 hard targets are
// mostly general-purpose verbs like 需要/得到/了解 — they combine with any
// theme). An LLM planner can refine grouping later; the deterministic
// validator stays the gate either way.

export const SEMANTIC_BUCKETS = [
  ['travel', /travel|trip|journey|airport|passport|luggage|baggage|ticket|train|plane|flight|hotel|visa|tourist|depart/,
    'a trip: preparing, setting out, and something unexpected on the way'],
  ['school', /school|class\b|exam|test\b|student|teacher|study|homework|competition|match\b|contest|grade/,
    'school life: a class, a competition, or something to prepare for'],
  ['food', /food|to eat|cook|meal|restaurant|fruit|vegetable|drink|delicious|hungry|dish|breakfast|dinner/,
    'food: cooking, a meal, or a small kitchen adventure'],
  ['family-home', /family|mother|father|\bhome\b|house\b|room\b|child|parent|grandmother|grandfather/,
    'family and home: everyday life with something small going on'],
  ['social', /friend|\bpeople\b|to help|assist|relation|\bwoman\b|\bman\b|others|other people|neighbor|guest|thank/,
    'friends and neighbours: helping someone, or being helped'],
  ['places', /\bcity\b|country|nation|world|place\b|region|street|\bshop\b|store\b|park\b|town|market|road/,
    'out in the city: places, errands, and a small discovery'],
  ['feelings', /happy|worried|anxious|to feel|afraid|angry|\bmood\b|sad\b|rejoice|nervous|excite/,
    'a feeling that changes: from worry or excitement to something resolved'],
  ['work', /\bwork\b|\bjob\b|company|business|to serve|service|manager|office|colleague/,
    'work and responsibility: a small job that must be done right'],
  ['nature', /weather|rain\b|snow\b|\bsun\b|tree\b|river|mountain|animal|\bcat\b|\bdog\b|bird|flower|season/,
    'weather and animals: the outside world changes the plan'],
  ['health', /\bface\b|body\b|\bill\b|sick|hospital|doctor|tired|health|medicine|hurt|pain/,
    'health: someone is unwell or tired, and others take care of them'],
  ['activity', /music|to sing|dance|sport|to run|to play|game\b|exercise|swim|ball\b/,
    'games and activities: playing, practising, winning or losing'],
]

export function semanticBucket(meaning) {
  const gloss = String(meaning || '').toLowerCase()
  if (!gloss) return 'general'
  for (const [key, re] of SEMANTIC_BUCKETS) if (re.test(gloss)) return key
  return 'general'
}

export function bucketTheme(bucket) {
  for (const [key, , theme] of SEMANTIC_BUCKETS) if (key === bucket) return theme
  return null   // 'general' groups take the rotating season seed instead
}

// Compose one manifest's target set from a pending list (already in coverage
// priority order, each entry { word, meaning }):
//   1. classify everything in the visible horizon;
//   2. among hard targets, find the biggest non-general bucket with at least
//      `minBucket` members — that bucket becomes the story's theme; otherwise
//      take 'general' hard targets in priority order;
//   3. add the first `softCount` soft targets (min 1 each);
//   4. structural words are skipped entirely and reported, not scheduled.
export function composeTargetSet(pending, {
  hardCount = 5,
  softCount = 3,
  minBucket = 3,
  horizon = 48,
} = {}) {
  const seen = pending.slice(0, horizon).map(p => ({ ...p, ...classifyTarget(p) }))
  const hard = seen.filter(t => t.class === 'hard')
  const soft = seen.filter(t => t.class === 'soft')
  const structural = seen.filter(t => t.class === 'structural')

  const byBucket = new Map()
  for (const t of hard) {
    const b = semanticBucket(t.meaning)
    if (!byBucket.has(b)) byBucket.set(b, [])
    byBucket.get(b).push(t)
  }
  let bucket = 'general'
  let bucketSize = 0
  for (const [key, items] of byBucket) {
    if (key === 'general') continue
    if (items.length >= minBucket && items.length > bucketSize) { bucket = key; bucketSize = items.length }
  }
  const themed = bucket === 'general' ? [] : byBucket.get(bucket)
  const general = byBucket.get('general') || []
  // Themed words first, topped up from general in priority order.
  const chosenHard = [...themed, ...general.filter(t => !themed.includes(t))].slice(0, hardCount)
  const chosenSoft = soft.slice(0, softCount)

  return {
    bucket,
    theme: bucketTheme(bucket),
    hard: chosenHard.map(t => ({ word: t.word, meaning: t.meaning || null })),
    soft: chosenSoft.map(t => ({ word: t.word, meaning: t.meaning || null })),
    structuralSkipped: structural.map(t => t.word),
    reason: bucket === 'general'
      ? 'top-priority hard targets are general-purpose vocabulary that fits any theme'
      : bucketSize + ' pending hard targets share the "' + bucket + '" theme',
  }
}
