import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { writesLegacyColumn, stripComments } from './tools/legacyColumnGuard.mjs'

// CLAUDE.md §10: `ease_factor` is a dead SM-2 column, kept in the database and
// never written. FSRS replaced it with `stability` and `difficulty` in
// 20260606120000, which says so in its own header.
//
// The rule was documented in four places and broken in eight files: eleven
// writes in all — nine card INSERTs (Words, Dictionary, Analyzer ×2,
// ChatMission ×2, StoryReaderImmersive ×2, useStoryReaderCore), one UPDATE in
// Study's resetCard, and one in-memory card shape in sessionPrep.
//
// Harmless in effect, which is exactly why it spread: the column is NOT NULL
// with default 2.50, so every one of those writes was setting the value the
// database would have chosen anyway. Removing them changes no row. What it
// changes is that the next person reading Study.jsx does not learn the wrong
// lesson from it.
//
// A guard, not a one-time sweep, because that is the difference between fixing
// this and fixing it again next quarter.
//
// SCOPE, stated rather than implied: this guards src/. It does not and cannot
// guard SQL, and one SECURITY DEFINER function still writes the column from the
// server side — dict_add_to_deck, in the applied 20260719130000, reached from
// the Dictionary and every story reader's add-to-deck button. The migration
// that removes it is already written and awaiting review on
// claude/fab-26-narrow-client-grants; duplicating that rewrite here would put
// two competing definitions of one function in flight. docs/BACKLOG.md carries
// the dependency.

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

describe('the dead ease_factor column is never written', () => {
  it('no file under src/ assigns it', () => {
    const offenders = sourceFiles(SRC).filter(f => writesLegacyColumn(readFileSync(f, 'utf8')))
    expect(offenders, 'CLAUDE.md §10: ease_factor is a dead column and must not be written')
      .toEqual([])
  })

  it('still lets the rule be explained in prose', () => {
    // The guard must not push people into deleting the comments that say why
    // the rule exists. Named files rather than a count: `> 0` passed with three
    // of the four explanations deleted.
    const explaining = sourceFiles(SRC)
      .filter(f => /ease_factor/.test(readFileSync(f, 'utf8')))
      .map(f => path.basename(f))
    for (const f of ['creativeMode.js', 'knowledgeState.js', 'devTools.js', 'CreativeMode.jsx']) {
      expect(explaining, f + ' stopped explaining the rule — deleted to satisfy the scan?')
        .toContain(f)
    }
  })

  it('the scan can actually see an assignment', () => {
    // A scan that matches nothing passes forever, so this drives the REAL
    // predicate — imported, not re-declared. Weakening writesLegacyColumn
    // fails here rather than passing against a private copy of itself.
    expect(writesLegacyColumn("const row = { state: 'new', ease_factor: 2.5 }")).toBe(true)
    expect(writesLegacyColumn("const row = { 'ease_factor': 2.5 }")).toBe(true)
    expect(writesLegacyColumn('row.ease_factor = 2.5')).toBe(true)
    expect(writesLegacyColumn("row['ease_factor'] = 2.5")).toBe(true)
    expect(writesLegacyColumn("const row = { ['ease_factor']: 2.5 }")).toBe(true)
    expect(writesLegacyColumn('const row = { ease_factor, state }')).toBe(true)
  })

  it('does not fire on a read, or on prose about the rule', () => {
    expect(writesLegacyColumn('const x = card.ease_factor')).toBe(false)
    expect(writesLegacyColumn('if (card.ease_factor === 2.5) return')).toBe(false)
    expect(writesLegacyColumn('// never writes ease_factor')).toBe(false)
    // The two shapes the line-anchored version got wrong, and the reason it
    // got them wrong: it only dropped a line whose trimmed START was a comment.
    expect(writesLegacyColumn("state: 'new',  // was ease_factor: 2.5")).toBe(false)
    expect(writesLegacyColumn('{/* ease_factor: 2.5 was here */}')).toBe(false)
    expect(writesLegacyColumn('/*\n * ease_factor: 2.5\n */')).toBe(false)
  })

  it('does not read a // inside a string as the start of a comment', () => {
    // The stripper is a lexer approximation, and this is the part of the
    // approximation that has to hold: a URL in a string is not a comment, so
    // code after it is still scanned.
    const src = "const u = 'https://example.com'\nconst row = { ease_factor: 2.5 }"
    expect(stripComments(src)).toContain('ease_factor')
    expect(writesLegacyColumn(src)).toBe(true)
  })
})
