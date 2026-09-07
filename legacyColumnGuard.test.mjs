import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// CLAUDE.md §10: `ease_factor` is a dead SM-2 column, kept in the database and
// never written. FSRS replaced it with `stability` and `difficulty` in
// 20260606120000, which says so in its own header.
//
// The rule was documented in four places and broken in eight files. Ten card
// INSERTs carried `ease_factor: 2.5` — Words, Dictionary, Analyzer (×2),
// ChatMission (×2), StoryReaderImmersive (×2), Study, and one in-memory card
// shape in sessionPrep.
//
// Harmless in effect, which is exactly why it spread: the column is NOT NULL
// with default 2.50, so every one of those writes was setting the value the
// database would have chosen anyway. Removing them changes no row. What it
// changes is that the next person reading Study.jsx does not learn the wrong
// lesson from it.
//
// A guard, not a one-time sweep, because that is the difference between fixing
// this and fixing it again next quarter.

const SRC = 'src'

function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) { out.push(...sourceFiles(p)); continue }
    if (/\.(js|jsx)$/.test(name) && !/\.test\.(js|jsx)$/.test(name)) out.push(p)
  }
  return out
}

// Comments discuss the column deliberately — creativeMode.js, knowledgeState.js,
// devTools.js and CreativeMode.jsx all explain why they do NOT write it, and
// those explanations are worth keeping. So the scan looks for an assignment in
// code, not a mention in prose.
const stripComments = (src) => src
  .split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n')

describe('the dead ease_factor column is never written', () => {
  it('no file under src/ assigns it', () => {
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      const code = stripComments(readFileSync(file, 'utf8'))
      // Object-literal form (`ease_factor: 2.5`) and property form
      // (`row.ease_factor =`), which are the two ways it could come back.
      if (/\bease_factor\s*:/.test(code) || /\.ease_factor\s*=/.test(code)) offenders.push(file)
    }
    expect(offenders, 'CLAUDE.md §10: ease_factor is a dead column and must not be written')
      .toEqual([])
  })

  it('still lets the rule be explained in prose', () => {
    // The guard must not push people into deleting the comments that say why
    // the rule exists. Four files discuss it on purpose.
    const explain = sourceFiles(SRC).filter(f => /ease_factor/.test(readFileSync(f, 'utf8')))
    expect(explain.length, 'the explanatory comments were deleted to satisfy the scan')
      .toBeGreaterThan(0)
  })

  it('the scan can actually see an assignment', () => {
    // A scan that matches nothing passes forever. Both spellings are driven
    // through the same predicate the test above uses.
    const detect = (code) => /\bease_factor\s*:/.test(stripComments(code))
      || /\.ease_factor\s*=/.test(stripComments(code))
    expect(detect("const row = { state: 'new', ease_factor: 2.5 }")).toBe(true)
    expect(detect('row.ease_factor = 2.5')).toBe(true)
    expect(detect('// never writes ease_factor')).toBe(false)
    expect(detect('const x = card.ease_factor')).toBe(false)   // a READ is fine
  })
})
