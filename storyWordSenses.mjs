// What a target word actually MEANS and DOES, for the bundle stage (2026-08-26).
//
// The bundle stage deferred 被 because the vocabulary row glosses it "quilt;
// to cover (with)" and it judged a quilt irrelevant to a story about advice.
// 被 is the passive marker every HSK 3 learner meets, and the dataset does not
// say so: `part_of_speech` is null for it (populated for 300 of 950 in-level
// rows), and its example sentence is 折被子 — the quilt again.
//
// The fix is not a 被 case. It is to stop reducing a word to the first English
// gloss and to hand the judgement every piece of evidence that exists:
//
//   - EVERY sense in the gloss, not the first — 54% of in-level rows carry more
//     than one, and the passive/nominal split is exactly what gets lost
//   - `part_of_speech` where the dataset has it
//   - the row's own example sentence and translation
//   - how the word is ACTUALLY USED in the published corpus, and a role read
//     off that usage: a word that keeps appearing immediately before a verb is
//     doing grammatical work, whatever its noun gloss says
//
// The last one is what recovers 被 without naming it, and it recovers 把, 让 and
// 给 by the same rule.
//
// Pure: no network, no fs, no clock.

import { glossSenses } from './storyLexicalRisk.mjs'

export const SENSES_VERSION = 'fab9-senses@1'

const text = (v) => String(v == null ? '' : v).trim()

// A word is doing grammatical work when it keeps standing immediately before
// something the dictionary calls a verb.
export function roleFromUsage(word, lines, vocabMap = {}, { min = 2, window = 3, ratio = 0.6 } = {}) {
  const w = text(word)
  if (!w) return null
  // Walk forward over the entries that follow, because the passive puts the
  // AGENT between the marker and the verb — 他[被][老师][叫] — and so does the
  // 把 construction. One token of lookahead sees only the agent.
  const verbWithin = (rest) => {
    let cursor = 0
    for (let step = 0; step < window && cursor < rest.length; step += 1) {
      let matched = null
      for (let n = Math.min(4, rest.length - cursor); n >= 1; n -= 1) {
        const candidate = rest.slice(cursor, cursor + n)
        if (vocabMap[candidate]) { matched = candidate; break }
      }
      if (!matched) { cursor += 1; continue }
      if (glossSenses((vocabMap[matched] || {}).meaning).some(x => x.verb)) return true
      cursor += matched.length
    }
    return false
  }

  let uses = 0
  let framed = 0
  for (const line of lines) {
    const s = text(line)
    let at = s.indexOf(w)
    while (at >= 0) {
      uses += 1
      // Something has to come before it: a marker is never the subject.
      const preceded = at > 0 && !/^[，。！？、；：\s]$/.test(s[at - 1])
      if (preceded && verbWithin(s.slice(at + w.length))) framed += 1
      at = s.indexOf(w, at + w.length)
    }
  }
  if (uses >= min && framed >= min && framed / uses >= ratio) {
    return {
      role: 'grammatical',
      detail: 'stands between a noun and a verb in ' + framed + ' of ' + uses
        + ' uses in the published corpus — in this position it is doing grammatical work, whatever its noun gloss says',
      framed,
      uses,
    }
  }
  return null
}

// Everything known about one word, with nothing collapsed.
export function wordSenses(word, { vocabMap = {}, corpusLines = [], examples = 2 } = {}) {
  const w = text(word)
  const row = vocabMap[w] || {}
  const senses = glossSenses(row.meaning)
  const lines = corpusLines.filter(l => text(l).includes(w))
  return {
    word: w,
    level: Number.isFinite(row.level) ? row.level : null,
    pos: text(row.part_of_speech) || null,
    senses,
    senseCount: senses.length,
    gloss: text(row.meaning) || null,
    example: text(row.example_sentence) || null,
    exampleTranslation: text(row.example_translation) || null,
    corpusExamples: lines.slice(0, examples).map(l => text(l)),
    corpusUses: lines.length,
    role: roleFromUsage(w, lines, vocabMap),
  }
}

// How the evidence is shown to a judge: senses numbered, so nothing reads as
// "the meaning", and the observed role stated plainly when there is one.
export function renderSenses(entry) {
  const parts = []
  parts.push('  ' + entry.word + (entry.level ? ' (HSK ' + entry.level + ')' : '') + (entry.pos ? ' · ' + entry.pos : ''))
  if (entry.senses.length) {
    parts.push('      senses: ' + entry.senses.map((s, i) => (i + 1) + ') ' + (s.verb ? 'to ' : '') + s.text).join('  '))
  } else if (entry.gloss) parts.push('      gloss: ' + entry.gloss)
  if (entry.example) parts.push('      example: ' + entry.example + (entry.exampleTranslation ? '  — ' + entry.exampleTranslation : ''))
  for (const l of entry.corpusExamples) parts.push('      in a published story: ' + l)
  if (entry.role) parts.push('      OBSERVED ROLE: ' + entry.role.detail)
  return parts.join('\n')
}
