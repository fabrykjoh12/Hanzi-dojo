import { describe, it, expect } from 'vitest'
import {
  validateBlueprint,
  allocateLines,
  anonymiseBlueprints,
  renderBlueprint,
  acceptableBlueprint,
  samePlace,
  BLUEPRINT_QUALITY,
  BLUEPRINT_DIMENSIONS,
  BEAT_BOUNDS,
} from './storyBlueprint.mjs'
import {
  blueprintPrompt, parseBlueprint,
  blueprintJudgePrompt, parseBlueprintJudgment,
  realizePrompt, parseStructuredStory,
} from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

const manifest = (over = {}) => buildManifest({
  batchId: 'bp', seq: 1, level: 3,
  targets: ['护照', '邻居', '打算'],
  defaults: { lines: [28, 28] },
  ...over,
})

const beat = (id, over = {}) => ({
  id, when: 'that afternoon', where: '李明家', what: 'something changes here',
  because: 'it follows from the beat before', targets: [], lines: 5, ...over,
})

const blueprint = (over = {}) => ({
  title: 'The lost passport',
  chineseTitle: '找护照',
  setting: 'A flat in the city, one afternoon',
  cast: ['李明', '小红'],
  problem: 'The passport is missing the day before a trip',
  incitingEvent: 'Li Ming cannot find his passport',
  beats: [
    beat(1, { because: 'the story opens', targets: ['打算'], lines: 5 }),
    beat(2, { targets: ['护照'], lines: 5 }),
    beat(3, { where: '邻居家', arrivedHow: 'they walk next door', targets: ['邻居'], lines: 6 }),
    beat(4, { where: '邻居家', lines: 6 }),
    beat(5, { where: '李明家', arrivedHow: 'they come back home', lines: 6 }),
  ],
  resolution: 'The passport turns up and the trip is saved',
  // speaker / refersTo / intent are story-shape metadata now: the shape
  // planner owns why a word belongs there, the lexical stage owns the Chinese.
  targetPlan: [
    { word: '打算', beat: 1, why: 'he is telling someone what he plans to do tomorrow', speaker: '李明', refersTo: 'tomorrow\'s trip', intent: 'say what he means to do' },
    { word: '护照', beat: 2, why: 'the document itself is what they are looking for', speaker: '小红', refersTo: 'the passport', intent: 'ask where it is' },
    { word: '邻居', beat: 3, why: 'they go to ask the neighbour who watched the flat', speaker: '李明', refersTo: 'the neighbour', intent: 'suggest asking them' },
  ],
  ...over,
})

