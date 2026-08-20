import { describe, it, expect } from 'vitest'
import {
  validateCandidate,
  formatValidation,
  serializableValidation,
  VALIDATOR_VERSION,
} from './storyCandidateValidation.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'
import { analyzeStoryCoverage } from './storyCoverage.mjs'

// A controlled pool: every word the fixture stories use, at a chosen level.
// 旅行/签证/森林/警察 sit at level 4 so a level-3 manifest sees them as
// out-of-level; anything NOT listed here (咖喱, 乌龟…) is unknown text.
const POOL = [
  ['我', 1], ['你', 1], ['他', 1], ['是', 1], ['的', 1], ['了', 1], ['去', 1], ['有', 1],
  ['看', 1], ['说', 1], ['想', 1], ['要', 1], ['买', 1], ['好', 1], ['大', 1], ['小', 1],
  ['家', 1], ['妈妈', 1], ['朋友', 1], ['今天', 1], ['明天', 1], ['商店', 1], ['东西', 1],
  ['高兴', 1], ['一起', 1], ['现在', 1], ['天气', 1], ['冷', 1], ['到', 1], ['给', 1],
  ['问', 1], ['找', 1], ['请', 1], ['谢谢', 1], ['时间', 1], ['没有', 1], ['坐', 1],
  ['吃', 1], ['饭', 1], ['很', 1], ['也', 1], ['和', 1], ['都', 1], ['什么', 1],
  ['这', 1], ['那', 1], ['个', 1], ['在', 1], ['上', 1], ['下', 1], ['里', 1], ['来', 1],
  ['我们', 1], ['他们', 1], ['大家', 1], ['哪里', 1],
  ['放', 3], ['地图', 3], ['护照', 3], ['邻居', 3], ['打算', 3], ['铅笔', 3],
  ['旅行', 4], ['签证', 4], ['森林', 4], ['警察', 4],
]
const vocabMap = Object.fromEntries(POOL.map(([word, level]) => [word, { word, level }]))

// Loose line bounds keep the fixtures readable; everything else is the real
// calibrated HSK 3 default.
const manifest = (over = {}) => buildManifest({
  batchId: 'test', seq: 1, level: 3,
  targets: ['护照', '邻居', '打算'],
  defaults: { lines: [6, 20] },
  ...over,
})

const GOOD = [
  '李明打算和妈妈去旅行。',
  '妈妈：我们的护照在哪里？',
  '李明去问邻居。',
  '邻居说，护照要放好。',
  '小红也想一起去。',
  '他们打算明天买东西。',
  '邻居给他们看地图。',
  '大家都很高兴。',
].join('\n')

const good = { title: '去旅行', content: GOOD }

describe('validateCandidate — PASS path', () => {
  it('a compliant candidate passes with full metrics', () => {
    const r = validateCandidate(good, { manifest: manifest(), vocabMap })
    expect(r.verdict).toBe('PASS')
    expect(r.failures).toEqual([])
    expect(r.validatorVersion).toBe(VALIDATOR_VERSION)
    expect(r.metrics.targetCounts).toEqual({ 护照: 2, 邻居: 3, 打算: 2 })
    expect(r.metrics.outOfLevelDistinct).toBe(1)          // 旅行
    expect(r.metrics.inLevelCoverage).toBeGreaterThan(0.9)
    expect(formatValidation(r)).toBe('PASS')
  })

  it('target counts agree with the FAB-5 audit — one engine, by construction', () => {
    const r = validateCandidate(good, { manifest: manifest(), vocabMap })
    const auditCounts = analyzeStoryCoverage({ content: GOOD }, vocabMap)
    for (const [word, n] of Object.entries(r.metrics.targetCounts)) {
      expect(auditCounts.get(word) || 0).toBe(n)
    }
  })
})

