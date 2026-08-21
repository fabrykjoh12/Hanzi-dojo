import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  stageableCandidates,
  buildStoryRow,
  buildGenerationMeta,
  titleKey,
  CANDIDATE_FILE_SCHEMA,
} from './storyStaging.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const manifest = buildManifest({
  batchId: 'b1', seq: 1, level: 3,
  targets: ['护照', '邻居'],
  defaults: { lines: [6, 20] },
})

const file = (over = {}) => ({
  schema: CANDIDATE_FILE_SCHEMA,
  batchId: 'b1',
  generatedAt: '2026-08-20T12:00:00Z',
  provider: { name: 'fake', model: 'scripted' },
  manifest,
  candidate: {
    manifestId: manifest.id,
    status: 'accepted',
    title: '去旅行',
    content: '第一行。\n第二行。',
    englishContent: 'one\ntwo',
    attempts: 1,
    calls: 3,
    critique: { score: 8, feedback: 'good' },
    generatorVersion: 'fab9-pipeline@1',
    promptVersion: 'fab9-prompts@1',
    validation: {
      validatorVersion: 'fab10-validator@1',
      verdict: 'PASS',
      failures: [],
      warnings: [],
      metrics: { targetCounts: { 护照: 2, 邻居: 3 } },
    },
  },
  staged: null,
  ...over,
})

describe('stageableCandidates — the ingestion gate', () => {
  it('accepts only accepted + PASS candidates', () => {
    const { stageable, refused } = stageableCandidates([file()])
    expect(stageable.length).toBe(1)
    expect(refused).toEqual([])
  })

  it('refuses a rejected candidate even if its verdict somehow says PASS', () => {
    const f = file()
    f.candidate = { ...f.candidate, status: 'rejected' }
    const { stageable, refused } = stageableCandidates([f])
    expect(stageable.length).toBe(0)
    expect(refused[0].reason).toContain('"rejected"')
  })

  it('refuses a FAIL verdict — validation failure prevents ingestion', () => {
    const f = file()
    f.candidate = { ...f.candidate, validation: { ...f.candidate.validation, verdict: 'FAIL' } }
    const { refused } = stageableCandidates([f])
    expect(refused[0].reason).toContain('FAIL')
  })

  it('refuses a REVIEW_REQUIRED candidate — the experimental difficulty band is never auto-stageable', () => {
    const f = file()
    f.candidate = {
      ...f.candidate,
      status: 'review_required',
      validation: { ...f.candidate.validation, verdict: 'REVIEW_REQUIRED', reviews: [{ code: 'out_of_level_share_review' }] },
    }
    const { stageable, refused } = stageableCandidates([f])
    expect(stageable.length).toBe(0)
    expect(refused[0].reason).toContain('REVIEW_REQUIRED')
    expect(refused[0].reason).toContain('human review')
  })

  it('refuses an already-staged candidate (idempotence)', () => {
    const f = file({ staged: { storyId: 'abc-123', stagedAt: 'x' } })
    const { refused } = stageableCandidates([f])
    expect(refused[0].reason).toContain('already staged')
  })

  it('refuses unknown file schemas, broken manifests and empty content', () => {
    const wrongSchema = file({ schema: 'nope' })
    const noContent = file()
    noContent.candidate = { ...noContent.candidate, content: '  ' }
    const badManifest = file({ manifest: { schema: 'nope' } })
    const { stageable, refused } = stageableCandidates([wrongSchema, noContent, badManifest])
    expect(stageable.length).toBe(0)
    expect(refused.length).toBe(3)
  })

  it('refuses a title that already exists at the level', () => {
    const f = file()
    const existing = new Set([titleKey(f.manifest, f.candidate)])
    const { refused } = stageableCandidates([f], { existingTitles: existing })
    expect(refused[0].reason).toContain('already exists')
  })
})

describe('buildStoryRow — what actually lands in the table', () => {
  it('is always held (is_published false) with full provenance', () => {
    const row = buildStoryRow(file(), { storyNumber: 42, stagedAt: '2026-08-20T13:00:00Z' })
    expect(row.is_published).toBe(false)
    expect(row.language).toBe('chinese')
    expect(row.level).toBe(3)
    expect(row.story_number).toBe(42)
    expect(row.tier).toBe(1)
    expect(row.title).toBe('去旅行')
    expect(row.english_content).toBe('one\ntwo')
    const meta = row.generation_meta
    expect(meta.schema).toBe('generation-meta@1')
    expect(meta.batchId).toBe('b1')
    expect(meta.manifestId).toBe(manifest.id)
    expect(meta.generatorVersion).toBe('fab9-pipeline@1')
    expect(meta.promptVersion).toBe('fab9-prompts@1')
    expect(meta.validatorVersion).toBe('fab10-validator@1')
    expect(meta.provider).toBe('fake')
    expect(meta.model).toBe('scripted')
    expect(meta.stagedAt).toBe('2026-08-20T13:00:00Z')
    expect(meta.critiqueScore).toBe(8)
    expect(meta.targets).toEqual([
      { word: '护照', min: 2, max: 4, occurrences: 2 },
      { word: '邻居', min: 2, max: 4, occurrences: 3 },
    ])
  })

  it('a missing translation stages as null english_content', () => {
    const f = file()
    f.candidate = { ...f.candidate, englishContent: null }
    const row = buildStoryRow(f, { storyNumber: 1 })
    expect(row.english_content).toBeNull()
  })

  it('generation_meta survives JSON round-trips (it is a jsonb column)', () => {
    const meta = buildGenerationMeta(file(), { stagedAt: 'now' })
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta)
  })
})

// The FAB-10 safety boundary, enforced as a spec: generation must have no
// Supabase capability — stage-story-candidates.mjs is the ONLY door into the
// database. If one of these files ever grows a supabase-js import, this test
// is the tripwire, not a code reviewer's eye.
describe('generation/DB boundary', () => {
  const GENERATION_SIDE = [
    'generate-targeted-stories.mjs',
    'storyGenPipeline.mjs',
    'storyGenPrompts.mjs',
    'storyCandidateValidation.mjs',
    'storyCoveragePlanner.mjs',
    'storyManifestPlanner.mjs',
    'storyCorpusCalibration.mjs',
    'storyStaging.mjs',
  ]
  it('generation-side files never import the Supabase client', () => {
    for (const name of GENERATION_SIDE) {
      const src = readFileSync(new URL('./' + name, import.meta.url), 'utf8')
      expect(src.includes('@supabase/supabase-js'), name + ' must not import supabase-js').toBe(false)
      expect(src.includes('createClient'), name + ' must not create a Supabase client').toBe(false)
    }
  })
  it('the staging tool is the one place with both the client and the gate', () => {
    const src = readFileSync(new URL('./stage-story-candidates.mjs', import.meta.url), 'utf8')
    expect(src.includes('@supabase/supabase-js')).toBe(true)
    expect(src.includes('stageableCandidates')).toBe(true)
    expect(src.includes('validateCandidate')).toBe(true)       // live re-validation
    expect(src.includes('is_published: true')).toBe(false)     // staging can never publish
  })
})
