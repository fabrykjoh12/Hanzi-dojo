import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { classifyRun, publishable, DEFECT } from './storyVocabAudit.mjs'
import { reconcileInventory } from './storyContentDebt.mjs'

// The curriculum authority must be INDEPENDENT of the build output.
//
// data/hsk<N>.json is what build-hsk-vocab.mjs produced. Asking it whether a
// word belongs in the course is circular: hskEntryToRow returns null whenever
// forms[0] is a surname or a "variant of" cross-reference, so the artifact
// cannot report the words it dropped. Classifying the corpus debt against it
// produced "only 转 is a lost row, 3 occurrences" — wrong by two orders of
// magnitude.
//
// data/hsk-curriculum-bands.json is derived from the upstream word list itself
// and carries only word -> band. These tests pin that the two disagree, and
// that the authority wins.
const BANDS = 'data/hsk-curriculum-bands.json'
const bandsFile = existsSync(BANDS) ? JSON.parse(readFileSync(BANDS, 'utf8')) : null

// The four proven casualties, all HSK 3 — the level these stories teach.
const CASUALTIES = [
  ['船', 'boat', 'forms[0] is "variant of 船"'],
  ['纸', 'paper', 'forms[0] is "variant of 纸"'],
  ['怕', 'to fear', 'forms[0] is the surname Pa'],
  ['关', 'to close', 'forms[0] is the surname Guan'],
]

describe('the curriculum authority is independent of the build output', () => {
  it('exists and records where it came from', () => {
    expect(bandsFile, BANDS + ' is the authority; without it nothing can be classified').toBeTruthy()
    expect(bandsFile.source.project).toBe('drkameleon/complete-hsk-vocabulary')
    expect(bandsFile.source.license).toBe('MIT')
    // Word -> band only. No readings, no meanings: those are exactly the
    // fields the build gets wrong, and copying them would import the bug.
    for (const v of Object.values(bandsFile.bands).slice(0, 50)) expect(typeof v).toBe('number')
  })

  it('lists every known casualty at HSK 3', () => {
    for (const [word, gloss] of CASUALTIES) {
      expect(bandsFile.bands[word], word + ' (' + gloss + ') must be in the authority').toBe(3)
    }
  })

  it('and the generated HSK files DO omit them — the two genuinely disagree', () => {
    // If this ever fails it means ingestion was fixed, which is good news and
    // means these fixtures can be retired deliberately rather than silently.
    const generated = new Set()
    for (const f of ['data/hsk3.json', 'data/hsk4.json', 'data/hsk5.json', 'data/hsk6.json']) {
      if (!existsSync(f)) continue
      for (const r of JSON.parse(readFileSync(f, 'utf8'))) generated.add(r.word)
    }
    for (const [word, , why] of CASUALTIES) {
      expect(generated.has(word), word + ' should still be missing from the build output — ' + why).toBe(false)
    }
  })

  it('classifies a casualty as CURRICULUM_ROW_MISSING even though the build omits it', () => {
    // The whole point. The authority says the course teaches 船; the database
    // has no row; therefore this is an ingestion loss, not story-content debt.
    const curriculum = new Set(Object.entries(bandsFile.bands).filter(([, b]) => b <= 6).map(([w]) => w))
    const vocabMap = { 我: { word: '我', level: 1, meaning: 'I' } }
    for (const [word] of CASUALTIES) {
      const r = classifyRun(word, { vocabMap, curriculum })
      expect(r.defect, word).toBe(DEFECT.CURRICULUM_ROW_MISSING)
      expect(r.layer, word).toBe('ingestion')
    }
  })

  it('would misclassify them as story debt if the build output were used instead', () => {
    // Pins the bug this file exists to prevent, so nobody reintroduces the
    // circular authority without a failing test.
    const generatedAuthority = new Set(
      JSON.parse(readFileSync('data/hsk3.json', 'utf8')).map(r => r.word))
    const vocabMap = { 分钟: { word: '分钟', level: 1, meaning: 'minute' } }
    const r = classifyRun('船', { vocabMap, curriculum: generatedAuthority })
    expect(r.defect).not.toBe(DEFECT.CURRICULUM_ROW_MISSING)
  })
})

