// Read one or more candidate batches and print the full per-candidate review
// a human needs to judge a generation model: deterministic metrics, validator
// findings, semantic judgments, attempts, latency and tokens — plus the story
// itself for anything that passed.
//
// Reads files only. Nothing here writes to a batch, a database, or a story.
//
//   node bench-report.mjs data/story-candidates/bench-1-a data/story-candidates/bench-1-b
//   node bench-report.mjs --brief <dirs...>     # skip the story bodies

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const brief = args.includes('--brief')
const dirs = args.filter(a => !a.startsWith('--'))
if (!dirs.length) { console.error('Usage: node bench-report.mjs [--brief] <batch-dir> [batch-dir...]'); process.exit(1) }

const pct = (x) => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%')
const n = (x) => (x == null ? 'n/a' : String(x))

for (const dir of dirs) {
  if (!existsSync(dir)) { console.log('\n(missing batch dir: ' + dir + ')'); continue }
  const reportPath = join(dir, 'batch-report.json')
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null

  console.log('\n' + '='.repeat(78))
  console.log('BATCH ' + dir)
  if (report) {
    console.log('  provider/model : ' + report.provider.name + ' / ' + report.provider.model)
    console.log('  accepted       : ' + report.accepted + '/' + report.manifests
      + '   rejected: ' + report.rejected)
    console.log('  provider calls : ' + report.totalProviderCalls
      + (report.tokenUsage ? '   tokens ' + report.tokenUsage.promptTokens + '/' + report.tokenUsage.completionTokens : ''))
    console.log('  failures       : ' + JSON.stringify(report.failureHistogram))
    if (report.coverage && report.coverage.current) {
      console.log('  HSK ' + report.level + ' zero-exposure: ' + report.coverage.current.zero
        + ' → ' + report.coverage.projectedIfPublished.zero + ' if staged AND published')
    }
  }

  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name === 'batch-report.json' || name === 'manifests.json') continue
    const f = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    const c = f.candidate || {}
    const m = f.manifest || {}
    const v = c.validation || {}
    const met = v.metrics || {}

    console.log('\n' + '-'.repeat(78))
    console.log(m.id + '   [' + String(c.status || '?').toUpperCase() + ']')
    console.log('  model      : ' + (f.provider ? f.provider.name + ' / ' + f.provider.model : 'n/a'))
    console.log('  title      : ' + (c.title || '—'))
    console.log('  targets    : ' + (m.targets || []).map(t => t.word + ' (' + t.min + '-' + t.max + ')').join('  '))
    if (met.targetCounts) {
      console.log('  occurrences: ' + Object.entries(met.targetCounts).map(([w, k]) => w + '×' + k).join('  '))
    }
    console.log('  length     : ' + n(met.lines) + ' lines / ' + n(met.cjkChars) + ' chars'
      + '   distinct vocab ' + n(met.distinctVocab))
    console.log('  difficulty : in-level ' + pct(met.inLevelCoverage)
      + '   out-of-level ' + n(met.outOfLevelDistinct) + ' words / ' + pct(met.outOfLevelCharShare)
      + '   unknown ' + n(met.unknownDistinct) + ' / ' + pct(met.unknownCharShare))
    if (met.unknownRuns && met.unknownRuns.length) console.log('  unknown    : ' + met.unknownRuns.join('、'))
    console.log('  repetition : ' + n(met.repeatedLines) + ' repeated lines, trigram ' + pct(met.repeatedTrigramShare))
    if (met.nearestNeighbor) {
      console.log('  nearest    : "' + met.nearestNeighbor.title + '" jaccard ' + met.nearestNeighbor.jaccard
        + ' / containment ' + met.nearestNeighbor.containment)
    }
    console.log('  verdict    : ' + (v.verdict || '?'))
    for (const x of v.failures || []) console.log('     FAIL  ' + x.code + ': ' + x.message)
    for (const x of v.warnings || []) console.log('     warn  ' + x.code + ': ' + x.message)
    console.log('  attempts   : ' + n(c.attempts) + ' draft attempt(s), ' + n(c.calls) + ' provider call(s)')
    if (c.critique) console.log('  self-crit  : ' + c.critique.score + '/10 — ' + (c.critique.feedback || '').slice(0, 160))
    if (c.usage) {
      console.log('  cost       : ' + n(c.usage.wallMs) + 'ms wall, ' + n(c.usage.requests) + ' req, '
        + n(c.usage.promptTokens) + '/' + n(c.usage.completionTokens) + ' tokens')
    }
    for (const j of f.judgments || []) {
      console.log('  JUDGE ' + j.judge.provider + '/' + j.judge.model + ' → overall ' + j.overall + '/10'
        + (j.mechanical === true ? '  [reads mechanical]' : j.mechanical === false ? '  [reads human]' : ''))
      console.log('     scores   : ' + Object.entries(j.scores || {}).map(([k, s]) => k + ' ' + s).join(', '))
      if (j.strengths) console.log('     strengths: ' + j.strengths)
      if (j.weaknesses) console.log('     weakness : ' + j.weaknesses)
    }
    for (const st of c.stages || []) {
      const v = st.validation || {}
      console.log('  STAGE ' + st.stage + ' (' + st.role + ') → ' + v.verdict
        + (v.failures && v.failures.length ? '  [' + v.failures.map(x => x.code).join(', ') + ']' : ''))
      if (!brief && st.content) {
        console.log('    TITLE: ' + st.title)
        st.content.split('\n').forEach(l => console.log('    ' + l))
      }
    }
    if (c.critique && c.critique.judgeVersion) {
      console.log('  CRITIQUE (writer) → overall ' + c.critique.overall + '/10'
        + (c.critique.mechanical === true ? ' [reads mechanical]' : c.critique.mechanical === false ? ' [reads human]' : ''))
      console.log('     scores   : ' + Object.entries(c.critique.scores || {}).map(([k, v2]) => k + ' ' + v2).join(', '))
      if (c.critique.strengths) console.log('     strengths: ' + c.critique.strengths)
      if (c.critique.weaknesses) console.log('     weakness : ' + c.critique.weaknesses)
    }
    if (!brief && c.status === 'accepted' && c.content) {
      console.log('\n  --- Chinese ---')
      c.content.split('\n').forEach(l => console.log('  ' + l))
      if (c.englishContent) {
        console.log('  --- English ---')
        c.englishContent.split('\n').forEach(l => console.log('  ' + l))
      }
    }
  }
}
