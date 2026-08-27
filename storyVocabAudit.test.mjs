import { describe, it, expect } from 'vitest'
import {
  untappableRuns, classifyRun, auditCorpus, glossCoverage,
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
  it('COMPONENT_ONLY when the course teaches it only inside a compound', () => {
    const r = classifyRun('没', { vocabMap })
    expect(r.defect).toBe(DEFECT.COMPONENT_ONLY)
    expect(r.layer).toBe('source-data')
    // The hosts ARE the provenance: a reader of the audit can check the claim.
    expect(r.hosts).toEqual(expect.arrayContaining(['没有']))
    expect(r.hostLevel).toBe(1)
  })

  it('ABSENT when nothing in the vocabulary contains it', () => {
    const r = classifyRun('缸', { vocabMap })
    expect(r.defect).toBe(DEFECT.ABSENT)
    expect(r.layer).toBe('content')
    expect(r.hosts).toEqual([])
  })

  it('NAME when it is a person the name list already knows', () => {
    const r = classifyRun('淑兰', { vocabMap, knownNames: ['淑兰'] })
    expect(r.defect).toBe(DEFECT.NAME)
    expect(r.layer).toBe('segmentation')
  })

  it('a character that merely APPEARS in a name is not a name', () => {
    // 石 is "stone" and 火 is "fire"; both are substrings of names in the real
    // corpus, and containment classified 24 and 20 occurrences as names.
    expect(classifyRun('石', { vocabMap, knownNames: ['石头', '小石'] }).defect).not.toBe(DEFECT.NAME)
    expect(classifyRun('火', { vocabMap, knownNames: ['小火'] }).defect).toBe(DEFECT.COMPONENT_ONLY)
  })

  it('names the LOWEST-level host, because that is what the learner met first', () => {
    // 电 lives in 电话 (HSK 1) and would also be found in higher compounds.
    expect(classifyRun('电', { vocabMap }).hosts[0]).toBe('电话')
  })

  it('COMPONENT_ONLY is never evidence the learner knows the word', () => {
    // 火 is taught only inside 火车 ("train"). Knowing "train" does not teach
    // "fire", so this class must stay a source-data gap and must never be
    // repaired in the lexical evidence layer.
    const r = classifyRun('火', { vocabMap })
    expect(r.defect).toBe(DEFECT.COMPONENT_ONLY)
    expect(r.hosts).toEqual(['火车'])
    expect(r.layer).not.toBe('lexical-evidence')
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
    const comp = a.summary.find(s => s.defect === DEFECT.COMPONENT_ONLY)
    expect(comp.occurrences).toBeGreaterThanOrEqual(2)
    expect(comp.layer).toBe('source-data')
  })

  it('reports how many stories each defect reaches, not just how often', () => {
    const row = auditCorpus({ stories, vocabMap }).rows.find(r => r.run === '没')
    expect(row.stories).toBe(2)
    expect(row.occurrences).toBe(2)
  })

  it('is versioned', () => {
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
