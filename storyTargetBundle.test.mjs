import { describe, it, expect } from 'vitest'
import {
  bundlePrompt, parseBundleJudgment, selectBundle, reinforcementPriority,
  applyDeferral, buildPool, BUNDLE, BUNDLE_POLICY, BUNDLE_VERSION,
} from './storyTargetBundle.mjs'

const POOL = buildPool(['关系', '女人', '男人', '帮助', '需要', '必须'], {
  关系: { timesDeferred: 2 },
  女人: { timesDeferred: 0 },
})

describe('the prompt asks two different questions', () => {
  const p = bundlePrompt({ pool: POOL, levelName: 'HSK 3', meanings: { 女人: 'woman' } })

  it('asks about each word alone AND about the set', () => {
    expect(p).toContain('For each word alone')
    expect(p).toContain('fit in ONE story together')
    expect(p).toContain('without inventing a separate subplot')
  })

  it('states the failure modes without blacklisting any word', () => {
    expect(p).toContain('relabel a character the reader already knows by name')
    expect(p).toContain('a category that is already obvious')
    // no word is condemned in the scaffolding — the candidates come from the pool
    const scaffolding = p.split('CANDIDATE WORDS:')[0]
    for (const w of ['男人', '女人', '关系']) expect(scaffolding).not.toContain(w)
  })

  it('says plainly that fewer natural targets beat more contrived ones', () => {
    expect(p).toContain('better than a contrived one')
    expect(p).toContain('come back in a later story')
  })

  it('shows every sense and the observed role, not the first gloss', () => {
    const senses = [{
      word: '被', level: 3, pos: null, senseCount: 2,
      senses: [{ text: 'quilt', verb: false }, { text: 'cover', verb: true }],
      gloss: 'quilt; to cover (with)', example: '折被子。', exampleTranslation: 'Fold the quilt.',
      corpusExamples: ['他被老师叫到办公室。'], corpusUses: 5,
      role: { role: 'grammatical', detail: 'stands between a noun and a verb in 4 of 5 uses', framed: 4, uses: 5 },
    }]
    const p = bundlePrompt({ pool: buildPool(['被']), levelName: 'HSK 3', senses })
    expect(p).toContain('1) quilt')
    expect(p).toContain('2) to cover')
    expect(p).toContain('OBSERVED ROLE')
    expect(p).toContain('他被老师叫到办公室。')
    expect(p).toContain('not by whichever English gloss is listed first')
  })

  it('shows the model what has already been put off', () => {
    expect(p).toContain('关系')
    expect(p).toContain('deferred 2×')
  })
})

describe('reading the judgement', () => {
  const out = [
    '关系: ROLE | the story is about two neighbours becoming friends, so the relationship is the point',
    '女人: ROLE | introduces someone the reader has not met',
    '男人: NO_ROLE | the only man present is already named, so it would relabel him',
    '帮助: ROLE | the offer of help is the action of the story',
    '需要: ROLE | states the problem that starts it',
    '必须: NO_ROLE | nothing in an everyday errand has to be stated as an obligation',
    'BUNDLE: 需要, 帮助, 关系',
    'SITUATION: a neighbour helps carry something upstairs',
  ].join('\n')

  it('reads per-word verdicts, the bundle and the situation', () => {
    const j = parseBundleJudgment(out, POOL.map(p => p.word))
    expect(j.roles).toHaveLength(6)
    expect(j.roles.find(r => r.word === '男人')).toMatchObject({ hasRole: false })
    expect(j.roles.find(r => r.word === '关系').hasRole).toBe(true)
    expect(j.bundle).toEqual(['需要', '帮助', '关系'])
    expect(j.situation).toContain('neighbour')
  })

  it('ignores words that were not candidates, and unusable output', () => {
    expect(parseBundleJudgment('BUNDLE: 苹果', ['关系'])).toBeNull()
    expect(parseBundleJudgment('the plan looks fine', ['关系'])).toBeNull()
  })
})

