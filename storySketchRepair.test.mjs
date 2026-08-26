import { describe, it, expect } from 'vitest'
import {
  componentCandidates, classifySketch, repairBrief, checkRepairDrift, GRAMMAR, SKETCH_REPAIR_VERSION,
} from './storySketchRepair.mjs'
import { buildLexicalScaffold, checkSketchCast } from './storyLexicalScaffold.mjs'
import { titlePrompt, parseTitle, targetSketchPrompt, parseSketch, beatAnchorsPrompt, parseAnchors } from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

// Glosses and levels verbatim from the canonical vocabulary table.
const ROWS = [
  ['这个', 1, 'this one'], ['女人', 3, 'woman'], ['很', 1, 'very'], ['累', 2, 'tired, to tire'],
  ['她', 1, 'she; her'], ['拿', 2, 'to take, to hold'], ['着', 1, '(aspect particle)'],
  ['一个', 1, 'one (of something)'], ['大', 1, 'big'], ['箱子', 3, 'suitcase; chest'],
  ['绿色', 2, 'green color, (green)'], ['盒子', 4, 'box; case'], ['男人', 3, 'a man; a male'],
  ['爸爸', 1, 'father; dad'], ['朋友', 1, 'friend'], ['门口', 3, 'doorway; gate'],
  ['帮助', 3, 'assistance; aid; to help; to assist'], ['是', 1, 'to be'], ['的', 1, 'of'],
  ['楼', 3, 'building; floor'], ['坏', 2, 'bad, broken'], ['狗', 1, 'dog'], ['跑', 2, 'to run'],
]
const vocabMap = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
const manifest = () => buildManifest({ batchId: 'c', seq: 1, level: 3, targets: ['女人', '男人'], defaults: { lines: [14, 38] } })

// Plan C's beat 1, frozen.
const beat1 = {
  id: 1, when: 'afternoon', where: 'lobby',
  what: 'Xiao Hong stands with a large green box. She looks tired and unsure.',
  because: 'the story opens', targets: ['女人'], lines: 14,
}
const plan = { cast: ['李明', '小红'], beats: [beat1], targetPlan: [] }
const A1 = '这个女人很累，她拿着一个大绿箱子。'

describe('componentCandidates — the learner list holds words, not characters', () => {
  it('1. finds the in-level entry an invalid character is a piece of', () => {
    const c = componentCandidates('绿', vocabMap, 3)
    expect(c.map(x => x.word)).toEqual(['绿色'])
    expect(c[0]).toMatchObject({ level: 2, meaning: 'green color, (green)' })
  })

  it('2. surfaces candidates generically, not for one known case', () => {
    // Same mechanism, unrelated character: 箱 is a piece of 箱子.
    expect(componentCandidates('箱', vocabMap, 3).map(x => x.word)).toEqual(['箱子'])
    // Nothing in level contains it → nothing offered, and nothing invented.
    expect(componentCandidates('龙', vocabMap, 3)).toEqual([])
    // An above-level entry is never offered as a repair.
    expect(componentCandidates('盒', vocabMap, 3)).toEqual([])
  })
})

describe('classifySketch — what attempt 1 got right', () => {
  const classified = classifySketch(A1, {
    word: '女人', beat: beat1, blueprint: plan, manifest: manifest(), vocabMap,
    problems: ['non-vocabulary text: 绿'],
  })

  it('separates the valid material from the one bad token', () => {
    expect(classified.hasTarget).toBe(true)
    expect(classified.invalid.map(i => i.token)).toEqual(['绿'])
    for (const w of ['女人', '累', '拿', '箱子', '大']) expect(classified.valid).toContain(w)
  })

  it('offers the canonical word and never substitutes it', () => {
    expect(classified.invalid[0].candidates.map(c => c.word)).toEqual(['绿色'])
    // The repaired sentence is not produced anywhere by code.
    expect(classified.sketch).toBe(A1)
  })

  it('marks the colour as a detail the beat can lose', () => {
    expect(classified.invalid[0].omittable).toBe(true)
  })
})

