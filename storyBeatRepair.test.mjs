import { describe, it, expect } from 'vitest'
import { classifyBeat, beatRepairBrief, checkBeatDrift, BEAT_REPAIR_VERSION } from './storyBeatRepair.mjs'
import { validateBeat } from './storyBeats.mjs'
import { beatPrompt } from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

// Levels and glosses verbatim from the canonical vocabulary table.
const ROWS = [
  ['下午', 1, 'afternoon'], ['小时', 1, 'hour'], ['站', 3, 'to stand; station'], ['大楼', 3, 'building'],
  ['门口', 3, 'doorway; gate'], ['女人', 3, 'woman'], ['男人', 3, 'a man; a male'], ['累', 2, 'tired, to tire'],
  ['箱子', 3, 'suitcase; chest'], ['绿色', 2, 'green color, (green)'], ['大', 1, 'big'], ['需要', 3, 'to need'],
  ['帮忙', 2, 'to help'], ['帮助', 3, 'assistance; aid; to help'], ['走', 1, 'to walk'], ['进', 2, 'to enter'],
  ['看见', 1, 'to see'], ['问', 1, 'to ask'], ['旁边', 2, 'beside; next to'], ['爸爸', 1, 'father; dad'],
  ['狗', 1, 'dog'], ['跑', 2, 'to run'], ['知道', 1, 'to know'], ['怎么办', 2, 'what to do'],
  ['她', 1, 'she; her'], ['他', 1, 'he; him'], ['这个', 1, 'this one'], ['一个', 1, 'one'], ['有', 1, 'to have'],
  ['不', 1, 'not'], ['你', 1, 'you'], ['吗', 1, '(question particle)'], ['了', 1, '(particle)'],
  ['的', 1, 'of'], ['在', 1, 'at; in'], ['人', 1, 'person'], ['来', 1, 'to come'], ['一', 1, 'one'],
  ['李明', 1, 'Li Ming'], ['小红', 1, 'Xiao Hong'], ['妈妈', 1, 'mother; mom'],
  ['很', 1, 'very'], ['擦', 5, 'to wipe'], ['上', 1, 'on; above'],
]
const vocabMap = Object.fromEntries(ROWS.map(([word, level, meaning]) => [word, { word, level, meaning }]))
const manifest = () => buildManifest({ batchId: 'c', seq: 1, level: 3, targets: ['女人', '男人', '需要'], defaults: { lines: [14, 38] } })

// Plan C's beat 1, frozen, with the scaffold it was given.
const beat = () => ({
  id: 1, when: 'Saturday afternoon', where: 'Building entrance lobby',
  what: 'Xiao Hong stands with a large green box. She looks tired and unsure.',
  because: 'the story opens', arrivedHow: '', targets: ['女人'],
  chineseLexicalAnchors: ['下午', '门口', '绿色', '箱子', '累'], lines: 5,
})
const blueprint = { cast: ['李明', '小红'], beats: [beat()] }
const sketches = [{ word: '女人', beat: 1, speaker: 'narrator', refersTo: 'Xiao Hong', intent: 'Description', usageSketch: '这个女人很累。' }]

// Verbatim from a3-final-7, attempt 1.
const A1 = [
  '下午，小红在大楼门口站了一个小时。',
  '她旁边有一个大绿色箱子。',
  '这个女人很累，不知道怎么办。',
  '小红擦了擦额头上的汗。',
  '她需要有人来帮忙。',
]

const classified = () => classifyBeat(A1, { beat: beat(), blueprint, manifest: manifest(), vocabMap, sketches, failures: ['2 non-vocabulary words (max 1 here): 额头、汗'] })

