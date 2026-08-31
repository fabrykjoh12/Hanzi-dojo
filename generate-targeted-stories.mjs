// Targeted story generation — the FAB-9/FAB-10 pipeline runner (2026-08-31).
//
//   coverage → target manifest → prompt → candidate → deterministic validation
//   → bounded repair/regenerate → accepted candidate FILE
//
// It writes files and nothing else. There is no Supabase client in this script,
// on purpose and asserted by a spec: a generator that could publish would make
// every other safeguard advisory. The corpus arrives as a dump file from
// dump-story-corpus.mjs, and accepted candidates land under
// data/story-candidates/<batch>/ for a human to review. Staging into the
// database is a separate, deliberate step that does not exist yet.
//
// The CLI is fixed by the workflows already on main (story-pilot.yml,
// llm-bench.yml), which invoke it as:
//
//   node generate-targeted-stories.mjs --input reports/story-corpus-dump.json \
//     --level 3 --count 4 --batch <id> --provider premium [--model <id>]
//
// What is DIFFERENT from generate-serial-stories.mjs, and why:
//   - the words are chosen from measured coverage need, not from the next slice
//     of sort_order, and the manifest records why each one was chosen;
//   - acceptance is deterministic. There is no model scoring its own prose:
//     a candidate passes when a program says every requirement is met;
//   - nothing is published, and a failed candidate is recorded as failed rather
//     than inserted unpublished.

import OpenAI from 'openai'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { providerChain } from './llmProviders.mjs'
import { buildCoverageReport, publishedChineseStories } from './storyCoverage.mjs'
import { selectTargets, buildManifest, manifestId } from './storyTargetManifest.mjs'
import { validateCandidate, formatValidation } from './storyCandidateValidation.mjs'
import {
  planBatch, nextAction, diagnosticSignature, repairBrief, candidateFile,
  candidateRecord, summarizeBatch, ACTION, DEFAULT_MAX_ATTEMPTS,
} from './storyBatchState.mjs'
import { levelConfig } from './storyLevels.mjs'

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 && args[i + 1] ? args[i + 1] : def }

const input = arg('input', 'reports/story-corpus-dump.json')
const level = parseInt(arg('level', '3'), 10)
const count = parseInt(arg('count', '4'), 10)
const batch = arg('batch', null)
const provider = arg('provider', 'premium')
const modelOverride = arg('model', null)
const targetsPer = parseInt(arg('targets', '5'), 10)
const maxAttempts = parseInt(arg('max-attempts', String(DEFAULT_MAX_ATTEMPTS)), 10)
const requested = (arg('words', '') || '').split(/[,、\s]+/).filter(Boolean)
const dryRun = args.includes('--dry-run')

if (!batch || !/^[A-Za-z0-9_-]+$/.test(batch)) {
  console.error('--batch <id> is required (letters, digits, - and _ only)')
  process.exit(2)
}
if (!Number.isInteger(level) || level < 1 || level > 9) { console.error('--level must be 1-9'); process.exit(2) }
if (!Number.isInteger(count) || count < 1) { console.error('--count must be a positive integer'); process.exit(2) }

const OUT_ROOT = 'data/story-candidates'
const outDir = path.join(OUT_ROOT, batch)

if (!existsSync(input)) {
  console.error('corpus dump not found: ' + input + ' — run dump-story-corpus.mjs first')
  process.exit(2)
}
const dump = JSON.parse(readFileSync(input, 'utf8'))
const vocabRows = dump.vocabulary || []
const storyRows = dump.stories || []
if (!vocabRows.length) { console.error(input + ': no vocabulary in the dump'); process.exit(2) }

const cfg = levelConfig('chinese', 'hsk_3', level)
if (!cfg) { console.error('no level config for HSK ' + level + ' in storyLevels.mjs'); process.exit(2) }
// The tier decides shape only (line counts, line length). Targets come from
// coverage, so the tier's own sort_order window is not used for selection.
const tier = cfg.tiers[0]

