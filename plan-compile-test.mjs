// Does the deterministic schema compiler recover plans the validator rejected
// on serialization alone? (FAB-9, 2026-08-24)
//
// Offline by construction: it reads a stored planner bakeoff, compiles every
// plan in it, and re-runs the SAME validator with the SAME thresholds. No
// model is called, so the semantic content — and therefore the stored quality
// judgment — is unchanged by definition, and compileChanges proves it.
//
//   node plan-compile-test.mjs --in data/story-candidates/<run>/bakeoff.json
//
// Usage: node plan-compile-test.mjs --in <bakeoff.json> [--out <dir>]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { validateBlueprint, acceptableBlueprint } from './storyBlueprint.mjs'
import { compilePlan, compileChanges, COMPILER_VERSION } from './storyPlanCompiler.mjs'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const inPath = arg('in')
if (!inPath) { console.error('usage: node plan-compile-test.mjs --in <bakeoff.json> [--out <dir>]'); process.exit(1) }

const run = JSON.parse(readFileSync(inPath, 'utf8'))
const { manifest, required } = run
const check = (bp) => (bp ? validateBlueprint(bp, { manifest, requiredTargets: required }) : { ok: false, failures: [{ code: 'unparseable', message: 'no plan' }] })
const codes = (v) => (v.failures || []).map(f => f.code)

const rows = []
for (const c of run.candidates) {
  const before = check(c.blueprint)
  const { blueprint, derived, misses } = compilePlan(c.blueprint)
  const after = check(blueprint)
  // The compiler is only allowed to move structure. If it ever touched the
  // story, the whole experiment is void and says so rather than reporting a
  // number it cannot stand behind.
  const rewrote = c.blueprint ? compileChanges(c.blueprint, blueprint) : []
  const qualityOk = acceptableBlueprint(c.score)
  rows.push({
    label: c.label || '-',
    model: c.model,
    before: { ok: before.ok, codes: codes(before) },
    after: { ok: after.ok, codes: codes(after) },
    qualityOk,
    jointBefore: Boolean(before.ok && qualityOk),
    jointAfter: Boolean(after.ok && qualityOk),
    derived,
    misses,
    rewrote,
  })
}

const violation = rows.filter(r => r.rewrote.length)
if (violation.length) {
  console.error('COMPILER REWROTE THE STORY on ' + violation.length + ' plan(s): ' + violation.map(r => r.label + ' [' + r.rewrote.join(', ') + ']').join('; '))
  console.error('The experiment is void — a compiler that edits meaning is not a compiler.')
  process.exit(2)
}

const pad = (v, n) => String(v).padEnd(n)
console.log('\ncompiler ' + COMPILER_VERSION + ' over ' + inPath + '\n')
console.log(pad('lbl', 4) + pad('model', 9) + pad('struct→', 16) + pad('quality', 9) + pad('JOINT→', 14) + 'what changed')
for (const r of rows) {
  const arrow = (r.before.ok ? 'PASS' : 'fail') + ' → ' + (r.after.ok ? 'PASS' : 'fail')
  const joint = (r.jointBefore ? 'YES' : 'no') + ' → ' + (r.jointAfter ? 'YES' : 'no')
  const note = r.derived.length ? r.derived.map(d => 'b' + d.beat + '.' + d.field + '←' + d.from).join(' ') : '—'
  console.log(pad(r.label, 4) + pad(r.model.includes('qwen') ? 'qwen' : 'gpt-oss', 9) + pad(arrow, 16)
    + pad(r.qualityOk ? 'PASS' : 'fail', 9) + pad(joint, 14) + note)
  if (r.after.codes.length) console.log('     still failing: ' + r.after.codes.join(', '))
  for (const m of r.misses) console.log('     miss: beat ' + m.beat + ' ' + m.field + ' — ' + m.reason)
}

const rates = {}
for (const r of rows) {
  const m = rates[r.model] || (rates[r.model] = { n: 0, structBefore: 0, structAfter: 0, quality: 0, jointBefore: 0, jointAfter: 0 })
  m.n += 1
  if (r.before.ok) m.structBefore += 1
  if (r.after.ok) m.structAfter += 1
  if (r.qualityOk) m.quality += 1
  if (r.jointBefore) m.jointBefore += 1
  if (r.jointAfter) m.jointAfter += 1
}
console.log('')
for (const [model, m] of Object.entries(rates)) {
  console.log(model)
  console.log('  structural ' + m.structBefore + '/' + m.n + ' → ' + m.structAfter + '/' + m.n
    + '   quality ' + m.quality + '/' + m.n
    + '   JOINT ' + m.jointBefore + '/' + m.n + ' → ' + m.jointAfter + '/' + m.n)
}

const outDir = arg('out')
if (outDir) {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outDir + '/compile.json', JSON.stringify({ compiler: COMPILER_VERSION, source: inPath, rates, rows }, null, 2))
  console.log('\nwrote ' + outDir + '/compile.json')
}
