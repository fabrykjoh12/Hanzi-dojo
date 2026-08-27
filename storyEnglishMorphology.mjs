// English lemma and derivation normalization for the lexical gate (2026-08-26).
//
// The feasibility matcher compares an English concept from a story plan against
// the English glosses of a Chinese vocabulary list. Three classes of ordinary
// English were failing that comparison and being charged as vocabulary the
// language does not have:
//
//   gave     → give    → 给 (HSK 1)   irregular past; no suffix to strip
//   helpful  → help    → 帮 (HSK 2)   derivation that CHANGES part of speech
//   suggested→ suggest → 最好          the evidence sat inside a parenthetical
//
// The first two live here. Neither is a fix for the reproduced word: the
// irregular table is an ordinary English lexicon, and the derivational rules
// are suffix rules with the part-of-speech each one expects of its base — which
// is what keeps corner from deriving from corn.
//
// Pure: no network, no fs, no clock.

export const MORPH_VERSION = 'fab9-morph@2'

const text = (v) => String(v == null ? '' : v).trim().toLowerCase()

// Irregular forms → lemma. An English lexicon, not a list of cases seen in one
// run: verbs by family (ablaut, -ought/-aught, no-change) and the irregular
// plurals a story is likely to use.
export const IRREGULAR = (() => {
  const verbs = [
    ['be', 'am', 'is', 'are', 'was', 'were', 'been'],
    ['have', 'has', 'had'], ['do', 'does', 'did', 'done'], ['go', 'goes', 'went', 'gone'],
    ['give', 'gave', 'given'], ['take', 'took', 'taken'], ['make', 'made'], ['say', 'said'],
    ['see', 'saw', 'seen'], ['hear', 'heard'], ['come', 'came'], ['become', 'became'],
    ['get', 'got', 'gotten'], ['find', 'found'], ['tell', 'told'], ['sell', 'sold'],
    ['hold', 'held'], ['leave', 'left'], ['feel', 'felt'], ['keep', 'kept'], ['sleep', 'slept'],
    ['meet', 'met'], ['run', 'ran'], ['sit', 'sat'], ['stand', 'stood'], ['understand', 'understood'],
    ['win', 'won'], ['lose', 'lost'], ['pay', 'paid'], ['send', 'sent'], ['spend', 'spent'],
    ['build', 'built'], ['buy', 'bought'], ['bring', 'brought'], ['think', 'thought'],
    ['teach', 'taught'], ['catch', 'caught'], ['fight', 'fought'], ['seek', 'sought'],
    ['eat', 'ate', 'eaten'], ['drink', 'drank', 'drunk'], ['fall', 'fell', 'fallen'],
    ['break', 'broke', 'broken'], ['speak', 'spoke', 'spoken'], ['write', 'wrote', 'written'],
    ['drive', 'drove', 'driven'], ['ride', 'rode', 'ridden'], ['rise', 'rose', 'risen'],
    ['wear', 'wore', 'worn'], ['choose', 'chose', 'chosen'], ['forget', 'forgot', 'forgotten'],
    ['begin', 'began', 'begun'], ['swim', 'swam', 'swum'], ['sing', 'sang', 'sung'],
    ['ring', 'rang', 'rung'], ['know', 'knew', 'known'], ['grow', 'grew', 'grown'],
    ['throw', 'threw', 'thrown'], ['blow', 'blew', 'blown'], ['fly', 'flew', 'flown'],
    ['draw', 'drew', 'drawn'], ['show', 'showed', 'shown'], ['wake', 'woke', 'woken'],
    ['lead', 'led'], ['feed', 'fed'], ['mean', 'meant'], ['deal', 'dealt'], ['hang', 'hung'],
    ['dig', 'dug'], ['stick', 'stuck'], ['strike', 'struck'], ['lend', 'lent'], ['lay', 'laid'],
    ['put'], ['cut'], ['let'], ['set'], ['shut'], ['cost'], ['hit'], ['hurt'], ['read'],
  ]
  const nouns = [
    ['child', 'children'], ['man', 'men'], ['woman', 'women'], ['person', 'people'],
    ['foot', 'feet'], ['tooth', 'teeth'], ['mouse', 'mice'], ['goose', 'geese'],
    ['life', 'lives'], ['knife', 'knives'], ['wife', 'wives'], ['leaf', 'leaves'],
    ['shelf', 'shelves'], ['half', 'halves'], ['loaf', 'loaves'], ['thief', 'thieves'],
  ]
  const map = new Map()
  for (const family of [...verbs, ...nouns]) {
    const [lemma, ...forms] = family
    for (const f of forms) if (!map.has(f)) map.set(f, lemma)
  }
  return map
})()

