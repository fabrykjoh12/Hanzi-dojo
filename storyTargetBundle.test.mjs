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
    expect(BUNDLE_VERSION).toBe('fab9-bundle@1')
  })
})
