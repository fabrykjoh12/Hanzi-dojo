import { describe, it, expect } from 'vitest'
import {
  storyJudgePrompt, parseStoryJudgment, aggregateJudgement,
  STORY_JUDGE_DIMENSIONS, JUDGE_VERSION,
} from './storyWriterJudge.mjs'

const manifest = { system: 'hsk_3', level: 3, targets: [{ word: '如果' }, { word: '需要' }] }
const stories = [
  { label: 'W1', title: '钥匙', content: '李明打开柜子。\n钥匙不见了。' },
  { label: 'W2', title: '雨天', content: '今天下雨。\n李明需要伞。' },
]

describe('storyJudgePrompt — the judge is shown stories, not models', () => {
  const p = storyJudgePrompt({ manifest, stories })

  it('names no model, no provider and no writer order', () => {
    for (const leak of ['qwen', 'gpt-oss', 'gemini', 'groq', 'writer 1', 'model']) {
      expect(p.toLowerCase(), leak).not.toContain(leak.toLowerCase())
    }
  })

  it('shows every story under its anonymous label', () => {
    expect(p).toContain('=== W1 ===')
    expect(p).toContain('=== W2 ===')
    expect(p).toContain('钥匙不见了')
  })

  it('asks for a side-by-side comparison, not absolute scores', () => {
    expect(p).toMatch(/Compare them against EACH OTHER/)
    expect(p).toMatch(/must not guess/)
  })

  it('asks about every dimension it will parse', () => {
    for (const d of STORY_JUDGE_DIMENSIONS) expect(p).toContain(d)
  })

  it('tells the judge which words the story teaches', () => {
    expect(p).toContain('如果、需要')
  })
})

describe('parseStoryJudgment', () => {
  const out = [
    'W1: natural=8 causality=7 motivation=6 dialogue=5 concrete=9 fresh=7 level=8 targets=6 | W1 is more concrete',
    'W2: natural=5 causality=6 motivation=7 dialogue=8 concrete=4 fresh=6 level=7 targets=9 | W2 leans on discussion',
  ].join('\n')

  it('reads every dimension and averages an overall', () => {
    const r = parseStoryJudgment(out, ['W1', 'W2'])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ label: 'W1', natural: 8, targets: 6 })
    expect(r[0].overall).toBeCloseTo(7.0, 1)
    expect(r[1].note).toBe('W2 leans on discussion')
  })

  it('ignores a label that was not shown', () => {
    expect(parseStoryJudgment('W9: natural=9 causality=9', ['W1'])).toBeNull()
  })

  it('keeps the first verdict when a label is scored twice', () => {
    const twice = 'W1: natural=8 causality=8\nW1: natural=2 causality=2'
    expect(parseStoryJudgment(twice, ['W1'])[0].natural).toBe(8)
  })

  it('clamps a score outside 1-10 rather than trusting it', () => {
    expect(parseStoryJudgment('W1: natural=99 causality=0', ['W1'])[0]).toMatchObject({ natural: 10, causality: 1 })
  })

  it('survives commentary around the lines', () => {
    const noisy = 'Here is my assessment.\n\nW1: natural=7 causality=7 | fine\n\nHope that helps!'
    expect(parseStoryJudgment(noisy, ['W1', 'W2'])[0].natural).toBe(7)
  })
})

describe('aggregateJudgement — a writer never scores itself', () => {
  const anonMapping = [
    { key: 'A|groq:qwen', anon: 'W1' },
    { key: 'A|groq:gpt-oss', anon: 'W2' },
    { key: 'B|groq:qwen', anon: 'W2' },
    { key: 'B|groq:gpt-oss', anon: 'W1' },
  ]
  const judgeLog = [
    { plan: 'A', scores: [{ label: 'W1', overall: 9, natural: 9 }, { label: 'W2', overall: 5, natural: 5 }] },
    { plan: 'B', scores: [{ label: 'W1', overall: 6, natural: 6 }, { label: 'W2', overall: 8, natural: 8 }] },
  ]

  it('resolves anonymous labels back to writers per plan', () => {
    // W1 is qwen on plan A and gpt-oss on plan B — the whole point of keying
    // the shuffle on the plan.
    const r = aggregateJudgement(judgeLog, anonMapping)
    const qwen = r.find(x => x.writer === 'groq:qwen')
    expect(qwen.stories).toBe(2)
    expect(qwen.overall).toBeCloseTo(8.5, 1)   // 9 on A, 8 on B
  })

  it('drops the judge\'s own stories instead of counting them', () => {
    const r = aggregateJudgement(judgeLog, anonMapping, 'groq:qwen')
    expect(r.map(x => x.writer)).toEqual(['groq:gpt-oss'])
    expect(r[0].stories).toBe(2)
  })

  it('is versioned', () => {
    expect(JUDGE_VERSION).toBe('fab9-writer-judge@1')
  })
})
