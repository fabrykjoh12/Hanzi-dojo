// Choose which words the NEXT story should teach (FAB-9, 2026-08-26).
//
// Four stored plans failed placement viability on 男人 / 女人 / 关系, each time
// because the manifest demanded the word and the story had no reason to say
// it. This runs before planning: the pool is judged word by word and as a set,
// and what does not fit is DEFERRED with its debt recorded, not discarded.
//
//   node target-bundle.mjs --input <corpus.json> --model <spec> --out <dir>
//
// One model call. Writes bundle.json (dispositions + reasons) and debt.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { publishedChineseStories, buildCoverageReport } from './storyCoverage.mjs'
import { buildCoveragePlan, pendingTargets } from './storyCoveragePlanner.mjs'
import { levelConfig } from './storyLevels.mjs'
import { directProvider } from './llmDirect.mjs'
import {
  bundlePrompt, parseBundleJudgment, selectBundle, applyDeferral, buildPool,
  BUNDLE_POLICY, BUNDLE_VERSION,
} from './storyTargetBundle.mjs'
import { wordSenses, SENSES_VERSION } from './storyWordSenses.mjs'
import { buildLexicalIndexes } from './storyLexicalRisk.mjs'
import { assessPremise, PREMISE, PREMISE_VERSION } from './storyPremiseRisk.mjs'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const inputPath = arg('input')
const outDir = arg('out')
const modelSpec = arg('model')
const level = parseInt(arg('level', '3'), 10)
const poolSize = parseInt(arg('pool', '8'), 10)
const debtPath = arg('debt', 'data/story-candidates/target-debt.json')
if (!inputPath || !outDir || !modelSpec) {
  console.error('usage: node target-bundle.mjs --input <corpus.json> --out <dir> --model <spec> [--level 3] [--pool 8] [--debt <path>]')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const stories = publishedChineseStories(raw.stories)
const vocab = raw.vocab || []
const meanings = Object.fromEntries(vocab.filter(v => v.meaning).map(v => [v.word, v.meaning]))

const bits = modelSpec.split(':')
const effort = bits.length > 2 ? bits[bits.length - 1] : null
const provider = directProvider(bits[0], bits.slice(1, bits.length > 2 ? -1 : undefined).join(':'), process.env, { reasoningEffort: effort })

// The pool is the coverage plan's own priority order — the words the corpus
// most needs to reinforce — carrying whatever debt a previous pass recorded.
const report = buildCoverageReport({ stories, vocab })
const plan = buildCoveragePlan({ words: report.words, level, goal: 2, batchCap: 2 })
const pending = pendingTargets(plan).slice(0, poolSize)
const debt = existsSync(debtPath) ? JSON.parse(readFileSync(debtPath, 'utf8')) : {}
const pool = buildPool(pending.map(t => ({ word: t.word, pending: Math.max(0, (plan.goal || 0) - (t.planned || 0)) })), debt)

// Every sense, the part of speech where the dataset has one, the row's own
// example, and how the word is really used in the published stories.
const vocabMap = {}
for (const v of vocab) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const corpusLines = stories.flatMap(st => String(st.content || '').split('\n')).map(l => l.trim()).filter(Boolean)
const senses = pool.map(p => wordSenses(p.word, { vocabMap, corpusLines }))

const cfg = levelConfig('chinese', 'hsk_3', level)
const levelName = (cfg && cfg.levelName) || ('HSK ' + level)

console.log('='.repeat(78))
console.log('TARGET BUNDLE (' + BUNDLE_VERSION + ') — HSK ' + level + ', pool of ' + pool.length)
console.log('='.repeat(78))
for (const e of senses) {
  console.log('  ' + e.word.padEnd(4) + (e.senses.map(x => (x.verb ? 'to ' : '') + x.text).join(' / ') || e.gloss || '').slice(0, 46).padEnd(48)
    + (e.pos ? e.pos.slice(0, 8).padEnd(10) : ''.padEnd(10))
    + (e.role ? 'grammatical (' + e.role.framed + '/' + e.role.uses + ')' : e.corpusUses + ' uses'))
}

let judgement = null
let rawOut = null
let error = null
try {
  rawOut = await provider.send({ kind: 'bundle', prompt: bundlePrompt({ pool, levelName, meanings, senses }), maxTokens: 1400 })
  judgement = parseBundleJudgment(rawOut, pool.map(p => p.word))
  if (!judgement) error = 'the judgement did not parse'
} catch (err) { error = String((err && err.message) || err).slice(0, 300) }
if (error) console.error('\nbundle judgement failed: ' + error)

const lexIndexes = buildLexicalIndexes(vocabMap, level)
const selection = selectBundle(judgement || { roles: [], bundle: [], situation: '' }, { pool })
const at = new Date().toISOString().slice(0, 10)
const nextDebt = applyDeferral(debt, selection, { at })

// The situation becomes manifest.theme verbatim and the shape prompt prints
// it, so it is scored by the same lexical gate the story is — before any plan
// is written. bundle-1's "A friend asking for advice on a conditional life
// choice, such as whether to accept a new job" cost 21 with four unsayable
// words, while the three targets it was choosing for cost nothing.
const premise = selection.situation
  ? assessPremise(selection.situation, { vocabMap, level, indexes: lexIndexes })
  : null
console.log('\nSITUATION: ' + (selection.situation || '(none proposed)'))
if (premise) {
  console.log('  premise gate: ' + premise.verdict + '  cost ' + premise.cost
    + '  off-list ' + premise.offListWords + '/' + premise.policy.offListMax)
  for (const a of premise.assisted) {
    console.log('    ' + a.concept.padEnd(16) + (a.offList ? 'NOT SAYABLE at any level' : 'taps ' + a.word) + '  cost ' + a.cost)
  }
  if (premise.verdict !== PREMISE.OK) {
    console.log('  → this premise spends the story\'s budget before a beat exists.')
    console.log('    Unsayable: ' + (premise.unsayable.join(', ') || '(none)'))
  }
}
console.log('\nword   disposition    reason')
for (const r of selection.rows) {
  console.log('  ' + r.word.padEnd(6) + r.bundle.padEnd(15) + String(r.reason || '').slice(0, 88))
}
console.log('\nREQUIRED:    ' + (selection.required.join('、') || '(none)'))
console.log('OPPORTUNITY: ' + (selection.opportunity.join('、') || '(none)'))
console.log('DEFERRED:    ' + (selection.deferred.join('、') || '(none)'))
if (selection.toppedUp.length) console.log('(topped up with ' + selection.toppedUp.join('、') + ' — the proposed bundle was under the minimum)')
if (!selection.enough) console.log('\nBUNDLE_TOO_THIN: fewer than ' + selection.policy.requiredMin + ' words have a role here')

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'bundle.json'), JSON.stringify({
  version: BUNDLE_VERSION,
  senses: { version: SENSES_VERSION, words: senses },
  generatedAt: new Date().toISOString(),
  level,
  levelName,
  model: modelSpec,
  policy: BUNDLE_POLICY,
  pool,
  judgement,
  raw: String(rawOut || '').slice(0, 2000),
  error,
  selection,
  premise: premise ? { version: PREMISE_VERSION, ...premise } : null,
  meanings: Object.fromEntries(pool.map(p => [p.word, meanings[p.word] || null])),
}, null, 2) + '\n')
mkdirSync(debtPath.split('/').slice(0, -1).join('/') || '.', { recursive: true })
writeFileSync(debtPath, JSON.stringify(nextDebt, null, 2) + '\n')
console.log('\nwrote ' + join(outDir, 'bundle.json') + ' and ' + debtPath)
console.log('usage: ' + JSON.stringify(provider.usage))
