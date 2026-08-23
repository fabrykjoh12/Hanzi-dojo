// Deterministic lexical candidate retrieval (FAB-9 A3.1, 2026-08-23).
//
// a3-fresh-2 stopped on beat 4 — "he needs help because it is getting dark" —
// after the writer offered 黑 (HSK 5) and then, told 黑 was too hard, 亮
// (HSK 4). Both are above level; 晚上, 晚, 天, 时间 and 六点 were all sitting
// in the reader's own vocabulary. The model can honour "use this word" and
// "not that word"; what it cannot do is search a 950-word list for the simple
// substitute. That is a retrieval problem, and retrieval is something code
// does well.
//
// So before the writer is asked for a beat's words — and again when a beat is
// retried — the pipeline reads the beat's ENGLISH metadata, ranks the
// vocabulary the reader actually has by how well each gloss answers it, and
// hands over a short list. The list is a suggestion: it changes what the model
// is looking at, never what the validator accepts. A word that is not
// permitted cannot enter the list, and a word in the list still passes through
// checkAnchor like any other.
//
// No LLM call, no network, no curated synonym table: the ranking is English
// token overlap against the glosses already in the vocabulary dataset, so
// every suggestion can be explained by the words it matched.

export const RETRIEVAL_VERSION = 'fab9-retrieval@1'

// Words that carry no meaning for matching purposes.
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
  'with', 'from', 'into', 'out', 'up', 'down', 'over', 'about', 'as', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'them',
  'his', 'her', 'their', 'him', 'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my', 'not', 'no',
  'do', 'does', 'did', 'done', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'have', 'has', 'had', 'there', 'here', 'when', 'where', 'why', 'how', 'what', 'who', 'which',
  'because', 'then', 'than', 'very', 'more', 'most', 'some', 'any', 'all', 'one', 'two', 'also',
  'just', 'now', 'again', 'still', 'get', 'gets', 'got', 'getting', 'go', 'goes', 'going', 'went',
  'say', 'says', 'said', 'make', 'makes', 'made', 'take', 'takes', 'took', 'thing', 'things',
])

// Light, auditable stemming — enough to join look/looks/looking and
// help/helps/helping without pretending to be a morphological analyser.
export function stem(word) {
  let w = String(word || '').toLowerCase()
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) { w = w.slice(0, -suffix.length); break }
  }
  return w
}

export function tokenize(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(t => t.length > 1 && !STOP.has(t))
}

// The query is the beat as the SHAPE describes it — what happens, why, when
// and where, and what each target is meant to communicate. Deliberately not
// just the rejected Chinese word: the English shape says what the beat means
// without having committed to any particular Chinese.
export function buildQuery({ beat, entries = [], avoidGlosses = [] }) {
  const parts = [
    beat && beat.what,
    beat && beat.because,
    beat && beat.when,
    beat && beat.where,
    ...entries.map(e => [e.intent, e.refersTo].filter(Boolean).join(' ')),
    // On a retry, the rejected words' own glosses point at the slot that
    // needs filling — 黑 "black; dark" tells us the beat wants a word about
    // darkness, without anyone writing down that 黑 means 晚上.
    ...avoidGlosses,
  ]
  const tokens = []
  for (const p of parts) for (const t of tokenize(p)) tokens.push(t)
  const seen = new Map()
  for (const t of tokens) seen.set(t, (seen.get(t) || 0) + 1)
  return { tokens: [...seen.keys()], counts: seen, text: parts.filter(Boolean).join(' | ') }
}

const SCORE = { exact: 3, stemmed: 2, partial: 1 }

// Rank the permitted vocabulary against the query. `allow` decides what is
// permitted — retrieval never widens it.
export function retrieveCandidates({
  beat,
  entries = [],
  manifest,
  vocabMap,
  avoid = [],
  exclude = [],
  limit = 12,
} = {}) {
  const level = manifest.level
  const avoidSet = new Set(avoid)
  const excludeSet = new Set([...exclude, ...(manifest.targets || []).map(t => t.word)])
  const avoidGlosses = avoid.map(w => (vocabMap[w] && vocabMap[w].meaning) || '').filter(Boolean)
  const query = buildQuery({ beat, entries, avoidGlosses })
  if (!query.tokens.length) return { version: RETRIEVAL_VERSION, query, candidates: [] }

  const queryStems = new Map()
  for (const t of query.tokens) queryStems.set(stem(t), t)

  const scored = []
  for (const word of Object.keys(vocabMap)) {
    const v = vocabMap[word]
    if (!v || !Number.isFinite(v.level) || v.level > level) continue      // permitted only
    if (avoidSet.has(word) || excludeSet.has(word)) continue
    const gloss = String(v.meaning || '')
    if (!gloss) continue
    const glossTokens = tokenize(gloss)
    if (!glossTokens.length) continue
    let score = 0
    const matched = []
    for (const g of glossTokens) {
      if (query.counts.has(g)) { score += SCORE.exact; matched.push(g); continue }
      const s = stem(g)
      if (queryStems.has(s)) { score += SCORE.stemmed; matched.push(queryStems.get(s)); continue }
      const near = query.tokens.find(t => t.length >= 4 && (t.includes(s) || s.includes(t)))
      if (near) { score += SCORE.partial; matched.push(near) }
    }
    if (score <= 0) continue
    // A simpler word is a better suggestion when two are equally relevant.
    score += (level - v.level) * 0.25
    scored.push({ word, level: v.level, meaning: gloss, score: Math.round(score * 100) / 100, matched: [...new Set(matched)] })
  }

  scored.sort((a, b) => b.score - a.score || a.level - b.level || (a.word < b.word ? -1 : 1))
  // Never pad to a quota: a short list is an honest answer, and the model is
  // told the list is a suggestion rather than the whole of what it may use.
  return { version: RETRIEVAL_VERSION, query, candidates: scored.slice(0, limit) }
}