describe('validateBlueprint — what code can check about a plan', () => {
  it('accepts a well-formed plan and reports where each target landed', () => {
    const r = validateBlueprint(blueprint(), { manifest: manifest() })
    expect(r.ok).toBe(true)
    expect(r.failures).toEqual([])
    expect(r.placed).toEqual({ 打算: 1, 护照: 2, 邻居: 3 })
  })

  it('rejects a beat that does not follow from the one before it — "and then" is not a plot', () => {
    const bp = blueprint()
    bp.beats[2] = { ...bp.beats[2], because: '' }
    const r = validateBlueprint(bp, { manifest: manifest() })
    expect(r.failures.map(f => f.code)).toContain('beat_uncaused')
  })

  it('rejects a cast that teleports: a new place needs a way of getting there', () => {
    const bp = blueprint()
    bp.beats[2] = { ...bp.beats[2], arrivedHow: '' }
    const r = validateBlueprint(bp, { manifest: manifest() })
    expect(r.failures.map(f => f.code)).toContain('unexplained_move')
    expect(r.failures.find(f => f.code === 'unexplained_move').message).toContain('邻居家')
    // staying put needs no explanation
    const same = blueprint()
    same.beats[3] = { ...same.beats[3], arrivedHow: '' }
    expect(validateBlueprint(same, { manifest: manifest() }).failures.map(f => f.code)).not.toContain('unexplained_move')
  })

  // blueprint-1 threw away sound plans because "Hallway outside Apartment 201"
  // and "Same hallway, by the leaking pipe" are not the same STRING.
  it('the same place described twice is not a move', () => {
    expect(samePlace('Hallway outside Apartment 201', 'Same hallway, they stand by the leaking pipe')).toBe(true)
    expect(samePlace("Li Ming's apartment door", "Li Ming's apartment living room")).toBe(true)
    expect(samePlace('学校教室', '学校教室')).toBe(true)
    expect(samePlace('Hallway outside Apartment 201', 'Lift Lobby')).toBe(false)
    expect(samePlace('Classroom', 'Library study room')).toBe(false)
    expect(samePlace('', 'anywhere')).toBe(true)              // nothing to compare
    // beat 2 re-describes beat 1's place; beat 3's real move still needs its
    // explanation, and keeps it
    const reworded = blueprint()
    reworded.beats[1] = { ...reworded.beats[1], where: '李明家的门口', arrivedHow: '' }
    expect(validateBlueprint(reworded, { manifest: manifest() }).failures.map(f => f.code)).not.toContain('unexplained_move')
  })

  it('a beat asking for one line is normalised, not rejected — the allocator owns the floor', () => {
    const bp = blueprint()
    bp.beats[4] = { ...bp.beats[4], lines: 1 }
    const r = validateBlueprint(bp, { manifest: manifest() })
    expect(r.failures.map(f => f.code)).not.toContain('beat_lines')
    expect(Math.min(...allocateLines(bp.beats, 28).map(a => a.lines))).toBeGreaterThanOrEqual(2)
    // a missing or absurd number still fails
    const absurd = blueprint()
    absurd.beats[0] = { ...absurd.beats[0], lines: 99 }
    expect(validateBlueprint(absurd, { manifest: manifest() }).failures.map(f => f.code)).toContain('beat_lines')
  })

  it('rejects missing chronology, missing place, and an empty beat', () => {
    for (const [field, code] of [['when', 'beat_when'], ['where', 'beat_where'], ['what', 'beat_empty']]) {
      const bp = blueprint()
      bp.beats[1] = { ...bp.beats[1], [field]: '' }
      expect(validateBlueprint(bp, { manifest: manifest() }).failures.map(f => f.code)).toContain(code)
    }
  })

  // blueprint-3 and -4 lost most of their plans to notation: the plan is
  // written in English, so people are called "Li Ming" or "Xiao Ming
  // (thought)". A name matches when the Chinese name is inside it.
  it('accepts how an English plan actually writes a Chinese name', () => {
    const vm = { 找: { word: '找', level: 1 }, 护照: { word: '护照', level: 3 }, 打算: { word: '打算', level: 3 }, 我: { word: '我', level: 1 }, 去: { word: '去', level: 1 }, 他: { word: '他', level: 1 } }
    const m = manifest()
    const withNotation = blueprint({ cast: ['李明 (Li Ming)', '小红'] })
    withNotation.targetPlan[0] = { ...withNotation.targetPlan[0], speaker: '李明 (thinking to himself)', refersTo: 'tomorrow', intent: 'say what he plans', usageSketch: '我打算去找他' }
    const r = validateBlueprint(withNotation, { manifest: m, vocabMap: vm })
    const about = (word) => r.failures.filter(f => f.code === 'target_no_speaker' && f.message.includes(word))
    expect(r.failures.map(f => f.code)).not.toContain('cast_unknown')
    expect(about('打算')).toEqual([])          // 李明 (thinking to himself) is 李明
    // a narrator is still allowed, and a genuine stranger still is not
    const stranger = blueprint()
    stranger.targetPlan[0] = { ...stranger.targetPlan[0], speaker: 'the shopkeeper', refersTo: 'x', intent: 'say something', usageSketch: '我打算去找他' }
    expect(validateBlueprint(stranger, { manifest: m, vocabMap: vm }).failures
      .filter(f => f.code === 'target_no_speaker' && f.message.includes('打算')).length).toBe(1)
    const narrator = blueprint()
    narrator.targetPlan[0] = { ...narrator.targetPlan[0], speaker: 'narrator', refersTo: 'x', intent: 'say something', usageSketch: '我打算去找他' }
    expect(validateBlueprint(narrator, { manifest: m, vocabMap: vm }).failures
      .filter(f => f.code === 'target_no_speaker' && f.message.includes('打算')).length).toBe(0)
  })

  // a3-fresh-1 lost four target placements, and blueprint-4 five, because an
  // English plan calls the cast by the romanization the project's own story
  // bible publishes. The aliases come from that bible text, never invented.
  it('accepts the bible\'s own romanization of a cast name', () => {
    const vm = { 找: { word: '找', level: 1 }, 打算: { word: '打算', level: 3 }, 我: { word: '我', level: 1 }, 去: { word: '去', level: 1 }, 他: { word: '他', level: 1 } }
    const m = manifest()
    const withSpeaker = (speaker) => {
      const bp = blueprint()
      bp.targetPlan[0] = { ...bp.targetPlan[0], speaker, refersTo: 'tomorrow', intent: 'say what he plans', usageSketch: '我打算去找他' }
      return validateBlueprint(bp, { manifest: m, vocabMap: vm }).failures
        .filter(f => f.code === 'target_no_speaker' && f.message.includes('打算')).length
    }
    for (const ok of ['李明', 'Li Ming', 'LI MING', 'Li Ming (internal monologue)', 'Xiao Hong', 'narrator']) {
      expect(withSpeaker(ok), ok + ' should be recognised').toBe(0)
    }
    // 妈妈 has no pinyin in the bible, so an English plan calls her Mom —
    // a32-fresh-2 lost a whole shape to her being read as a stranger. The
    // name is shared with another bible's character, so every candidate is
    // kept and the one in THIS cast wins.
    const withMother = manifest({ speakers: ['李明', '妈妈'] })
    const motherSpeaker = (speaker) => {
      const bp = blueprint({ cast: ['李明', '妈妈'] })
      bp.targetPlan[0] = { ...bp.targetPlan[0], speaker, refersTo: 'tomorrow', intent: 'say what she plans', usageSketch: '我打算去找他' }
      return validateBlueprint(bp, { manifest: withMother, vocabMap: vm }).failures
        .filter(f => f.code === 'target_no_speaker' && f.message.includes('打算')).length
    }
    for (const ok of ['妈妈', 'Mom', 'Mother', 'Mom (in the kitchen)']) {
      expect(motherSpeaker(ok), ok + ' should be recognised').toBe(0)
    }
    expect(motherSpeaker('the shopkeeper')).toBe(1)
    // someone who is not in the cast is still not in the cast
    for (const bad of ['the shopkeeper', 'Wang Laoshi', 'a passing woman']) {
      expect(withSpeaker(bad), bad + ' should be refused').toBe(1)
    }
  })

  it('rejects a cast outside the manifest, and one too large or too small', () => {
    expect(validateBlueprint(blueprint({ cast: ['李明', '王老师'] }), { manifest: manifest() }).failures.map(f => f.code)).toContain('cast_unknown')
    expect(validateBlueprint(blueprint({ cast: ['李明'] }), { manifest: manifest() }).failures.map(f => f.code)).toContain('cast_size')
    expect(validateBlueprint(blueprint({ cast: ['李明', '小红', '小明', '妈妈'] }), { manifest: manifest() }).failures.map(f => f.code)).toContain('cast_size')
  })

  it('rejects a required target with no home, or a home with no reason', () => {
    const unplaced = blueprint({ targetPlan: [{ word: '打算', beat: 1, why: 'he is telling someone what he plans to do' }] })
    const r = validateBlueprint(unplaced, { manifest: manifest() })
    expect(r.failures.map(f => f.code).filter(c => c === 'target_unplaced').length).toBe(2)

    const thin = blueprint()
    thin.targetPlan[0] = { word: '打算', beat: 1, why: 'fits' }
    expect(validateBlueprint(thin, { manifest: manifest() }).failures.map(f => f.code)).toContain('target_unjustified')

    const nowhere = blueprint()
    nowhere.targetPlan[0] = { word: '打算', beat: 9, why: 'he is telling someone what he plans to do tomorrow' }
    expect(validateBlueprint(nowhere, { manifest: manifest() }).failures.map(f => f.code)).toContain('target_beat')
  })

  it('rejects a plan with too few or too many beats, and an over-stuffed beat', () => {
    expect(validateBlueprint(blueprint({ beats: [beat(1, { because: 'opens' }), beat(2)] }), { manifest: manifest() })
      .failures.map(f => f.code)).toContain('beat_count')
    const stuffed = blueprint()
    stuffed.beats[0] = { ...stuffed.beats[0], targets: ['a', 'b', 'c', 'd', 'e'] }
    expect(validateBlueprint(stuffed, { manifest: manifest() }).failures.map(f => f.code)).toContain('beat_target_dump')
    expect(BEAT_BOUNDS).toEqual({ min: 5, max: 6 })
  })

  it('the Chinese title obeys the story\'s own vocabulary rules', () => {
    const vm = { 找: { word: '找', level: 1 }, 护照: { word: '护照', level: 3 }, 森林: { word: '森林', level: 4 } }
    const m = manifest()
    expect(validateBlueprint(blueprint(), { manifest: m, vocabMap: vm }).failures.map(f => f.code)).not.toContain('chinese_title_lexis')
    expect(validateBlueprint(blueprint({ chineseTitle: 'The Passport' }), { manifest: m, vocabMap: vm })
      .failures.map(f => f.code)).toContain('chinese_title_latin')
    expect(validateBlueprint(blueprint({ chineseTitle: '森林' }), { manifest: m, vocabMap: vm })
      .failures.map(f => f.code)).toContain('chinese_title_lexis')
    expect(validateBlueprint(blueprint({ chineseTitle: '' }), { manifest: m, vocabMap: vm })
      .failures.map(f => f.code)).toContain('missing_chineseTitle')
    // without a vocabulary the rule does not apply (planning-only validation)
    expect(validateBlueprint(blueprint({ chineseTitle: '' }), { manifest: m }).failures.map(f => f.code)).not.toContain('missing_chineseTitle')
  })

  it('refuses prose masquerading as a plan', () => {
    expect(validateBlueprint(null, { manifest: manifest() }).ok).toBe(false)
    expect(validateBlueprint({}, { manifest: manifest() }).failures.map(f => f.code)).toContain('missing_problem')
  })
})