describe('selection — the model judges, the code decides', () => {
  const judgement = {
    roles: [
      { word: '关系', hasRole: true, reason: 'the relationship is the point' },
      { word: '女人', hasRole: true, reason: 'introduces an unknown person' },
      { word: '男人', hasRole: false, reason: 'would relabel a named character' },
      { word: '帮助', hasRole: true, reason: 'the action of the story' },
      { word: '需要', hasRole: true, reason: 'states the problem' },
      { word: '必须', hasRole: false, reason: 'nothing has to be an obligation here' },
    ],
    bundle: ['需要', '帮助', '关系'],
    situation: 'a neighbour helps carry something upstairs',
  }
  const s = () => selectBundle(judgement, { pool: POOL })

  it('splits the pool three ways', () => {
    const r = s()
    expect(r.required).toEqual(expect.arrayContaining(['需要', '帮助', '关系']))
    expect(r.deferred).toEqual(expect.arrayContaining(['男人', '必须']))
    expect(r.opportunity).toContain('女人')
    expect(r.enough).toBe(true)
  })

  it('keeps a reason for every word, including the deferred ones', () => {
    const row = s().rows.find(x => x.word === '男人')
    expect(row).toMatchObject({ bundle: BUNDLE.DEFERRED, hasRole: false })
    expect(row.reason).toContain('relabel')
  })

  it('never blacklists a word — the same word passes when it has a role', () => {
    // 男人 with a genuine role is REQUIRED, from the identical machinery.
    const other = {
      roles: [{ word: '男人', hasRole: true, reason: 'tells apart two people at the door' },
        { word: '需要', hasRole: true, reason: 'the problem' }],
      bundle: ['男人', '需要'],
      situation: 'someone at the door',
    }
    const r = selectBundle(other, { pool: buildPool(['男人', '需要']) })
    expect(r.required).toEqual(expect.arrayContaining(['男人', '需要']))
    expect(r.deferred).toEqual([])
  })

  it('prefers a word that has already been put off', () => {
    expect(reinforcementPriority({ timesDeferred: 2 })).toBeGreaterThan(reinforcementPriority({ timesDeferred: 0, weakness: 9 }))
    const crowded = {
      roles: ['关系', '女人', '帮助', '需要', '男人'].map(w => ({ word: w, hasRole: true, reason: 'ok' })),
      bundle: ['关系', '女人', '帮助', '需要', '男人'],
      situation: 'x',
    }
    const r = selectBundle(crowded, { pool: POOL })
    expect(r.required).toHaveLength(BUNDLE_POLICY.requiredMax)
    expect(r.required[0]).toBe('关系')          // deferred twice, so it goes first
  })

  it('does not chase density — a small bundle is a pass, not a failure', () => {
    const thin = {
      roles: [{ word: '需要', hasRole: true, reason: 'the problem' }, { word: '帮助', hasRole: true, reason: 'the action' },
        { word: '关系', hasRole: false, reason: 'no' }, { word: '女人', hasRole: false, reason: 'no' },
        { word: '男人', hasRole: false, reason: 'no' }, { word: '必须', hasRole: false, reason: 'no' }],
      bundle: ['需要', '帮助'],
      situation: 'x',
    }
    const r = selectBundle(thin, { pool: POOL })
    expect(r.required).toHaveLength(2)
    expect(r.required).toEqual(expect.arrayContaining(['需要', '帮助']))
    expect(r.enough).toBe(true)
    expect(r.toppedUp).toEqual([])
  })

  it('says so when it had to top up a bundle that was too thin', () => {
    const tiny = {
      roles: [{ word: '需要', hasRole: true, reason: 'the problem' }, { word: '女人', hasRole: true, reason: 'unknown person' }],
      bundle: ['需要'],
      situation: 'x',
    }
    const r = selectBundle(tiny, { pool: buildPool(['需要', '女人']) })
    expect(r.required).toEqual(expect.arrayContaining(['需要', '女人']))
    expect(r.toppedUp).toEqual(['女人'])
  })

  it('an unjudged word is deferred, not assumed fine', () => {
    const partial = { roles: [{ word: '需要', hasRole: true, reason: 'ok' }], bundle: ['需要'], situation: 'x' }
    const r = selectBundle(partial, { pool: POOL })
    expect(r.deferred).toContain('关系')
    expect(r.rows.find(x => x.word === '关系').reason).toContain('no verdict')
  })
})