describe('the three inventories reconcile', () => {
  // learner-facing DB rows, intended upstream curriculum, and what is missing.
  // 4,995 is the DB inventory, NOT the curriculum denominator.
  const vocabMap = {
    我: { word: '我', level: 1 }, 你: { word: '你', level: 1 },
    他: { word: '他', level: 1 }, 你好: { word: '你好', level: 1 },
  }
  const curriculum = new Set(['我', '你', '他', '船', '纸'])

  it('reports each inventory separately and never conflates them', () => {
    const inv = reconcileInventory({ vocabMap, curriculum })
    expect(inv.learnerFacingRows).toBe(4)        // what the DB has
    expect(inv.intendedCurriculum).toBe(5)       // what the course lists
    expect(inv.intendedAndPresent).toBe(3)
    expect(inv.missingCurriculumRows).toBe(2)    // 船, 纸
    expect(inv.presentButNotIntended).toBe(1)    // 你好
    expect(inv.missing).toEqual(['纸', '船'].sort())
  })

  it('both identities must hold, or the counts are not trustworthy', () => {
    const inv = reconcileInventory({ vocabMap, curriculum })
    expect(inv.reconciles).toBe(true)
    expect(inv.intendedCurriculum).toBe(inv.intendedAndPresent + inv.missingCurriculumRows)
    expect(inv.learnerFacingRows).toBe(inv.intendedAndPresent + inv.presentButNotIntended)
  })

  it('a missing row is not the same as a word the course never taught', () => {
    const inv = reconcileInventory({ vocabMap, curriculum })
    // 船 is missing (the course teaches it). 你好 is extra (it does not).
    expect(inv.missing).toContain('船')
    expect(inv.extra).toContain('你好')
    expect(inv.missing).not.toContain('你好')
  })
})

// The gate must reject text a learner cannot resolve WITHOUT making legitimate
// proper nouns unpublishable. It uses the Reader's own name path
// (storyNamesFor), which recognises a name two ways, and these tests pin both.
describe('publication gate — proper-noun exception semantics', () => {
  const vocabMap = {
    我: { word: '我', level: 1, meaning: 'I' }, 去: { word: '去', level: 1, meaning: 'to go' },
    很: { word: '很', level: 1, meaning: 'very' }, 好: { word: '好', level: 1, meaning: 'good' },
    的: { word: '的', level: 1, meaning: 'of' }, 书: { word: '书', level: 1, meaning: 'book' },
  }
  const gate = (content) => publishable({ title: 't', content }, { vocabMap })

  it('accepts a character introduced by a speaker label, with no registration at all', () => {
    // collectStoryNames derives names from the story's own speaker labels, so a
    // brand-new character costs nothing.
    expect(gate('王小雨: 我很好。').ok).toBe(true)
  })

  it('accepts a canonical character even when they never speak', () => {
    // 李明 is in src/characterNames.js, so narration alone is enough.
    expect(gate('李明很好。').ok).toBe(true)
  })

  it('refuses a NEW character who only ever appears in narration', () => {
    // Correct: the Reader would render them as untappable text. The fix is to
    // give them a speaker line or add them to the canon.
    expect(gate('王小雨很好。').ok).toBe(false)
  })

  it('names both supported paths when it refuses', () => {
    const r = gate('王小雨很好。')
    expect(r.remedy).toMatch(/speaker label/)
    expect(r.remedy).toMatch(/characterNames/)
  })

  it('a place name has no path today, and that is a real gap — not a silent pass', () => {
    // No published story uses one, so this is forward-looking. The canon's
    // payload is { word, reading } and carries nothing person-specific, so a
    // place added to src/characterNames.js resolves identically for the Reader.
    expect(gate('我去北京。').ok).toBe(false)
    expect(gate('我去北京。').offenders.map(o => o.run)).toContain('北京')
  })

  it('does NOT refuse a proper noun the vocabulary itself carries', () => {
    const withCountry = { ...vocabMap, 中国: { word: '中国', level: 1, meaning: 'China' } }
    expect(publishable({ title: 't', content: '我去中国。' }, { vocabMap: withCountry }).ok).toBe(true)
  })

  it('never accepts an ordinary unknown word by mistaking it for a name', () => {
    // The one thing the exception must not become: a hole. 缸 is not a name.
    expect(gate('我的缸很好。').ok).toBe(false)
  })
})