describe('checkRepairDrift — a repair, not a rewrite', () => {
  const brief = repairBrief(classifySketch(A1, {
    word: '女人', beat: beat1, blueprint: plan, manifest: manifest(), vocabMap,
    problems: ['non-vocabulary text: 绿'],
  }))
  const drift = (after) => checkRepairDrift(A1, after, { word: '女人', manifest: manifest(), vocabMap, brief })

  it('3+4. accepts dropping the invalid incidental modifier', () => {
    const r = drift('这个女人很累，她拿着一个大箱子。')
    expect(r.ok).toBe(true)
    expect(r.lost).toEqual([])
    expect(r.added).toEqual([])
  })

  it('accepts swapping the bad token for the canonical word it is a piece of', () => {
    expect(drift('这个女人很累，她拿着一个大绿色箱子。').ok).toBe(true)
  })

  it('5. rejects a retry that imports new unsupported words', () => {
    // a3-final-3's actual attempt 2, in spirit: different words, new problems.
    const r = drift('这个女人拿着大盒子，很累。')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('盒子')
  })

  it('6. rejects a retry that invents new story content', () => {
    const r = drift('这个女人很累，她的狗跑了。')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/dropped words that were already fine|introduced/)
  })

  it('rejects a retry that discards correct material for no reason', () => {
    const r = drift('这个女人很累。')
    expect(r.ok).toBe(false)
    expect(r.lost).toEqual(expect.arrayContaining(['拿', '箱子']))
  })

  it('rejects a repair that loses the target word', () => {
    expect(drift('这个人很累，她拿着一个大箱子。').ok).toBe(false)
  })

  it('7. a new person is refused by the cast gate, on either attempt', () => {
    expect(checkSketchCast('这个女人很累，她爸爸拿着箱子。', {
      word: '女人', beat: beat1, blueprint: plan, manifest: manifest(), vocabMap,
    }).ok).toBe(false)
  })

  it('treats grammar as grammar, not as new content', () => {
    expect(GRAMMAR.has('的')).toBe(true)
    expect(drift('这个女人很累，她拿着一个大的箱子。').ok).toBe(true)
  })
})

describe('the repair brief reaches the writer, and only on a retry', () => {
  const gen = (replies) => { const seen = []; return { name: 'W', seen, send: async ({ prompt }) => { seen.push(prompt); return replies.shift() } } }
  const J = (o) => JSON.stringify(o)
  const run = (writer) => buildLexicalScaffold({
    blueprint: { ...plan, targetPlan: [{ word: '女人', beat: 1, why: 'she is the woman with the box', speaker: '李明', refersTo: 'Xiao Hong', intent: 'say who is waiting' }] },
    manifest: manifest(), vocabMap, pool: Object.values(vocabMap).filter(v => v.level <= 3), writer,
    buildTitlePrompt: titlePrompt, parseTitle,
    buildSketchPrompt: targetSketchPrompt, parseSketch,
    buildAnchorsPrompt: beatAnchorsPrompt, parseAnchors,
  })

  it('8. a clean first attempt passes untouched, with no repair brief anywhere', async () => {
    const w = gen([J({ title: '大箱子' }), J({ sentence: '这个女人很累。' }), J({ anchors: ['门口', '楼', '拿'] })])
    const r = await run(w)
    expect(r.ok).toBe(true)
    expect(r.beats[0].sketches[0].usageSketch).toBe('这个女人很累。')
    expect(w.seen.join('')).not.toContain('REPAIR YOUR OWN SENTENCE')
  })

  it('sends the sentence, the bad token and the canonical word on the retry', async () => {
    const w = gen([
      J({ title: '大箱子' }),
      J({ sentence: A1 }),
      J({ sentence: '这个女人很累，她拿着一个大箱子。' }),
      J({ anchors: ['门口', '楼', '拿'] }),
    ])
    const r = await run(w)
    expect(r.ok).toBe(true)
    const retryPrompt = w.seen[2]
    expect(retryPrompt).toContain('REPAIR YOUR OWN SENTENCE')
    expect(retryPrompt).toContain(A1)
    expect(retryPrompt).toContain('绿')
    expect(retryPrompt).toContain('绿色')
    expect(retryPrompt).toContain('you may simply delete it')
    expect(r.beats[0].sketches[0].usageSketch).toBe('这个女人很累，她拿着一个大箱子。')
  })

  it('a drifting retry still fails under the one-retry limit', async () => {
    const w = gen([
      J({ title: '大箱子' }),
      J({ sentence: A1 }),
      J({ sentence: '这个女人很累，她的狗跑了。' }),
    ])
    const r = await run(w)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('TARGET_SCAFFOLD_FAILED')
    const attempts = r.log.filter(l => l.piece === 'sketch')
    expect(attempts).toHaveLength(2)
    expect(SKETCH_REPAIR_VERSION).toBe('fab9-sketch-repair@1')
  })
})