describe('allocateLines — the fixed output contract', () => {
  it('turns a plan\'s rough shares into exact, contiguous line ranges', () => {
    const a = allocateLines(blueprint().beats, 28)
    expect(a.reduce((n, x) => n + x.lines, 0)).toBe(28)
    expect(a[0].from).toBe(1)
    expect(a[a.length - 1].to).toBe(28)
    for (let i = 1; i < a.length; i += 1) expect(a[i].from).toBe(a[i - 1].to + 1)
  })

  it('hits the exact total whatever the plan asked for, and keeps every beat above the floor', () => {
    for (const asked of [[2, 2, 2, 2, 2], [8, 8, 8, 8, 8], [3, 7, 2, 5, 4], [4, 4, 4, 4, 4, 4]]) {
      const beats = asked.map((lines, i) => beat(i + 1, { lines }))
      const a = allocateLines(beats, 28)
      expect(a.reduce((n, x) => n + x.lines, 0)).toBe(28)
      expect(Math.min(...a.map(x => x.lines))).toBeGreaterThanOrEqual(2)
    }
  })

  it('is deterministic and refuses an impossible budget', () => {
    expect(JSON.stringify(allocateLines(blueprint().beats, 28))).toBe(JSON.stringify(allocateLines(blueprint().beats, 28)))
    expect(allocateLines(blueprint().beats, 8)).toBeNull()     // 5 beats cannot fit 8 lines at a floor of 2
  })
})