// The baseline is an accepted record of learner-facing debt. A run that
// regenerates it silently would make the check meaningless, and pushing one to
// main would bypass review entirely. Both guards are asserted here because the
// workflow cannot be dispatched on main to prove it until this merges — main's
// copy of content-utils.yml does not offer the task yet.
describe('baseline acceptance is explicit and never touches main', () => {
  const wf = readFileSync('.github/workflows/content-utils.yml', 'utf8')

  it('offers a compare-only task and a separate accept task', () => {
    expect(wf).toMatch(/content-integrity,\s*content-integrity-accept/)
    expect(wf).toMatch(/node check-content-integrity\.mjs\n/)          // compare-only
    expect(wf).toMatch(/node check-content-integrity\.mjs --update-baseline/)
  })

  it('the accept task refuses on main', () => {
    const accept = wf.slice(wf.indexOf('content-integrity-accept" ]; then'))
    expect(accept).toMatch(/GITHUB_REF_NAME" = "main"/)
    expect(accept).toMatch(/Refusing to rewrite the content-integrity baseline on main/)
    expect(accept).toMatch(/exit 1/)
  })

  it('the commit step is independently gated on the ref, so there are two guards', () => {
    expect(wf).toMatch(/if: inputs\.task == 'content-integrity-accept' && github\.ref_name != 'main'/)
    expect(wf).toMatch(/refusing to push a baseline to main/)
  })

  it('only the accept task ever writes the baseline', () => {
    // The compare-only path must not contain --update-baseline anywhere.
    const compare = wf.slice(wf.indexOf('content-integrity" ]; then'), wf.indexOf('content-integrity-accept" ]; then'))
    expect(compare).not.toMatch(/--update-baseline/)
  })

  it('the checker itself only writes when the flag is passed', () => {
    const src = readFileSync('check-content-integrity.mjs', 'utf8')
    expect(src).toMatch(/const update = args\.includes\('--update-baseline'\)/)
    // The single writeFileSync is inside the `if (update)` branch.
    expect(src.split('writeFileSync').length - 1).toBe(2)   // the import and the one call
    expect(src.slice(src.indexOf('if (update)'))).toMatch(/writeFileSync\(BASELINE/)
  })
})

// The report header says "level 1-6" and MAX_LEVEL is 6, but the live query
// took every non-null level — correct today only because production happens to
// hold no active Chinese 7-9 rows. Seeding one would have silently widened
// inventory A, the reconciliation and the story classification at once. The
// bound is structural, so it cannot quietly disappear.
describe('the live vocabulary query is bounded to the taught bands', () => {
  const src = readFileSync('check-content-integrity.mjs', 'utf8')
  // Negative assertions read CODE, not the comments explaining what the code no
  // longer does — the prose naming an old construct would match them.
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  it('constrains language, active flag and BOTH ends of the level range', () => {
    const q = src.slice(src.indexOf("fetchAll('vocabulary'"), src.indexOf("fetchAll('stories'"))
    expect(q).toMatch(/\.eq\('language', 'chinese'\)/)
    expect(q).toMatch(/\.eq\('is_active', true\)/)
    expect(q).toMatch(/\.gte\('level', MIN_BAND\)/)
    expect(q).toMatch(/\.lte\('level', MAX_LEVEL\)/)
  })

  it('no longer relies on a bare non-null level filter', () => {
    expect(code).not.toMatch(/\.not\('level', 'is', null\)/)
  })

  it('bounds the query with the same MAX_LEVEL the report prints', () => {
    expect(src).toMatch(/const MAX_LEVEL = 6/)
    // The header text and the query must move together.
    expect(src).toMatch(/level 1-' \+ MAX_LEVEL/)
  })

  it('loads the curriculum authority fail-closed, with no degraded fallback', () => {
    expect(src).toMatch(/curriculumWords\(doc, \{ maxLevel: MAX_LEVEL/)
    // The construct that failed open.
    expect(code).not.toMatch(/\.bands \|\| \{\}/)
    expect(src).toMatch(/CURRICULUM AUTHORITY UNUSABLE/)
    expect(src).toMatch(/process\.exit\(2\)/)
  })
})
