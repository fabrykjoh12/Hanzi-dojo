// Vocabulary-source defect classifier (FAB-9, 2026-08-27).
//
// Four rows were found by hand — 被, 不见, 没, 公交 — and the question was
// whether they are four bad rows or the visible end of an ingestion problem.
// Running every PUBLISHED story through the reader's own matcher answers it:
// 618 occurrences of text a learner already meets and cannot tap, across 204
// stories. This module is that audit, as code, so it can be re-run and pinned.
//
// The classes are about WHERE the repair belongs, which is the only reason to
// separate them:
//
//   COMPONENT_ONLY   the character is taught only inside a compound (没 lives
//                    in 没有, 午 in 中午, 话 in 电话) and the story uses it
//                    alone. SOURCE DATA: the course does not teach this word.
//                    It must NOT be repaired in the evidence layer — knowing
//                    火车 ("train") does not teach 火 ("fire"), and treating
//                    containment as knowledge is the synonym-bridge mistake
//                    with characters instead of glosses.
//
//   ABSENT           nothing in the vocabulary contains it at all (缸, 秧苗).
//                    CONTENT: the story reached outside the course. Nothing to
//                    repair in the data.
//
//   NAME             an undetected proper name (淑兰). SEGMENTATION: the name
//                    list did not carry it, and a name is never vocabulary.
//
// A gloss that is too narrow for ordinary usage (不见 "not to see; not to
// meet", 被 "quilt") is NOT visible here: the reader segments those fine. It is
// only visible to the English-concept matcher, and it is checked separately by
// glossCoverage() below.
//
// Pure: no network, no fs, no clock.

import {
  buildVocabMatcher, segmentLine, storyNamesFor, particlesFor, segmenterFor,
} from './src/storyReading.js'
import { glossSenses } from './storyLexicalRisk.mjs'

export const VOCAB_AUDIT_VERSION = 'fab9-vocab-audit@2'

// The learner-facing failure, one primary class per unique lexical form. The
// classes exist to name the layer that owns the repair, and two of them were
// previously collapsed into one: a character the CURRICULUM lists but the DB
// lost is an ingestion bug, while a character that is merely a piece of a
// compound the course teaches is not a missing row at all — the course never
// taught it. Calling both "source-data defect" is what this split fixes.
export const DEFECT = {
  // The curriculum source lists this standalone word; the database has no row.
  CURRICULUM_ROW_MISSING: 'CURRICULUM_ROW_MISSING',
  // The story used a word the learner does not have and the course does not
  // teach at any level.
  OUT_OF_CURRICULUM: 'OUT_OF_CURRICULUM',
  // The character appears inside a compound the course teaches, and nothing
  // more. 火车 ("train") does not teach 火 ("fire"). NOT evidence of knowledge.
  MORPHEME_OF_COMPOUND: 'MORPHEME_OF_COMPOUND',
  // A canonical story entity — a person's name — which is deliberately outside
  // ordinary vocabulary.
  CANON_ENTITY: 'CANON_ENTITY',
  // The reader's segmenter grouped or split the text wrongly.
  SEGMENTATION: 'SEGMENTATION',
}

const CJK = /[一-鿿]/
const cjkOnly = (s) => [...String(s || '')].filter(ch => CJK.test(ch)).join('')

/** Every word-like run in this text that the reader's matcher cannot resolve. */
export function untappableRuns({ content, vocabMap = {}, language = 'chinese' } = {}) {
  const text = String(content || '')
  const names = storyNamesFor(text, vocabMap, language)
  const matcher = buildVocabMatcher(vocabMap, language)
  const particles = particlesFor(language)
  const segmenter = segmenterFor(language)
  const out = new Map()
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^[^:：]{1,12}[:：]\s*/, '')
    for (const tok of segmentLine(line, matcher, names, particles, segmenter)) {
      if (tok.vocab || tok.name) continue
      const run = cjkOnly(tok.text)
      if (!run) continue
      out.set(run, (out.get(run) || 0) + 1)
    }
  }
  return out
}

/**
 * Why one run is untappable, and therefore which layer owns the repair.
 * `hosts` names the vocabulary words that contain it — the provenance for a
 * COMPONENT_ONLY verdict, so a reader of the audit can check it.
 */