// Ordinary inflection, after the irregulars have had their say.
export function lemma(word) {
  // One pass strips inflection; a second resolves what that uncovers. "thoughts"
  // is a plural whose singular is itself an irregular past ("thought" → think),
  // and stopping after one pass left the plural stranded while the singular
  // resolved. Bounded at two so no chain can run away.
  let out = lemmaOnce(word)
  for (let i = 0; i < 1; i += 1) {
    const next = lemmaOnce(out)
    if (next === out) break
    out = next
  }
  return out
}

function lemmaOnce(word) {
  const w = text(word)
  if (!w) return ''
  if (IRREGULAR.has(w)) return IRREGULAR.get(w)
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y'
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2)
  if (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) return w.slice(0, -1)
  if (/ied$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y'
  if (/ed$/.test(w) && w.length > 4) {
    const stem = w.slice(0, -2)
    return /([bdfglmnprt])\1$/.test(stem) ? stem.slice(0, -1) : stem
  }
  if (/ing$/.test(w) && w.length > 5) {
    const stem = w.slice(0, -3)
    if (/([bdfglmnprt])\1$/.test(stem)) return stem.slice(0, -1)
    return stem
  }
  return w
}

// Derivations that CHANGE part of speech. Each suffix says what it expects of
// its base, because that is what separates a real derivation from a suffix
// coincidence: an agentive -er derives from a VERB (teacher ← teach), so
// corner does not derive from corn.
export const DERIVATIONS = [
  { suffix: 'fulness', base: '', expects: 'any' },
  { suffix: 'ful', base: '', expects: 'any' },
  { suffix: 'less', base: '', expects: 'any' },
  { suffix: 'ness', base: '', expects: 'any' },
  { suffix: 'ment', base: '', expects: 'verb' },
  { suffix: 'ation', base: 'ate', expects: 'verb' },
  { suffix: 'ition', base: 'ite', expects: 'verb' },
  { suffix: 'tion', base: 't', expects: 'verb' },
  { suffix: 'sion', base: 'd', expects: 'verb' },
  { suffix: 'ance', base: '', expects: 'verb' },
  { suffix: 'ence', base: '', expects: 'verb' },
  { suffix: 'er', base: '', expects: 'verb' },
  { suffix: 'or', base: '', expects: 'verb' },
  { suffix: 'ist', base: '', expects: 'any' },
  { suffix: 'able', base: '', expects: 'verb' },
  { suffix: 'ible', base: '', expects: 'verb' },
  { suffix: 'ive', base: 'e', expects: 'verb' },
  { suffix: 'ous', base: '', expects: 'any' },
  { suffix: 'ly', base: '', expects: 'any' },
  { suffix: 'y', base: '', expects: 'any' },
]

// Every base a word could plausibly derive from, with what that derivation
// needs its base to be. Candidates only — the caller checks the base exists and
// has the right kind of sense.
export function derivations(word, { minBase = 4 } = {}) {
  const w = text(word)
  const out = []
  for (const rule of DERIVATIONS) {
    if (!w.endsWith(rule.suffix) || w.length <= rule.suffix.length + 1) continue
    const cut = w.slice(0, w.length - rule.suffix.length)
    const candidates = new Set([cut + rule.base])
    // English drops and doubles letters at the seam: happiness ← happy,
    // running ← run, movement ← move.
    if (cut.endsWith('i')) candidates.add(cut.slice(0, -1) + 'y')
    if (rule.base === '') candidates.add(cut + 'e')
    for (const base of candidates) {
      if (base.length < minBase || base === w) continue
      out.push({ base, suffix: rule.suffix, expects: rule.expects })
    }
  }
  return out
}