describe('classifyBeat — the plan’s facts, and the writer’s decoration', () => {
  it('1. marks material nothing upstream asked for as removable', () => {
    const c = classified()
    // 额头 and 汗 are in no target, no anchor and no sketch.
    expect(c.decorative).toEqual(expect.arrayContaining(['额头', '汗']))
    expect(c.badTokens).toEqual(expect.arrayContaining(['额头', '汗']))
  })

  it('2. keeps the frozen story facts out of what may be removed', () => {
    const c = classified()
    expect(c.frozen).toMatchObject({
      what: 'Xiao Hong stands with a large green box. She looks tired and unsure.',
      because: 'the story opens', where: 'Building entrance lobby', targets: ['女人'],
    })
    expect(c.anchors).toEqual(['下午', '门口', '绿色', '箱子', '累'])
    for (const anchor of c.anchors) expect(c.decorative).not.toContain(anchor)
    expect(c.keepLines).toContain('这个女人很累，不知道怎么办。')
  })

  it('the brief tells the writer to delete it rather than rephrase it', () => {
    const p = beatPrompt({ manifest: manifest(), blueprint, beat: beat(), alloc: { lines: 5 }, cast: blueprint.cast, sketches, repair: beatRepairBrief(classified()) })
    expect(p).toContain('REPAIR YOUR OWN BEAT')
    expect(p).toContain('额头')
    expect(p).toContain('remove it entirely')
    expect(p).toContain('These are FROZEN')
    expect(p).toContain('Xiao Hong stands with a large green box')
  })
})

describe('speaker classification — form, not casting', () => {
  const base = { beat: beat(), manifest: manifest(), vocabMap, expectedLines: 2, cast: ['李明', '小红'] }
  const codes = (lines) => validateBeat(lines, base).failures.map(f => f.code)

  it('3. narration in the label position is narrated_speaker, not unknown_speaker', () => {
    // Verbatim from a3-final-7, attempt 2.
    const c = codes(['他走过去问：小红，你需要帮忙吗？', '这个女人很累。'])
    expect(c).toContain('narrated_speaker')
    expect(c).not.toContain('unknown_speaker')
    const message = validateBeat(['他走过去问：小红，你需要帮忙吗？', '这个女人很累。'], base).failures.find(f => f.code === 'narrated_speaker').message
    expect(message).toContain('Narration is its own line')
    expect(message).toContain('two lines')
  })

  it('4. a bare canonical name passes', () => {
    expect(codes(['李明：你需要帮忙吗？', '这个女人很累。'])).not.toContain('narrated_speaker')
    expect(codes(['小红：我很累。', '这个女人很累。'])).toEqual([])
  })

  it('5. a canonical name plus a verb is not a canonical label', () => {
    expect(codes(['李明问：你需要帮忙吗？', '这个女人很累。'])).toContain('narrated_speaker')
  })

  it('a pronoun label is refused, and told to use the name', () => {
    const f = validateBeat(['他：你需要帮忙吗？', '这个女人很累。'], base).failures.find(x => x.code === 'narrated_speaker')
    expect(f.message).toContain('NAME')
  })

  it('6. a pronoun in ordinary narration is untouched', () => {
    expect(codes(['她旁边有一个大绿色箱子。', '这个女人很累。'])).toEqual([])
    expect(codes(['他走进大楼，看见了小红。', '这个女人很累。'])).toEqual([])
  })

  it('a name that is simply not in the cast is still unknown_speaker', () => {
    expect(codes(['妈妈：你需要帮忙吗？', '这个女人很累。'])).toContain('unknown_speaker')
  })
})