export function classifyRun(run, { vocabMap = {}, knownNames = [], curriculum = null } = {}) {
  const r = String(run || '')
  if (!r) return null
  // Exact match, never containment: 石 is "stone" and 火 is "fire", and both
  // are substrings of characters' names in this corpus. A run is a name when it
  // IS the name.
  if (knownNames.some(n => String(n) === r)) {
    return { run: r, defect: DEFECT.CANON_ENTITY, hosts: [], layer: 'canon/names' }
  }
  // A multi-character run that the vocabulary does not carry, whose pieces it
  // DOES carry, is the segmenter gluing two things together — not a word.
  if (r.length > 1 && !vocabMap[r] && [...r].every(ch => vocabMap[ch])) {
    return { run: r, defect: DEFECT.SEGMENTATION, hosts: [...r], layer: 'segmentation' }
  }
  // The curriculum source is the authority on whether a standalone row SHOULD
  // exist. Without it this distinction cannot be made, and the run falls
  // through to the weaker classes below.
  if (curriculum && curriculum.has(r)) {
    return { run: r, defect: DEFECT.CURRICULUM_ROW_MISSING, hosts: [], layer: 'ingestion' }
  }
  const hosts = []
  for (const w of Object.keys(vocabMap)) {
    if (w.length > r.length && w.includes(r)) hosts.push(w)
    if (hosts.length >= 6) break
  }
  if (!hosts.length) return { run: r, defect: DEFECT.OUT_OF_CURRICULUM, hosts: [], layer: 'story content' }
  hosts.sort((a, b) => ((vocabMap[a] || {}).level || 99) - ((vocabMap[b] || {}).level || 99))
  return {
    run: r,
    defect: DEFECT.MORPHEME_OF_COMPOUND,
    hosts: hosts.slice(0, 4),
    hostLevel: (vocabMap[hosts[0]] || {}).level || null,
    // Deliberately NOT 'source-data': the course does not teach this word, and
    // the compound containing it is not evidence that it should.
    layer: 'story content or curriculum decision',
  }
}

/** The whole audit over a corpus, grouped by defect class. */
export function auditCorpus({ stories = [], vocabMap = {}, language = 'chinese', curriculum = null } = {}) {
  const totals = new Map()
  const seenIn = new Map()
  const names = new Set()
  for (const s of stories) {
    const content = String(s.content || '')
    for (const n of Object.keys(storyNamesFor(content, vocabMap, language) || {})) names.add(n)
    for (const [run, n] of untappableRuns({ content, vocabMap, language })) {
      totals.set(run, (totals.get(run) || 0) + n)
      if (!seenIn.has(run)) seenIn.set(run, new Set())
      seenIn.get(run).add(s.id || s.title)
    }
  }
  const rows = [...totals.entries()].map(([run, occurrences]) => ({
    ...classifyRun(run, { vocabMap, knownNames: [...names], curriculum }),
    occurrences,
    stories: seenIn.get(run).size,
  })).sort((a, b) => b.occurrences - a.occurrences)
  const by = (d) => rows.filter(r => r.defect === d)
  const sum = (list) => list.reduce((n, r) => n + r.occurrences, 0)
  return {
    version: VOCAB_AUDIT_VERSION,
    storiesAudited: stories.length,
    rows,
    summary: Object.values(DEFECT).map(d => ({
      defect: d, runs: by(d).length, occurrences: sum(by(d)), layer: (by(d)[0] || {}).layer || null,
    })),
  }
}

/**
 * Does this row's gloss cover the way the corpus actually uses the word?
 * The narrow-gloss class (不见, 被) is invisible to segmentation, so it needs
 * its own check: a usage the learner meets that no SENSE of the gloss carries.
 * Sense-level, never token-level — a word mentioned inside a long sense is not
 * a sense, which is the invariant the whole lexical layer already runs on.
 */