describe('reinforcement debt — deferred means later, not never', () => {
  it('counts a deferral and clears it when the word is finally used', () => {
    const selection = selectBundle({
      roles: [{ word: '关系', hasRole: false, reason: 'no context' }, { word: '需要', hasRole: true, reason: 'ok' }],
      bundle: ['需要'], situation: 'x',
    }, { pool: buildPool(['关系', '需要'], { 关系: { timesDeferred: 1 } }) })
    const debt = applyDeferral({ 关系: { timesDeferred: 1 } }, selection, { at: '2026-08-26' })
    expect(debt['关系']).toMatchObject({ timesDeferred: 2, lastDeferredAt: '2026-08-26' })
    expect(debt['需要']).toMatchObject({ timesDeferred: 0, lastContextualExposure: '2026-08-26' })
  })

  it('carries the debt into the next pool, so it is not starved', () => {
    let debt = {}
    const deferOnce = () => {
      const pool = buildPool(['关系', '需要'], debt)
      const sel = selectBundle({
        roles: [{ word: '关系', hasRole: false, reason: 'no context' }, { word: '需要', hasRole: true, reason: 'ok' }],
        bundle: ['需要'], situation: 'x',
      }, { pool })
      debt = applyDeferral(debt, sel, { at: 'day' })
      return pool
    }
    deferOnce(); deferOnce()
    const pool = buildPool(['关系', '需要'], debt)
    expect(pool.find(p => p.word === '关系').timesDeferred).toBe(2)
    // and now it outranks everything the moment a context exists
    expect(reinforcementPriority(pool.find(p => p.word === '关系'))).toBeGreaterThan(1000)
    expect(BUNDLE_VERSION).toBe('fab9-bundle@3')
  })
})

// bundle-1 answered "A friend asking for advice on a conditional life choice,
// such as whether to accept a new job." That sentence became manifest.theme and
// cost 21 points before a beat was planned, while the three words it was
// choosing for — 如果 / 需要 / 认为 — cost nothing. The prompt now asks for a
// scene rather than a topic, and says so in the terms that failed.
describe('the situation must be a scene, not an English summary of one', () => {
  const prompt = bundlePrompt({
    pool: [{ word: '如果', level: 3 }, { word: '需要', level: 3 }, { word: '认为', level: 3 }],
    levelName: 'HSK 3',
    meanings: { 如果: 'if; in case', 需要: 'to need', 认为: 'to think' },
  })

  it('asks for something the reader could see', () => {
    expect(prompt).toMatch(/CONCRETE/)
    expect(prompt).toMatch(/could SEE happening/)
    expect(prompt).toMatch(/sayable with the words a HSK 3 learner has/)
  })

  it('names the abstractions that actually broke it, as a class', () => {
    for (const word of ['advice', 'a choice', 'a decision', 'options', 'an opportunity']) {
      expect(prompt).toContain(word)
    }
  })

  it('says grammar words do not make the scene abstract', () => {
    // The whole defect in one sentence: the judge read if/need/think and
    // concluded the STORY had to be about deliberation.
    expect(prompt).toMatch(/do not make the scene itself abstract/)
  })

  it('refuses the worked example that acted as a template', () => {
    // "such as whether to accept a new job" — all six candidates used a job.
    expect(prompt).toMatch(/Do NOT name an example/)
    expect(prompt).toMatch(/no example/)
  })
})

// bundle-concrete-1 was truncated after the per-word verdicts: no BUNDLE line,
// no SITUATION. Topping up from nothing then produced a confident-looking
// selection of 被 — the known vocabulary content defect — and 中, two words the
// model was never asked whether they belong in one story.
describe('a truncated judgement selects nothing', () => {
  const pool = [
    { word: '被', level: 3 }, { word: '中', level: 3 },
    { word: '如果', level: 3 }, { word: '需要', level: 3 },
  ]
  const roles = pool.map(p => ({ word: p.word, hasRole: true, reason: 'a verdict' }))

  it('refuses to top up when no BUNDLE was stated', () => {
    const r = selectBundle({ roles, bundle: null, situation: '' }, { pool })
    expect(r.stated).toBe(false)
    expect(r.required).toEqual([])
    expect(r.toppedUp).toEqual([])
    expect(r.enough).toBe(false)
    expect(r.incomplete).toMatch(/never stated a BUNDLE/)
    // Every word waits for the story it belongs in, rather than two being
    // conscripted into one nobody proposed.
    expect(r.deferred).toHaveLength(pool.length)
  })

  it('still tops up a bundle that was stated but is too thin', () => {
    const r = selectBundle({ roles, bundle: ['如果'], situation: 'It is raining.' }, { pool })
    expect(r.stated).toBe(true)
    expect(r.incomplete).toBeNull()
    expect(r.required).toContain('如果')
    expect(r.toppedUp.length).toBeGreaterThan(0)
  })

  it('a parsed judgement with no BUNDLE line has bundle null, not empty', () => {
    const out = ['如果: ROLE | introduces a condition.', '需要: ROLE | states a need.'].join('\n')
    const j = parseBundleJudgment(out, ['如果', '需要'])
    expect(j.roles).toHaveLength(2)
    expect(j.bundle).toBeNull()
  })
})