describe('checkBeatDrift — a repair, not a new scene', () => {
  const brief = () => beatRepairBrief(classified())
  const drift = (after) => checkBeatDrift(A1, after, { manifest: manifest(), vocabMap, brief: brief() })

  it('1b. accepts deleting the decorative line and replacing it in kind', () => {
    const repaired = [
      '下午，小红在大楼门口站了一个小时。',
      '她旁边有一个大绿色箱子。',
      '这个女人很累，不知道怎么办。',
      '她站在箱子旁边。',
      '她需要有人来帮忙。',
    ]
    expect(drift(repaired).ok).toBe(true)
  })

  it('7. refuses a new person', () => {
    const r = drift([
      '下午，小红在大楼门口站了一个小时。',
      '她旁边有一个大绿色箱子。',
      '这个女人很累，不知道怎么办。',
      '她爸爸来了。',
      '她需要有人来帮忙。',
    ])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('爸爸')
  })

  it('7b. refuses a new event or object', () => {
    const r = drift([
      '下午，小红在大楼门口站了一个小时。',
      '她旁边有一个大绿色箱子。',
      '这个女人很累，不知道怎么办。',
      '她的狗跑了。',
      '她需要有人来帮忙。',
    ])
    expect(r.ok).toBe(false)
  })

  it('refuses discarding lines that were already correct', () => {
    const r = drift(['这个女人很累。', '她需要帮忙。'])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('dropped material')
  })

  it('8. an already-clean beat needs no repair at all', () => {
    const clean = [
      '下午，小红在大楼门口站了一个小时。',
      '她旁边有一个大绿色箱子。',
      '这个女人很累，不知道怎么办。',
      '她需要有人来帮忙。',
      '李明走进大楼。',
    ]
    const c = classifyBeat(clean, { beat: beat(), blueprint, manifest: manifest(), vocabMap, sketches, failures: [] })
    expect(c.badTokens).toEqual([])
    expect(c.decorative).toEqual([])
    expect(validateBeat(clean, { beat: beat(), manifest: manifest(), vocabMap, expectedLines: 5, cast: blueprint.cast }).ok).toBe(true)
    // and no repair brief is rendered when the first attempt passed
    const p = beatPrompt({ manifest: manifest(), blueprint, beat: beat(), alloc: { lines: 5 }, cast: blueprint.cast, sketches, repair: null })
    expect(p).not.toContain('REPAIR YOUR OWN BEAT')
    expect(BEAT_REPAIR_VERSION).toBe('fab9-beat-repair@1')
  })
})

// ── a3-final-9: the repair the guard would not let through ──────────────────
describe('a repair whose broken part was Latin', () => {
  const vm = { ...vocabMap, 着急: { word: '着急', level: 3, meaning: 'to worry; anxious' }, 星期六: { word: '星期六', level: 1, meaning: 'Saturday' }, 那里: { word: '那里', level: 1, meaning: 'there' }, 没: { word: '没', level: 1, meaning: 'not have' }, 到: { word: '到', level: 1, meaning: 'to arrive' }, 还: { word: '还', level: 1, meaning: 'still' }, 拿: { word: '拿', level: 2, meaning: 'to take, to hold' }, 点: { word: '点', level: 1, meaning: 'point; a little' } }
  const m = () => buildManifest({ batchId: 'c', seq: 1, level: 3, targets: ['女人'], defaults: { lines: [14, 38] } })
  // Verbatim from a3-final-9.
  const a1 = [
    '星期六下午，在大楼门口，', '小红拿着一个很大的绿色箱子。', '这个女人很累，不知道怎么办。',
    '她站在那里， looking around。', '李明还没到。',
  ]
  const a2 = [
    '星期六下午，在大楼门口，', '小红拿着一个很大的绿色箱子。', '这个女人很累，不知道怎么办。',
    '她站在那里，有点着急。', '李明还没到。',
  ]
  const brief = () => beatRepairBrief(classifyBeat(a1, { beat: beat(), blueprint, manifest: m(), vocabMap: vm, sketches, failures: ['a story line contains Latin text'] }))

  it('records the Latin as the broken material', () => {
    expect(brief().remove).toEqual(expect.arrayContaining(['looking', 'around']))
  })

  it('accepts the repair that replaced it with in-level Chinese', () => {
    // The guard refused this and cost the run: 着急 was called an import.
    const r = checkBeatDrift(a1, a2, { manifest: m(), vocabMap: vm, brief: brief() })
    expect(r.ok).toBe(true)
    expect(r.lost).toEqual([])
  })

  it('still refuses a living thing that was not there', () => {
    const withDog = a2.map(l => (l.includes('着急') ? '她的狗跑了。' : l))
    expect(checkBeatDrift(a1, withDog, { manifest: m(), vocabMap: { ...vm, 狗: { word: '狗', level: 1, meaning: 'dog' }, 跑: { word: '跑', level: 2, meaning: 'to run' }, 的: { word: '的', level: 1, meaning: 'of' } }, brief: brief() }).ok).toBe(false)
  })
})
