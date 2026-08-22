import { describe, it, expect } from 'vitest'
import {
  validateBlueprint,
  allocateLines,
  anonymiseBlueprints,
  renderBlueprint,
  acceptableBlueprint,
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
  targetPlan: [
    { word: '打算', beat: 1, why: 'he is telling someone what he plans to do tomorrow' },
    { word: '护照', beat: 2, why: 'the document itself is what they are looking for' },
    { word: '邻居', beat: 3, why: 'they go to ask the neighbour who watched the flat' },
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

  it('rejects missing chronology, missing place, and an empty beat', () => {
    for (const [field, code] of [['when', 'beat_when'], ['where', 'beat_where'], ['what', 'beat_empty']]) {
      const bp = blueprint()
      bp.beats[1] = { ...bp.beats[1], [field]: '' }
      expect(validateBlueprint(bp, { manifest: manifest() }).failures.map(f => f.code)).toContain(code)
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
    const scored = parseBlueprintJudgment('A: CAUSAL 8 CHRONOLOGY 7 PLAUSIBILITY 7 SIMPLICITY 8 TARGETFIT 6 SUITABILITY 8 CONTRADICTION no OVERALL 7 — holds together', ['A'], BLUEPRINT_DIMENSIONS)
    expect(scored[0]).toMatchObject({ label: 'A', causal: 8, chronology: 7, targetFit: 6, contradiction: false, overall: 7 })
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