export function glossCoverage(word, { vocabMap = {}, expectedSenses = [] } = {}) {
  const entry = vocabMap[word]
  if (!entry || !entry.meaning) return { word, covered: false, reason: 'no gloss at all', senses: [] }
  const senses = glossSenses(entry.meaning)
  const heads = new Set(senses.map(s => (s.head || '').toLowerCase()).filter(Boolean))
  const missing = expectedSenses.filter(e => !heads.has(String(e).toLowerCase()))
  return {
    word,
    gloss: entry.meaning,
    senses: senses.map(s => s.text),
    covered: missing.length === 0,
    missing,
    reason: missing.length ? 'no sense is headed by: ' + missing.join(', ') : null,
    layer: 'source-data',
  }
}

// ── The publishability invariant (FAB-9 §4, 2026-08-27) ─────────────────────
//
// Every learner-facing Mandarin token in a published story must resolve through
// the SAME segmentation and lookup path the Reader uses, or be a canonical
// non-vocabulary entity (a character's name). Nothing else may ship.
//
// It reuses untappableRuns(), which calls the production segmentLine with the
// production matcher, names and segmenter — there is deliberately no second
// implementation of segmentation here, because an invariant enforced against a
// copy of the logic tests the copy.
//
// This is NOT enforced against the existing corpus: 204 published stories carry
// 652 such occurrences today, and turning that into a build failure would make
// the repository unbuildable. It is a gate for NEW publication, and a repair
// backlog for what is already out.
export function publishable(story, { vocabMap = {}, language = 'chinese', curriculum = null } = {}) {
  const content = String((story && story.content) || '')
  const names = storyNamesFor(content, vocabMap, language)
  const known = Object.keys(names || {})
  const offenders = []
  for (const [run, occurrences] of untappableRuns({ content, vocabMap, language })) {
    const c = classifyRun(run, { vocabMap, knownNames: known, curriculum })
    // A canonical entity resolved by the Reader's own name path is the one
    // permitted non-vocabulary token.
    if (c.defect === DEFECT.CANON_ENTITY) continue
    offenders.push({ ...c, occurrences })
  }
  return {
    version: VOCAB_AUDIT_VERSION,
    ok: offenders.length === 0,
    title: (story && story.title) || null,
    offenders,
    occurrences: offenders.reduce((n, o) => n + o.occurrences, 0),
    // A refusal has to say what to DO, or the gate reads as "proper nouns are
    // banned". They are not: the Reader recognises a name two ways, and both
    // are open to the author.
    remedy: offenders.length ? REMEDY : null,
  }
}

export const REMEDY = [
  'Every token must resolve the way the Reader resolves it. For a person or place, either:',
  '  - give them a speaker label in the story (名字: ...) — collectStoryNames derives names from the story itself, so a new character needs no registration; or',
  '  - add them to CHARACTER_READINGS in src/characterNames.js with their reading — the name payload is { word, reading } and carries nothing person-specific, so a place works the same way.',
  'For an ordinary word the learner does not have, change the word. Do not add a vocabulary row to silence this.',
].join('\n')

/** How much of an existing corpus would fail the invariant, and why. */
export function publishabilityBlastRadius({ stories = [], vocabMap = {}, language = 'chinese', curriculum = null } = {}) {
  const perStory = stories.map(s => ({ story: s.id || s.title, level: s.level, ...publishable(s, { vocabMap, language, curriculum }) }))
  const failing = perStory.filter(r => !r.ok)
  const byDefect = new Map()
  for (const r of failing) {
    for (const o of r.offenders) {
      if (!byDefect.has(o.defect)) byDefect.set(o.defect, { defect: o.defect, layer: o.layer, forms: new Set(), occurrences: 0, stories: new Set() })
      const e = byDefect.get(o.defect)
      e.forms.add(o.run)
      e.occurrences += o.occurrences
      e.stories.add(r.story)
    }
  }
  return {
    version: VOCAB_AUDIT_VERSION,
    stories: stories.length,
    failing: failing.length,
    passing: stories.length - failing.length,
    matrix: [...byDefect.values()].map(e => ({
      defect: e.defect, layer: e.layer,
      uniqueForms: e.forms.size, occurrences: e.occurrences, stories: e.stories.size,
    })).sort((a, b) => b.occurrences - a.occurrences),
    perStory,
  }
}
