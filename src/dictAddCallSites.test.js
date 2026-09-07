import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// FAB-26 finding 3, the client half — and the regression test the fix owed.
//
// The rate limit is only useful if a capped learner is told. Round 1 of the
// review found the message missing everywhere; round 2 found that the fix had
// reached two of the three call sites, and the third — StoryReaderImmersive,
// which is the classic reader and an equal choice rather than a fallback — still
// said "Couldn't save that word". Nothing would have caught that, and nothing
// would catch a fourth call site added later.
//
// So this enumerates the call sites from the source instead of listing them: add
// one that does not consult isDictAddLimit and this fails, naming the file.
//
// A source-text spec, deliberately. The repo has no component tests and no
// *.test.jsx at all, so a rendering assertion would be a new kind of test
// infrastructure for one message; this is the same shape the migration specs in
// clientGrantMigrations.test.mjs already use, applied to JSX.

const SRC = 'src'
const read = (f) => readFileSync(SRC + '/' + f, 'utf8')

// Comments talk about addDictEntryToDeck constantly; only calls count.
const codeOf = (f) => read(f)
  .split('\n')
  .map((line) => {
    const i = line.indexOf('//')
    if (i === -1) return line
    const before = line.slice(0, i)
    return (before.match(/['"`]/g) || []).length % 2 === 0 ? before : line
  })
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const clientFiles = readdirSync(SRC)
  .filter(n => (n.endsWith('.js') || n.endsWith('.jsx')) && !n.includes('.test.'))

describe('every screen that adds a dictionary word explains the daily limit', () => {
  const callers = clientFiles.filter(f => codeOf(f).includes('addDictEntryToDeck('))
    // dictSearch.js is where the function is defined and the predicate lives.
    .filter(f => f !== 'dictSearch.js')

  it('finds the call sites at all', () => {
    // If this ever drops to zero the rest of the file passes vacuously.
    expect(callers.length).toBeGreaterThanOrEqual(3)
    expect(callers.sort()).toEqual(['Dictionary.jsx', 'StoryReaderImmersive.jsx', 'useStoryReaderCore.js'])
  })

  it('every one of them consults isDictAddLimit', () => {
    const missing = callers.filter(f => !codeOf(f).includes('isDictAddLimit('))
    expect(missing, 'these add a dictionary word without handling the daily limit')
      .toEqual([])
  })

  it('every one of them imports it from the one place it is defined', () => {
    // A local re-implementation would pass the check above and drift from the
    // migration's SQLSTATE the first time either changes.
    for (const f of callers) {
      expect(codeOf(f), f + ' must import isDictAddLimit from ./dictSearch')
        .toMatch(/import \{[^}]*isDictAddLimit[^}]*\} from '\.\/dictSearch'/)
    }
  })

  it('says something specific rather than reusing the generic failure', () => {
    for (const f of callers) {
      expect(codeOf(f), f + ' shows no limit-specific message')
        .toContain('That’s enough new words for today')
    }
  })
})