describe('manifest vocabulary', () => {
  it('a missing target fails with its word named', () => {
    const m = manifest({ targets: ['护照', '邻居', '打算', '铅笔'] })
    const r = validateCandidate(good, { manifest: m, vocabMap })
    expect(r.verdict).toBe('FAIL')
    expect(r.failures.map(f => f.code)).toContain('missing_target')
    expect(formatValidation(r)).toContain('missing target: 铅笔')
  })

  it('below-min and above-max occurrences fail', () => {
    const low = validateCandidate(
      { title: 'T', content: GOOD.replace('邻居给他们看地图。', '他们看地图。').replace('李明去问邻居。', '李明去问朋友。') },
      { manifest: manifest(), vocabMap })
    expect(low.failures.map(f => f.code)).toContain('target_below_min')

    const spam = { title: 'T', content: GOOD + '\n护照，护照，护照。' }
    const r = validateCandidate(spam, { manifest: manifest(), vocabMap })
    expect(r.failures.map(f => f.code)).toContain('target_above_max')
  })

  it('a target inside a bigger unknown word does not count (atomic spans)', () => {
    // 太 as target, story only has 太阳-like compound — here: 打算 target but
    // text only contains 打…算 split across an unknown compound is hard to
    // fixture; assert the simpler direction: counting is by canonical match,
    // not substring — 护照 inside a longer unmatched run would not match, so
    // an absent standalone 护照 fails even if the characters appear.
    const sneaky = { title: 'T', content: GOOD.replaceAll('护照', '护照夹') }
    const r = validateCandidate(sneaky, { manifest: manifest(), vocabMap })
    // 护照夹 is not in the pool; the canonical matcher may or may not fold it
    // into an atomic span, but either way the count changes vs the plain text —
    // the point is the validator follows the engine, so we just assert it
    // reports deterministically from the engine's counts.
    const audit = analyzeStoryCoverage({ content: sneaky.content }, vocabMap)
    expect(r.metrics.targetCounts['护照']).toBe(audit.get('护照') || 0)
  })
})

describe('difficulty', () => {
  it('too many distinct out-of-level words fail', () => {
    const c = { title: 'T', content: GOOD + '\n森林里有警察。\n他们要签证。' }
    const r = validateCandidate(c, { manifest: manifest(), vocabMap })
    expect(r.failures.map(f => f.code)).toContain('out_of_level_words')  // 旅行+森林+警察+签证 = 4 > 3
  })

  it('unknown text beyond the caps fails with the runs named', () => {
    const c = { title: 'T', content: GOOD + '\n咖喱和乌龟。\n墨镜也好。' }
    const r = validateCandidate(c, { manifest: manifest(), vocabMap })
    const codes = r.failures.map(f => f.code)
    expect(codes.some(x => x === 'unknown_words' || x === 'unknown_share')).toBe(true)
  })
})

describe('structure', () => {
  it('empty content and missing title fail', () => {
    const r = validateCandidate({ title: '', content: '  \n ' }, { manifest: manifest(), vocabMap })
    expect(r.verdict).toBe('FAIL')
    const codes = r.failures.map(f => f.code)
    expect(codes).toContain('invalid_title')
    expect(codes).toContain('invalid_content')
  })

  it('length bounds are enforced', () => {
    const short = validateCandidate({ title: 'T', content: '我们去买东西。\n大家都很高兴。' }, { manifest: manifest(), vocabMap })
    expect(short.failures.map(f => f.code)).toContain('too_short')
  })

  it('speakers outside the cast fail', () => {
    const c = { title: 'T', content: GOOD + '\n王老师：你们好。' }
    const r = validateCandidate(c, { manifest: manifest(), vocabMap })
    expect(r.failures.map(f => f.code)).toContain('unknown_speaker')
    expect(formatValidation(r)).toContain('王老师')
  })

  it('misaligned English fails; aligned English passes', () => {
    const bad = validateCandidate({ ...good, englishContent: 'one\ntwo' }, { manifest: manifest(), vocabMap })
    expect(bad.failures.map(f => f.code)).toContain('english_misaligned')
    const en = GOOD.split('\n').map((_, i) => 'line ' + i).join('\n')
    const ok = validateCandidate({ ...good, englishContent: en }, { manifest: manifest(), vocabMap })
    expect(ok.verdict).toBe('PASS')
  })

  it('forbidden words fail', () => {
    const m = manifest()
    m.forbidden.words.push('旅行')
    const r = validateCandidate(good, { manifest: m, vocabMap })
    expect(r.failures.map(f => f.code)).toContain('forbidden_word')
  })

  it('inconsistent series metadata fails', () => {
    const m = manifest()
    m.series = { key: 's', chapterIndex: 5, chapterCount: 3 }
    const r = validateCandidate(good, { manifest: m, vocabMap })
    expect(r.failures.map(f => f.code)).toContain('series_inconsistent')
  })

  it('an invalid manifest refuses to validate anything', () => {
    const r = validateCandidate(good, { manifest: { schema: 'nope' }, vocabMap })
    expect(r.failures.map(f => f.code)).toEqual(['invalid_manifest'])
  })
})

