import { describe, it, expect } from 'vitest'
import {
  untappableRuns, classifyRun, auditCorpus, glossCoverage,
  publishable, publishabilityBlastRadius,
  DEFECT, VOCAB_AUDIT_VERSION,
} from './storyVocabAudit.mjs'

// Real rows, real defects. 没 exists only inside 没有/没关系; 缸 exists nowhere.
const mk = (o) => Object.fromEntries(Object.entries(o).map(([w, v]) => [w, { word: w, ...v }]))
const vocabMap = mk({
  我: { level: 1, meaning: 'I' }, 的: { level: 1, meaning: 'of' }, 是: { level: 1, meaning: 'to be' },
  书: { level: 1, meaning: 'book' }, 很: { level: 1, meaning: 'very' }, 好: { level: 1, meaning: 'good' },
  手机: { level: 1, meaning: 'cell phone' }, 电: { level: 3, meaning: 'lightning; electricity' },
  没有: { level: 1, meaning: 'to not have' }, 没关系: { level: 1, meaning: 'it does not matter' },
  中午: { level: 1, meaning: 'noon' }, 电话: { level: 1, meaning: 'telephone' },
  火车: { level: 1, meaning: 'train' },
  不见: { level: 3, meaning: 'not to see; not to meet' },
  被: { level: 3, meaning: 'quilt; to cover (with)' },
  朋友: { level: 1, meaning: 'friend' },
})

describe('untappableRuns — what a learner meets and cannot tap', () => {
  it('finds a character taught only inside a compound', () => {
    // 没 is in 没有 and 没关系, but 手机没电 needs it standalone.
    const runs = untappableRuns({ content: '手机没电。', vocabMap })
    expect([...runs.keys()]).toContain('没')
  })

  it('finds nothing in a line the matcher fully resolves', () => {
    expect(untappableRuns({ content: '我的书很好。', vocabMap }).size).toBe(0)
  })

  it('never reports punctuation as a run', () => {
    for (const run of untappableRuns({ content: '手机没电。我的书很好！', vocabMap }).keys()) {
      expect(run).not.toMatch(/[。，！？；：]/)
    }
  })

  it('counts every occurrence, not just distinct runs', () => {
    expect(untappableRuns({ content: '手机没电。\n手机没电。', vocabMap }).get('没')).toBe(2)
  })
})

describe('classifyRun — which layer owns the repair', () => {
  it('MORPHEME_OF_COMPOUND when the course only ever shows it inside a compound', () => {
    const r = classifyRun('没', { vocabMap })
    expect(r.defect).toBe(DEFECT.MORPHEME_OF_COMPOUND)
    // NOT an ingestion defect: the curriculum source does not list 没 as a
    // standalone word either. HSK 3.0 teaches 没有.
    expect(r.layer).not.toBe('ingestion')
    // The hosts are the evidence for the claim, checkable by a reader.
    expect(r.hosts).toEqual(expect.arrayContaining(['没有']))
    expect(r.hostLevel).toBe(1)
  })

  it('CURRICULUM_ROW_MISSING only when the curriculum source actually lists it', () => {
    // 转 is in data/hsk3-vocab-snapshot.json and absent from the database —
    // the one true ingestion loss in the whole published corpus.
    const r = classifyRun('转', { vocabMap, curriculum: new Set(['转']) })
    expect(r.defect).toBe(DEFECT.CURRICULUM_ROW_MISSING)
    expect(r.layer).toBe('ingestion')
  })

  it('without a curriculum authority the ingestion class cannot be claimed', () => {
    // The distinction between "the course lost this row" and "the course never
    // taught this word" is exactly what the curriculum source decides.
    expect(classifyRun('转', { vocabMap }).defect).not.toBe(DEFECT.CURRICULUM_ROW_MISSING)
  })

  it('OUT_OF_CURRICULUM when nothing in the vocabulary contains it', () => {
    const r = classifyRun('缸', { vocabMap })
    expect(r.defect).toBe(DEFECT.OUT_OF_CURRICULUM)
    expect(r.layer).toBe('story content')
    expect(r.hosts).toEqual([])
  })

  it('CANON_ENTITY when it is a person the reader\'s own name path knows', () => {
    const r = classifyRun('淑兰', { vocabMap, knownNames: ['淑兰'] })
    expect(r.defect).toBe(DEFECT.CANON_ENTITY)
  })

  it('a character that merely APPEARS in a name is not a name', () => {
    // 石 is "stone" and 火 is "fire"; both are substrings of names in the real
    // corpus, and containment classified 24 and 20 occurrences as names.
    expect(classifyRun('石', { vocabMap, knownNames: ['石头', '小石'] }).defect).not.toBe(DEFECT.CANON_ENTITY)
    expect(classifyRun('火', { vocabMap, knownNames: ['小火'] }).defect).toBe(DEFECT.MORPHEME_OF_COMPOUND)
  })

  it('SEGMENTATION when a multi-character run is two words glued together', () => {
    // 一张 is 一 + 张, both in the vocabulary; the run is the segmenter's, not
    // a word the learner failed to know.
    const vm = { ...vocabMap, 一: { word: '一', level: 1, meaning: 'one' }, 张: { word: '张', level: 4, meaning: 'classifier for flat objects' } }
    const r = classifyRun('一张', { vocabMap: vm })
    expect(r.defect).toBe(DEFECT.SEGMENTATION)
    expect(r.layer).toBe('segmentation')
  })

  it('names the LOWEST-level host, because that is what the learner met first', () => {
    expect(classifyRun('电', { vocabMap }).hosts[0]).toBe('电话')
  })

  it('MORPHEME_OF_COMPOUND is never evidence the learner knows the word', () => {
    // 火 is taught only inside 火车 ("train"). Knowing "train" does not teach
    // "fire", so this must never be repaired in the lexical evidence layer.
    const r = classifyRun('火', { vocabMap })
    expect(r.defect).toBe(DEFECT.MORPHEME_OF_COMPOUND)
    expect(r.hosts).toEqual(['火车'])
    expect(r.layer).not.toBe('lexical-evidence')
    expect(r.layer).not.toBe('ingestion')
  })
})