describe('plan ranking', () => {
  it('acceptableBlueprint needs the plot to hold, not just a good average', () => {
    const ok = { overall: 7, causal: 7, chronology: 7, targetFit: 6, contradiction: false }
    expect(acceptableBlueprint(ok)).toBe(true)
    expect(acceptableBlueprint({ ...ok, contradiction: true })).toBe(false)
    expect(acceptableBlueprint({ ...ok, causal: 5 })).toBe(false)
    expect(acceptableBlueprint({ ...ok, chronology: 5 })).toBe(false)
    expect(acceptableBlueprint({ ...ok, targetFit: 4 })).toBe(false)
    expect(acceptableBlueprint({ ...ok, overall: 5 })).toBe(false)
    expect(acceptableBlueprint(null)).toBe(false)
    expect(BLUEPRINT_QUALITY.overall).toBe(6)
  })

  it('anonymisation is deterministic and independent of who planned what', () => {
    const items = [{ planner: 'x', blueprint: blueprint({ title: 'A' }) }, { planner: 'y', blueprint: blueprint({ title: 'B' }) }]
    const one = anonymiseBlueprints(items)
    const two = anonymiseBlueprints(items.slice().reverse())
    expect(one.map(c => c.label + c.blueprint.title)).toEqual(two.map(c => c.label + c.blueprint.title))
  })

  it('the judge sees plans and their causality, never the planner', () => {
    const rendered = renderBlueprint(blueprint(), allocateLines(blueprint().beats, 28))
    expect(rendered).toContain('CENTRAL PROBLEM:')
    expect(rendered).toContain('BECAUSE:')
    expect(rendered).toContain('GOT THERE BY: they walk next door')
    expect(rendered).toContain('打算 → beat 1')
    const p = blueprintJudgePrompt({ manifest: manifest(), levelName: 'HSK 3', candidates: [{ label: 'A', rendered }], dimensions: BLUEPRINT_DIMENSIONS })
    expect(p).toContain('PLAN A:')
    expect(p).toContain('CONTRADICTION')
    expect(p).not.toContain('qwen')
    expect(p).not.toContain('gpt-oss')
    // the judge answers in the shape the plans were shown to it: "PLAN A:"
    expect(parseBlueprintJudgment('PLAN A: CAUSAL 8 CHRONOLOGY 8 PLAUSIBILITY 7 SIMPLICITY 8 TARGETFIT 7 SUITABILITY 8 CONTRADICTION no OVERALL 8 — ok', ['A'], BLUEPRINT_DIMENSIONS)[0].overall).toBe(8)
    expect(parseBlueprintJudgment('- **Plan B**: CAUSAL 6 CHRONOLOGY 6 PLAUSIBILITY 6 SIMPLICITY 6 TARGETFIT 6 SUITABILITY 6 CONTRADICTION yes OVERALL 6 — thin', ['B'], BLUEPRINT_DIMENSIONS)[0].contradiction).toBe(true)
    const scored = parseBlueprintJudgment('A: CAUSAL 8 CHRONOLOGY 7 PLAUSIBILITY 7 SIMPLICITY 8 TARGETFIT 6 SUITABILITY 8 CONTRADICTION no OVERALL 7 — holds together', ['A'], BLUEPRINT_DIMENSIONS)
    expect(scored[0]).toMatchObject({ label: 'A', causal: 8, chronology: 7, targetFit: 6, contradiction: false, overall: 7 })
  })
})

