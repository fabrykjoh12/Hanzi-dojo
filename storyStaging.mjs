// Staging logic for generated story candidates (FAB-10) — the pure half of
// stage-story-candidates.mjs, which is the ONLY tool that moves a candidate
// into Supabase.
//
// The safety contract, enforced here and tested here:
//   - only candidate files whose stored status is 'accepted' AND whose stored
//     deterministic verdict is PASS are stageable; everything else is refused
//     with a reason (rejected candidates stay batch artifacts, never rows)
//   - a candidate that was already staged is refused (idempotence)
//   - a staged row is ALWAYS is_published=false — publication stays a separate
//     human step through the existing publish flow
//   - every staged row carries generation_meta provenance (batch, manifest,
//     versions, provider/model, attempts, targets) and never anything that
//     changes runtime behavior
//
// Pure: no Supabase, no fs, no clock — the CLI supplies rows, story numbers
// and timestamps.

import { validateManifest } from './storyManifestPlanner.mjs'

export const CANDIDATE_FILE_SCHEMA = 'story-candidate@1'

// Which candidate files may be staged. Returns { stageable, refused } where
// refused entries carry the reason a human can act on. `existingTitles` is a
// Set of language|level|title keys already in the stories table — the same
// duplicate guard the authored pipeline uses.
export function stageableCandidates(files, { existingTitles = new Set() } = {}) {
  const stageable = []
  const refused = []
  const refuse = (file, reason) => refused.push({ id: fileId(file), reason })
  for (const file of files || []) {
    if (!file || file.schema !== CANDIDATE_FILE_SCHEMA) { refuse(file, 'not a story-candidate@1 file'); continue }
    const m = file.manifest
    const c = file.candidate
    const mCheck = validateManifest(m)
    if (!mCheck.ok) { refuse(file, 'invalid manifest: ' + mCheck.problems.join('; ')); continue }
    if (!c) { refuse(file, 'no candidate record'); continue }
    if (file.staged && file.staged.storyId) { refuse(file, 'already staged as ' + file.staged.storyId); continue }
    if (c.status !== 'accepted') {
      refuse(file, c.status === 'review_required'
        ? 'candidate is REVIEW_REQUIRED (experimental difficulty band) — mandatory human review; never stageable automatically'
        : 'candidate status is "' + c.status + '", not "accepted"')
      continue
    }
    if (!c.validation || c.validation.verdict !== 'PASS') {
      refuse(file, 'stored deterministic verdict is ' + (c.validation ? c.validation.verdict : 'missing') + ', not PASS')
      continue
    }
    if (!String(c.content || '').trim() || !String(c.title || '').trim()) { refuse(file, 'empty title or content'); continue }
    if (existingTitles.has(titleKey(m, c))) { refuse(file, 'a story with this title already exists at this level'); continue }
    stageable.push(file)
  }
  return { stageable, refused }
}

export function fileId(file) {
  return (file && ((file.manifest && file.manifest.id) || file.batchId)) || '(unknown)'
}

export function titleKey(manifest, candidate) {
  return [manifest.language, manifest.level, candidate.title].join('|')
}

// The provenance recorded on the staged row — see migration
// 20260820120000_stories_generation_meta.sql. Everything a batch post-mortem
// needs; nothing the app reads.
export function buildGenerationMeta(file, { stagedAt } = {}) {
  const m = file.manifest
  const c = file.candidate
  return {
    schema: 'generation-meta@1',
    batchId: file.batchId,
    manifestId: m.id,
    generatorVersion: c.generatorVersion,
    promptVersion: c.promptVersion,
    validatorVersion: c.validation && c.validation.validatorVersion,
    provider: file.provider && file.provider.name,
    model: file.provider && file.provider.model,
    generatedAt: file.generatedAt,
    stagedAt: stagedAt || null,
    attempts: c.attempts,
    calls: c.calls,
    critiqueScore: (c.critique && c.critique.score) != null ? c.critique.score : null,
    targets: m.targets.map(t => ({
      word: t.word,
      min: t.min,
      max: t.max,
      occurrences: (c.validation.metrics && c.validation.metrics.targetCounts && c.validation.metrics.targetCounts[t.word]) || 0,
    })),
  }
}

// The stories row for one stageable candidate. is_published is hardcoded
// false — not a parameter, so no caller can stage-and-publish in one move.
// Tier 1 / tier_min_words 0 keeps a targeted standalone story visible to
// everyone at its level, like the existing standalone stories.
export function buildStoryRow(file, { storyNumber, stagedAt } = {}) {
  const m = file.manifest
  const c = file.candidate
  return {
    language: m.language,
    system: m.system,
    level: m.level,
    tier: 1,
    tier_min_words: 0,
    story_number: storyNumber,
    title: c.title,
    english_summary: null,
    content: c.content,
    english_content: c.englishContent || null,
    presentation: m.presentation || 'paced',
    is_published: false,
    generation_meta: buildGenerationMeta(file, { stagedAt }),
  }
}