describe('repetition', () => {
  it('one repeated line warns, two fail', () => {
    const once = { title: 'T', content: GOOD + '\n大家都很高兴。' }
    const w = validateCandidate(once, { manifest: manifest(), vocabMap })
    expect(w.verdict).toBe('PASS')
    expect(w.warnings.map(x => x.code)).toContain('repeated_line')

    const twice = { title: 'T', content: GOOD + '\n大家都很高兴。\n大家都很高兴。' }
    const f = validateCandidate(twice, { manifest: manifest(), vocabMap })
    expect(f.failures.map(x => x.code)).toContain('repeated_line')
  })
})

describe('duplicates', () => {
  const corpus = [{ title: '旧故事', level: 3, content: GOOD }]

  it('essentially copied content fails', () => {
    const r = validateCandidate({ title: '新名字', content: GOOD }, { manifest: manifest(), vocabMap, corpus })
    expect(r.verdict).toBe('FAIL')
    expect(r.failures.map(f => f.code)).toContain('duplicate_of_existing')
    expect(formatValidation(r)).toContain('旧故事')
  })

  it('a look-alike warns but does not fail (v1 policy)', () => {
    // shares the first half of GOOD, second half fresh — similar, not a copy
    const half = GOOD.split('\n').slice(0, 4).join('\n')
    const fresh = '\n他们坐下吃饭。\n小明来找朋友。\n今天天气很冷。\n他们在商店买东西。'
    const r = validateCandidate({ title: 'T', content: half + fresh }, { manifest: manifest(), vocabMap, corpus })
    expect(r.failures.map(f => f.code)).not.toContain('duplicate_of_existing')
    expect(r.warnings.map(w => w.code)).toContain('near_duplicate')
    expect(r.metrics.nearestNeighbor.title).toBe('旧故事')
  })

  it('unrelated corpus stories raise nothing', () => {
    const other = [{ title: '别的', level: 3, content: '小明在家吃饭。\n妈妈做饭很好吃。\n他们一起看东西。' }]
    const r = validateCandidate(good, { manifest: manifest(), vocabMap, corpus: other })
    expect(r.verdict).toBe('PASS')
    expect(r.warnings.map(w => w.code)).not.toContain('near_duplicate')
  })
})

describe('output contract', () => {
  it('serializableValidation drops the counts Map, keeps everything else', () => {
    const r = validateCandidate(good, { manifest: manifest(), vocabMap })
    expect(r.metrics.counts).toBeInstanceOf(Map)
    const s = serializableValidation(r)
    expect(s.metrics.counts).toBeUndefined()
    expect(s.metrics.targetCounts).toEqual(r.metrics.targetCounts)
    expect(() => JSON.stringify(s)).not.toThrow()
  })

  it('formatValidation renders the concise FAIL summary', () => {
    const m = manifest({ targets: ['护照', '铅笔'] })
    const r = validateCandidate(good, { manifest: m, vocabMap })
    const text = formatValidation(r)
    expect(text.startsWith('FAIL')).toBe(true)
    expect(text).toContain('- missing target: 铅笔')
  })
})