describe('parseBlueprintJudgment — labels past H', () => {
  // Verbatim from planner-bakeoff-1s, batch IJ: the judge scored both plans
  // and the whole batch was discarded because the label class stopped at H.
  const raw = 'PLAN I: CAUSAL 8 CHRONOLOGY 9 PLAUSIBILITY 7 SIMPLICITY 9 TARGETFIT 6 SUITABILITY 8 CONTRADICTION no OVERALL 7 \u2014 The excluded neighbour is awkward.\n'
    + 'PLAN J: CAUSAL 7 CHRONOLOGY 8 PLAUSIBILITY 6 SIMPLICITY 8 TARGETFIT 5 SUITABILITY 6 CONTRADICTION yes OVERALL 4 \u2014 An unrelated character confuses it.'

  it('reads a batch whose labels are I and J', () => {
    const out = parseBlueprintJudgment(raw, ['I', 'J'], BLUEPRINT_DIMENSIONS)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ label: 'I', overall: 7, causal: 8, chronology: 9, targetFit: 6, contradiction: false })
    expect(out[1]).toMatchObject({ label: 'J', overall: 4, targetFit: 5, contradiction: true })
  })

  it('still ignores a label that was not in the batch', () => {
    expect(parseBlueprintJudgment('PLAN Z: CAUSAL 8 OVERALL 8', ['I', 'J'], BLUEPRINT_DIMENSIONS)).toBeNull()
  })
})

