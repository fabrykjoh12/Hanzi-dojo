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

export const VOCAB_AUDIT_VERSION = 'fab9-vocab-audit@1'

export const DEFECT = {
  COMPONENT_ONLY: 'COMPONENT_ONLY',
  ABSENT: 'ABSENT',
  NAME: 'NAME',
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
export function classifyRun(run, { vocabMap = {}, knownNames = [] } = {}) {
  const r = String(run || '')
  if (!r) return null
  // Exact match, never containment: 石 is "stone" and 火 is "fire", and both
  // are substrings of characters' names in this corpus. A run is a name when it
  // IS the name.
  if (knownNames.some(n => String(n) === r)) {
    return { run: r, defect: DEFECT.NAME, hosts: [], layer: 'segmentation' }
  }
  const hosts = []
  for (const w of Object.keys(vocabMap)) {
    if (w.length > r.length && w.includes(r)) hosts.push(w)
    if (hosts.length >= 6) break
  }
  if (!hosts.length) return { run: r, defect: DEFECT.ABSENT, hosts: [], layer: 'content' }
  hosts.sort((a, b) => ((vocabMap[a] || {}).level || 99) - ((vocabMap[b] || {}).level || 99))
  return {
    run: r,
    defect: DEFECT.COMPONENT_ONLY,
    hosts: hosts.slice(0, 4),
    hostLevel: (vocabMap[hosts[0]] || {}).level || null,
    layer: 'source-data',
  }
}

/** The whole audit over a corpus, grouped by defect class. */
export function auditCorpus({ stories = [], vocabMap = {}, language = 'chinese' } = {}) {
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
    ...classifyRun(run, { vocabMap, knownNames: [...names] }),
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