describe('auditCorpus', () => {
  const stories = [
    { id: 1, title: 'a', level: 1, content: '手机没电。\n我的书很好。' },
    { id: 2, title: 'b', level: 2, content: '手机没电。' },
  ]

  it('groups by defect class with occurrence counts', () => {
    const a = auditCorpus({ stories, vocabMap })
    expect(a.storiesAudited).toBe(2)
    const comp = a.summary.find(s => s.defect === DEFECT.MORPHEME_OF_COMPOUND)
    expect(comp.occurrences).toBeGreaterThanOrEqual(2)
  })

  it('reports how many stories each defect reaches, not just how often', () => {
    const row = auditCorpus({ stories, vocabMap }).rows.find(r => r.run === '没')
    expect(row.stories).toBe(2)
    expect(row.occurrences).toBe(2)
  })

  it('is versioned', () => {
    expect(VOCAB_AUDIT_VERSION).toBe('fab9-vocab-audit@2')
    expect(auditCorpus({ stories: [], vocabMap }).version).toBe(VOCAB_AUDIT_VERSION)
  })
})

// The narrow-gloss class is invisible to segmentation — the reader resolves 不见
// and 被 perfectly well. It only breaks the English-concept matcher, so it needs
// its own check, and that check is sense-level for the same reason everything
// else in this layer is: a word mentioned inside a long sense is not a sense.
describe('glossCoverage — a gloss too narrow for ordinary usage', () => {
  it('flags 不见: published stories say 苹果不见了, the gloss says "not to see"', () => {
    const r = glossCoverage('不见', { vocabMap, expectedSenses: ['gone', 'missing'] })
    expect(r.covered).toBe(false)
    expect(r.missing).toEqual(['gone', 'missing'])
    expect(r.layer).toBe('source-data')
  })

  it('flags 被: the gloss carries the quilt, not the passive marker', () => {
    const r = glossCoverage('被', { vocabMap, expectedSenses: ['by'] })
    expect(r.covered).toBe(false)
    expect(r.senses).toEqual(expect.arrayContaining(['quilt']))
  })

  it('passes a gloss that does carry the sense', () => {
    expect(glossCoverage('朋友', { vocabMap, expectedSenses: ['friend'] }).covered).toBe(true)
  })

  it('a sense that only MENTIONS the word does not count as covering it', () => {
    // 没关系 is glossed "it does not matter" — that mentions nothing headed by
    // "matter" as a sense of its own.
    const r = glossCoverage('没关系', { vocabMap, expectedSenses: ['matter'] })
    expect(r.covered).toBe(false)
  })

  it('says so plainly when there is no gloss at all', () => {
    expect(glossCoverage('缸', { vocabMap, expectedSenses: ['jar'] }).reason).toMatch(/no gloss/)
  })
})

// Every learner-facing Mandarin token in a published story must resolve through
// the SAME path the Reader uses, or be a canonical entity. The check reuses
// untappableRuns(), which calls production segmentLine with the production
// matcher and segmenter — an invariant enforced against a copy of the logic
// tests the copy.
describe('the publishability invariant', () => {
  it('passes a story whose every token the reader resolves', () => {
    expect(publishable({ title: 'ok', content: '我的书很好。' }, { vocabMap }).ok).toBe(true)
  })

  it('fails a story with a token the reader cannot explain', () => {
    const r = publishable({ title: 'x', content: '手机没电。' }, { vocabMap })
    expect(r.ok).toBe(false)
    expect(r.offenders.map(o => o.run)).toContain('没')
  })

  it('allows a canonical name through, and nothing else', () => {
    const withName = { title: 'x', content: '淑兰的书很好。' }
    // Not a name to the reader → fails.
    expect(publishable(withName, { vocabMap }).ok).toBe(false)
    // Recognised through the reader's own name path → passes.
    const vm = { ...vocabMap, 淑兰: { word: '淑兰', level: 1, meaning: 'Shulan', is_name: true } }
    const r = publishable(withName, { vocabMap: vm })
    expect(r.offenders.map(o => o.run)).not.toContain('淑兰')
  })

  it('reports occurrences, so a repair can be prioritised', () => {
    const r = publishable({ title: 'x', content: '手机没电。\n手机没电。' }, { vocabMap })
    expect(r.occurrences).toBe(2)
  })

  it('blast radius separates the classes and never mutates anything', () => {
    const stories = [
      { id: 1, level: 1, content: '我的书很好。' },
      { id: 2, level: 2, content: '手机没电。' },
    ]
    const b = publishabilityBlastRadius({ stories, vocabMap })
    expect(b.stories).toBe(2)
    expect(b.failing).toBe(1)
    expect(b.passing).toBe(1)
    expect(b.matrix[0]).toMatchObject({ defect: DEFECT.MORPHEME_OF_COMPOUND, uniqueForms: 1, stories: 1 })
    // The stories themselves are untouched.
    expect(stories[1].content).toBe('手机没电。')
  })
})