// ── what the corpus needs ────────────────────────────────────────────────────
// buildCoverageReport is the canonical exposure measurement: it counts a word
// as present only when the Reader's own engine resolves it, so "under-covered"
// here means the same thing it means in the coverage audit.
const published = publishedChineseStories(storyRows)
const report = buildCoverageReport({ stories: published, vocab: vocabRows })
const vocabMap = {}
for (const v of vocabRows) if (v && v.word && !vocabMap[v.word]) vocabMap[v.word] = v
const pool = vocabRows.filter(v => Number.isFinite(v.level) && v.level <= level)
// Hundreds of words tie at zero exposure, so the frequency rank the course
// already uses breaks the tie — most useful words first, per the product's own
// vocabulary rule. buildCoverageReport does not carry sort_order, so it is
// joined back on here rather than measured a second time.
const wordsWithFrequency = report.words.map(w => ({
  ...w,
  sortOrder: (vocabMap[w.word] || {}).sort_order,
}))

// ── the manifests ────────────────────────────────────────────────────────────
const manifests = []
const used = []
for (let i = 0; i < count; i += 1) {
  // Requested words go to the FIRST manifest only: spreading them would mean
  // several stories quietly targeting the same word.
  const targets = selectTargets({
    words: wordsWithFrequency,
    level,
    count: targetsPer,
    requested: i === 0 ? requested : [],
    exclude: used,
  })
  if (!targets.length) { console.log('no further targets available at HSK ' + level); break }
  used.push(...targets.map(t => t.word))
  const withRows = targets.map(t => ({
    ...t,
    reading: (vocabMap[t.word] || {}).reading || null,
    meaning: (vocabMap[t.word] || {}).meaning || null,
  }))
  manifests.push(buildManifest({
    id: manifestId({ level, index: i + 1, targets: withRows }),
    batch,
    level,
    levelName: cfg.levelName,
    tier: tier.tier,
    targets: withRows,
    poolSize: pool.length,
    poolSource: input,
    format: {
      lines: tier.lines,
      maxLineChars: cfg.maxLineChars,
      speakers: cfg.bible.speakers,
      titleChars: [1, 12],
    },
    maxOutOfBandDistinct: tier.maxMisses != null ? Math.min(tier.maxMisses, 6) : 3,
  }))
}

console.log('[targeted] batch=' + batch + ' level=' + level + ' manifests=' + manifests.length
  + ' pool=' + pool.length + ' corpus=' + published.length + ' published stories')
for (const m of manifests) {
  console.log('  ' + m.id + ': ' + m.required.map(t => t.word + '(' + t.cohort + ')').join(' '))
}

mkdirSync(outDir, { recursive: true })
for (const m of manifests) {
  writeFileSync(path.join(outDir, m.id + '.manifest.json'), JSON.stringify(m, null, 1) + '\n')
}
if (dryRun) {
  console.log('--dry-run: manifests written, nothing generated')
  process.exit(0)
}

// ── resume ───────────────────────────────────────────────────────────────────
const existing = {}
for (const file of (existsSync(outDir) ? readdirSync(outDir) : [])) {
  if (!file.endsWith('.json') || file.endsWith('.manifest.json') || file === 'batch-report.json') continue
  try {
    const rec = JSON.parse(readFileSync(path.join(outDir, file), 'utf8'))
    if (rec && rec.manifest && rec.manifest.id) existing[rec.manifest.id] = rec
  } catch { /* an unreadable record is treated as absent and regenerated */ }
}
const { todo, done } = planBatch({ manifests, existing })
if (done.length) console.log('[resume] ' + done.length + ' candidate(s) already accepted — not regenerating')

// ── the writer ───────────────────────────────────────────────────────────────
// Reasoning models spend hidden tokens out of max_tokens. Two measured cases
// (docs/BACKLOG.md, 2026-08-21): qwen3 spends its whole budget thinking unless
// effort is 'none', and gpt-oss needs 'low' to leave room for the story.
function reasoningEffortFor(model) {
  const m = String(model || '')
  if (m.includes('qwen')) return 'none'
  if (m.includes('gpt-oss')) return 'low'
  return null
}