// ── a3-final-4: the cast gate's own false positive ──────────────────────────
describe('a person the FROZEN BEAT already has is not an intruder', () => {
  const vm = { ...vocabMap, 邻居: { word: '邻居', level: 3, meaning: 'neighbor; next door' }, 关系: { word: '关系', level: 3, meaning: 'relation; relationship' }, 我们: { word: '我们', level: 1, meaning: 'we; us' }, 和: { word: '和', level: 1, meaning: 'and; with' }, 好: { word: '好', level: 1, meaning: 'good' } }
  const m = () => buildManifest({ batchId: 'c', seq: 1, level: 3, targets: ['关系', '女人'], defaults: { lines: [14, 38] } })
  // Plan C's beat 6, verbatim.
  const beat6 = { id: 6, when: 'later', where: 'hallway', what: 'They chat about how friendly neighbors are. Li Ming leaves.', because: 'the box is safe', targets: ['关系'], lines: 14 }

  it('allows 邻居 in a beat that is about being neighbours', () => {
    // a3-final-4 rejected this twice and lost the run on it.
    const r = checkSketchCast('我们和邻居的关系很好。', { word: '关系', beat: beat6, blueprint: plan, manifest: m(), vocabMap: vm })
    expect(r.ok).toBe(true)
  })

  it('still refuses a person the beat does not have', () => {
    const r = checkSketchCast('我们和爸爸的关系很好。', { word: '关系', beat: beat6, blueprint: plan, manifest: m(), vocabMap: vm })
    expect(r.ok).toBe(false)
    expect(r.intruders).toEqual(['爸爸'])
  })

  it('the allowance is presence in the plan, not being a target word', () => {
    // 邻居 is not one of this manifest's targets; the beat text is what counts.
    expect(m().targets.map(t => t.word)).not.toContain('邻居')
    const elsewhere = { id: 2, what: 'Li Ming walks into the lobby and sees the box.', because: 'he is coming home' }
    expect(checkSketchCast('我们和邻居的关系很好。', { word: '关系', beat: elsewhere, blueprint: plan, manifest: m(), vocabMap: vm }).ok).toBe(false)
  })

  it('a cast violation reaches the retry as something to fix', () => {
    // Without this the brief was empty and the writer returned the same
    // sentence, burning the one retry for nothing.
    const brief = repairBrief(classifySketch('我们和爸爸的关系很好。', {
      word: '关系', blueprint: plan, manifest: m(), vocabMap: vm,
      problems: ['introduces 爸爸'], intruders: ['爸爸'],
    }))
    expect(brief.fix.map(f => f.token)).toEqual(['爸爸'])
    expect(brief.fix[0].why).toContain('not in the story')
    expect(brief.keep).not.toContain('爸爸')
  })
})

// ── a3-final-6: a repair the writer could not legally make ──────────────────
describe('a repair site with nothing to approve', () => {
  const vm = { ...vocabMap, 看起来: { word: '看起来', level: 3, meaning: 'it seems; it looks as if' }, 那个: { word: '那个', level: 1, meaning: 'that one' } }
  const m = () => buildManifest({ batchId: 'c', seq: 1, level: 3, targets: ['女人', '男人'], defaults: { lines: [14, 38] } })
  // Verbatim: the writer answered in English, so no candidate could exist.
  const broken = '那个女人很 tired'
  const classified = classifySketch(broken, { word: '女人', blueprint: plan, manifest: m(), vocabMap: vm, problems: ['contains Latin text'] })

  it('records Latin as the invalid material', () => {
    expect(classified.invalid.map(i => i.token)).toContain('tired')
  })

  it('accepts an in-level repair of that site, losing nothing', () => {
    // a3-final-6 refused this and lost the run on it.
    const brief = repairBrief(classified)
    const r = checkRepairDrift(broken, '那个女人看起来很累。', { word: '女人', manifest: m(), vocabMap: vm, brief })
    expect(r.ok).toBe(true)
  })

  it('still refuses a rewrite that discards correct material', () => {
    const brief = repairBrief(classified)
    const r = checkRepairDrift(broken, '李明的狗跑了。', { word: '女人', manifest: m(), vocabMap: vm, brief })
    expect(r.ok).toBe(false)
  })

  it('still refuses an above-level substitute', () => {
    const brief = repairBrief(classified)
    const r = checkRepairDrift(broken, '那个女人拿着盒子。', { word: '女人', manifest: m(), vocabMap: vm, brief })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('盒子')
  })
})

// ── a3-H-1: an indefinite reference is nobody ───────────────────────────────
describe('indefinite references are not new characters', () => {
  const vm = { ...vocabMap, 别人: { word: '别人', level: 3, meaning: 'other people; others; other person' }, 需要: { word: '需要', level: 3, meaning: 'to need' }, 我: { word: '我', level: 1, meaning: 'I; me' }, 有人: { word: '有人', level: 2, meaning: 'someone; somebody' } }
  const m = () => buildManifest({ batchId: 'h', seq: 1, level: 3, targets: ['需要'], defaults: { lines: [14, 38] } })
  const beat1 = { id: 1, what: 'Li Ming sees the flat tire and realizes he needs help', because: 'the story opens' }

  it('accepts 我需要别人的帮助', () => {
    // Verbatim from a3-H-1: refused as "introduces 别人", who is nobody.
    expect(checkSketchCast('我需要别人的帮助', { word: '需要', beat: beat1, blueprint: plan, manifest: m(), vocabMap: vm }).ok).toBe(true)
  })

  it('accepts 有人 too, for the same reason', () => {
    expect(checkSketchCast('我需要有人帮助', { word: '需要', beat: beat1, blueprint: plan, manifest: m(), vocabMap: vm }).ok).toBe(true)
  })

  it('still refuses a named relation who is not in the story', () => {
    expect(checkSketchCast('我需要爸爸的帮助', { word: '需要', beat: beat1, blueprint: plan, manifest: m(), vocabMap: vm }).ok).toBe(false)
  })
})
