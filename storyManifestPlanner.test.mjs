import { describe, it, expect } from 'vitest'
import {
  MANIFEST_SCHEMA,
  MANIFEST_DEFAULTS,
  manifestDefaults,
  buildManifest,
  validateManifest,
  composeManifests,
} from './storyManifestPlanner.mjs'
import { buildCoveragePlan, selectTargets } from './storyCoveragePlanner.mjs'

const zeroWord = (word, level = 3) => ({ word, level, classification: 'zero', availableByLevel: { stories: 0 } })

describe('buildManifest / validateManifest', () => {
  it('builds a valid manifest with calibrated defaults', () => {
    const m = buildManifest({ batchId: 'b1', seq: 1, level: 3, targets: ['护照', '铅笔'] })
    expect(m.schema).toBe(MANIFEST_SCHEMA)
    expect(m.id).toBe('b1-L3-001')
    expect(m.targets).toEqual([
      { word: '护照', min: 2, max: 4 },
      { word: '铅笔', min: 2, max: 4 },
    ])
    expect(m.length.minLines).toBe(MANIFEST_DEFAULTS[3].lines[0])
    expect(m.length.maxLineChars).toBe(34)                    // HSK 3 config
    expect(m.speakers).toContain('李明')
    expect(validateManifest(m).ok).toBe(true)
  })

  it('per-target occurrence overrides survive', () => {
    const m = buildManifest({ batchId: 'b1', seq: 2, level: 3, targets: [{ word: '护照', min: 3, max: 6 }] })
    expect(m.targets[0]).toEqual({ word: '护照', min: 3, max: 6 })
  })

  it('rejects malformed manifests with specific problems', () => {
    const bad = buildManifest({ batchId: 'b1', seq: 3, level: 3, targets: ['护照', '护照'] })
    bad.forbidden.words.push('护照')
    const res = validateManifest(bad)
    expect(res.ok).toBe(false)
    expect(res.problems.join(' ')).toContain('duplicate target')
    expect(res.problems.join(' ')).toContain('target and forbidden')
    expect(validateManifest({ schema: 'nope' }).ok).toBe(false)
  })

  it('falls back to the HSK 3 shape for uncalibrated levels', () => {
    expect(manifestDefaults(9)).toEqual(MANIFEST_DEFAULTS[3])
  })
})

describe('composeManifests', () => {
  const words = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'].map(w => zeroWord(w))

  it('chunks deterministically, round-robin: every word once before any word twice', async () => {
    const plan = buildCoveragePlan({ words, level: 3 })
    const { manifests } = await composeManifests({
      batchId: 'b1', level: 3, plan, select: selectTargets, count: 3,
      defaults: { targetsPerStory: 4 },
    })
    expect(manifests.map(m => m.targets.map(t => t.word))).toEqual([
      ['一', '二', '三', '四'],
      ['五', '六', '七', '八'],
      // the goal is 2 stories per word (batchCap 2), so after everyone has one
      // manifest the highest-priority words legitimately start their second
      ['九', '十', '一', '二'],
    ])
    expect(new Set(manifests.map(m => m.seasonSeed)).size).toBe(3)   // rotating seeds
  })

  it('stops when the plan runs dry (batchCap exhausted)', async () => {
    const plan = buildCoveragePlan({ words: words.slice(0, 3), level: 3, batchCap: 1 })
    const { manifests } = await composeManifests({
      batchId: 'b1', level: 3, plan, select: selectTargets, count: 5,
      defaults: { targetsPerStory: 4 },
    })
    expect(manifests.length).toBe(1)
  })

  it('theme planner names themes and bounces incompatible words to the next manifest', async () => {
    const plan = buildCoveragePlan({ words, level: 3 })
    const { manifests } = await composeManifests({
      batchId: 'b1', level: 3, plan, select: selectTargets, count: 2,
      defaults: { targetsPerStory: 4 },
      themePlanner: async ({ targets }) => ({
        theme: 'market day',
        exclude: targets[0].word === '一' ? ['三'] : [],
      }),
    })
    expect(manifests[0].theme).toBe('market day')
    expect(manifests[0].targets.map(t => t.word)).toEqual(['一', '二', '四'])
    // the bounced word leads the NEXT manifest
    expect(manifests[1].targets.map(t => t.word)[0]).toBe('三')
  })

  it('the planner cannot starve a manifest: excludes are capped at half the group', async () => {
    const plan = buildCoveragePlan({ words, level: 3 })
    const { manifests } = await composeManifests({
      batchId: 'b1', level: 3, plan, select: selectTargets, count: 1,
      defaults: { targetsPerStory: 4 },
      themePlanner: async ({ targets }) => ({ exclude: targets.map(t => t.word) }),
    })
    expect(manifests[0].targets.length).toBe(2)   // 4 - capped 2, not 0
  })

  it('every composed manifest validates', async () => {
    const plan = buildCoveragePlan({ words, level: 3 })
    const { manifests } = await composeManifests({
      batchId: 'b1', level: 3, plan, select: selectTargets, count: 3,
      defaults: { targetsPerStory: 4 },
    })
    for (const m of manifests) expect(validateManifest(m).ok).toBe(true)
  })
})