async function makeWriter() {
  if (provider === 'premium') {
    const { premiumLlm } = await import('./llm.mjs')
    const p = premiumLlm()
    return { client: p.client, model: modelOverride || p.model, provider: p.provider }
  }
  const entry = providerChain(process.env).find(c => c.provider === provider)
  if (!entry) {
    console.error('provider "' + provider + '" has no key in this environment')
    process.exit(2)
  }
  return {
    client: new OpenAI({ apiKey: entry.apiKey, baseURL: entry.baseURL, timeout: 120000, maxRetries: 2 }),
    model: modelOverride || entry.model,
    provider: entry.provider,
  }
}
const writer = await makeWriter()
console.log('[targeted] provider=' + writer.provider + ' model=' + writer.model)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Plain text, never JSON: multi-line CJK prose in a JSON string is where the
// serial pipeline lost hours to unescaped newlines and quotes.
const FORMAT =
  'Output format — plain text, NOT JSON, no markdown, no quotes around lines:\n' +
  'First line exactly: TITLE: <short title, 2-6 characters>\n' +
  'Then each story line on its OWN line — nothing else (no numbering, no blank lines).'

function parseCandidate(text) {
  const raw = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  let title = ''
  const lines = []
  for (const line of raw) {
    const up = line.toUpperCase()
    if (!title && (up.startsWith('TITLE:') || up.startsWith('TITLE：'))) {
      const ci = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：')
      title = line.slice(ci + 1).trim()
      continue
    }
    lines.push(line)
  }
  if (!lines.length) return null
  return { title: title || null, content: lines.join('\n'), level }
}

function poolForPrompt(m) {
  const listed = pool.length <= 280 ? pool : pool.slice(0, 280)
  return listed.map(v => v.word + ' (' + v.meaning + ')').join(', ')
}

function draftPrompt(m) {
  const [minL, maxL] = m.limits.lines
  return 'Write a short ' + m.levelName + ' Chinese graded-reader story.\n\n' +
    'Characters (use these, keep their voices):\n' + cfg.bible.text + '\n\n' +
    'REQUIRED WORDS — every one must appear, used naturally, at least the stated number of times:\n' +
    m.required.map(t => t.word + ' (' + (t.meaning || '') + ') ×' + t.minOccurrences).join('\n') + '\n\n' +
    'Use them because the story needs them, NOT by naming them in a list or bending a sentence around them. ' +
    'A word used once in a sentence that means something beats a word used five times in sentences that do not. ' +
    'Do not use any required word more than ' + m.limits.maxOccurrencesPerTarget + ' times.\n\n' +
    'ALLOWED VOCABULARY — build the text from these words plus the characters\' names and basic grammar:\n' +
    poolForPrompt(m) + '\n\n' +
    'Rules:\n' +
    '- ' + minL + '-' + maxL + ' lines, one sentence or dialogue turn per line\n' +
    '- At most ' + m.limits.maxLineChars + ' characters per line\n' +
    '- Dialogue format: NAME：text — speakers ONLY from: ' + m.format.speakers.join(', ') + '\n' +
    '- Narration lines have no speaker prefix\n' +
    '- At most ' + m.limits.maxOutOfBandDistinct + ' distinct words from outside the allowed list\n' +
    '- A real story: someone wants something, something gets in the way, it resolves. Concrete and physical.\n' +
    '- Natural Chinese a person would enjoy reading — not a vocabulary drill\n\n' +
    FORMAT
}

function repairPrompt(m, candidate, validation) {
  return 'This ' + m.levelName + ' Chinese graded-reader story is close, but it breaks its constraints. ' +
    'Fix ONLY what is listed and keep everything else — the plot, the voices, the sentences that already work.\n\n' +
    'Fix these:\n- ' + repairBrief(validation).join('\n- ') + '\n\n' +
    'Story:\n' + candidate.content + '\n\n' +
    'ALLOWED VOCABULARY (plus the characters\' names and basic grammar):\n' + poolForPrompt(m) + '\n\n' +
    'Keep ' + m.limits.lines[0] + '-' + m.limits.lines[1] + ' lines, at most ' + m.limits.maxLineChars +
    ' characters per line, speakers only from: ' + m.format.speakers.join(', ') + '\n\n' + FORMAT
}