describe('the prompts keep planning and writing apart', () => {
  it('the planner is told to plan, in English, and to refuse a target with no home', () => {
    const p = blueprintPrompt({ manifest: manifest(), totalLines: 28, targets: ['护照'] })
    expect(p).toContain('Do NOT write the story')
    expect(p).toContain('because → therefore')
    expect(p).toContain('ONE central problem')
    expect(p).toContain('impossibleTargets')
    expect(p).toContain('exactly 28 lines')
    expect(p).toContain('护照 — REQUIRED')
    expect(p).toContain('邻居 — optional')      // only what must be placed is required
  })

  it('the writer is told the story is already decided', () => {
    const bp = blueprint()
    const alloc = allocateLines(bp.beats, 28)
    const p = realizePrompt({ manifest: manifest(), blueprint: bp, rendered: renderBlueprint(bp, alloc), allocation: alloc, totalLines: 28 })
    expect(p).toContain('ALREADY been planned')
    expect(p).toContain('Do NOT add characters')
    expect(p).toContain('Do NOT change the chronology')
    expect(p).toContain('lines 1-5 → beat 1')
    expect(p).toContain('exactly 28 strings')
  })

  it('the length contract is the parser, not a sentence in a prompt', () => {
    const body = (n) => JSON.stringify({ title: '标题', lines: Array.from({ length: n }, (_, i) => '第' + (i + 1) + '行。') })
    expect(parseStructuredStory(body(28), 28).content.split('\n').length).toBe(28)
    expect(parseStructuredStory(body(27), 28)).toBeNull()
    expect(parseStructuredStory(body(29), 28)).toBeNull()
    expect(parseStructuredStory('```json\n' + body(2) + '\n```', 2)).not.toBeNull()
    expect(parseStructuredStory('Here you go:\n' + body(2), 2)).not.toBeNull()
    expect(parseStructuredStory(JSON.stringify({ title: '', lines: ['一。', '二。'] }), 2)).toBeNull()
    expect(parseStructuredStory(JSON.stringify({ title: 'T', lines: ['one', 'two'] }), 2)).toBeNull()   // no Chinese
    expect(parseStructuredStory('TITLE: 标题\n第一行。', 1)).toBeNull()                                  // the old prose format
  })

  it('parseBlueprint survives fences and preamble', () => {
    expect(parseBlueprint('```json\n{"title":"x","beats":[]}\n```').title).toBe('x')
    expect(parseBlueprint('Sure!\n{"title":"y"}\nHope that helps').title).toBe('y')
    expect(parseBlueprint('no json here')).toBeNull()
  })
})