async function callModel(prompt, budget) {
  const params = {
    model: writer.model,
    max_tokens: budget,
    messages: [{ role: 'user', content: prompt }],
  }
  const effort = reasoningEffortFor(writer.model)
  if (effort) params.reasoning_effort = effort
  const response = await writer.client.chat.completions.create(params)
  const choice = response && response.choices && response.choices[0]
  let text = choice && choice.message && choice.message.content
  if (Array.isArray(text)) text = text.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('empty response (finish_reason=' + (choice && choice.finish_reason) + ')')
  }
  return text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '')
}

// One bounded retry ladder around transport failures, kept separate from the
// VALIDATION loop: a 429 is the provider refusing, not the story being wrong,
// and conflating the two would burn generation attempts on infrastructure.
async function callWithBackoff(prompt, budget, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callModel(prompt, budget)
    } catch (err) {
      const message = String((err && err.message) || err)
      if (attempt >= 3) throw new Error(label + ': ' + message)
      const wait = Math.min(10 * Math.pow(2, attempt), 60)
      process.stdout.write('(' + label + ' retry ' + wait + 's: ' + message.slice(0, 70) + ') ')
      await sleep(wait * 1000)
    }
  }
}

// ── the loop ─────────────────────────────────────────────────────────────────
// Accepted candidates are corpus for everything generated after them, so a
// batch cannot accept two near-copies of the same story.
const corpus = published.map(s => ({ id: s.id, title: s.title, content: s.content }))
for (const rec of done) if (rec.candidate) corpus.push({ id: rec.manifest.id, title: rec.candidate.title, content: rec.candidate.content })

const records = [...done]
for (const item of todo) {
  const m = item.manifest
  process.stdout.write(m.id + ': ')
  let attempts = item.attemptsUsed
  const history = []
  let candidate = null
  let validation = null
  let outcome = ACTION.GIVE_UP

  try {
    for (;;) {
      const prompt = candidate ? repairPrompt(m, candidate, validation) : draftPrompt(m)
      process.stdout.write(candidate ? 'repair... ' : 'draft... ')
      const text = await callWithBackoff(prompt, m.outputBudget, candidate ? 'repair' : 'draft')
      attempts += 1
      const parsed = parseCandidate(text)
      validation = validateCandidate(parsed, { manifest: m, vocabMap, corpus })
      const decision = nextAction({ validation, attemptsUsed: attempts, history, maxAttempts })
      outcome = decision.action
      if (decision.action === ACTION.ACCEPT) { candidate = parsed; break }
      history.push(diagnosticSignature(validation))
      if (decision.action === ACTION.GIVE_UP) { candidate = parsed; break }
      // REPAIR keeps the draft and edits it; REGENERATE throws it away.
      candidate = decision.action === ACTION.REPAIR ? parsed : null
      if (decision.action === ACTION.REGENERATE) validation = null
      await sleep(1200)
    }
  } catch (err) {
    console.log('FAILED: ' + ((err && err.message) || err))
    outcome = ACTION.GIVE_UP
  }

  const record = candidateRecord({ manifest: m, candidate, validation, attempts, history, outcome })
  writeFileSync(path.join(outDir, candidateFile(m.id)), JSON.stringify(record, null, 1) + '\n')
  records.push(record)
  if (record.accepted && candidate) {
    corpus.push({ id: m.id, title: candidate.title, content: candidate.content })
    console.log('ACCEPTED after ' + attempts + ' attempt(s) — "' + candidate.title + '"')
  } else {
    console.log('REJECTED after ' + attempts + ' attempt(s)')
    if (validation) console.log(formatValidation(validation).split('\n').slice(1).join('\n'))
  }
}

const summary = summarizeBatch(records)
writeFileSync(path.join(outDir, 'batch-report.json'), JSON.stringify(summary, null, 1) + '\n')
console.log('\n' + summary.accepted + ' accepted, ' + summary.rejected + ' rejected, '
  + summary.attempts + ' generation attempts. Candidates are FILES in ' + outDir + ' — nothing was published.')
// A batch that accepted nothing is not a crash: the files record why, and the
// exit code stays 0 so the workflow still commits them for review.
