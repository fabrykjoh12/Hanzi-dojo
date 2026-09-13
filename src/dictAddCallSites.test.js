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

describe('every screen that adds a dictionary word explains why it did not', () => {
  // Detection is deliberately broader than one spelling, because the point is
  // to catch a call site nobody remembered to update. It looks for the wrapper
  // AND for the RPC underneath it, which is the house pattern used two
  // functions away in Dictionary.jsx.
  const callers = clientFiles.filter((f) => {
    const code = codeOf(f)
    return /addDictEntryToDeck\s*\(/.test(code) || /rpc\(\s*'dict_add_to_deck'/.test(code)
  })
    // Where the wrapper and the copy are defined, not screens that use them.
    .filter(f => f !== 'dictSearch.js' && f !== 'dictAddFeedback.js')

  it('finds exactly the three screens that add a dictionary word', () => {
    expect(callers.sort()).toEqual(['Dictionary.jsx', 'StoryReaderImmersive.jsx', 'useStoryReaderCore.js'])
  })

  it('every one of them routes its failure through the shared copy', () => {
    // Not "contains the limit message": that literal was the earlier
    // assertion, and it would have failed the moment the copy moved into a
    // module — which is the refactor CLAUDE.md §3 asks for and which this
    // change made. What matters is that no screen invents its own wording or
    // swallows the error, so the three refusals stay three refusals everywhere.
    const missing = callers.filter(f => !/dictAddToast\s*\(/.test(codeOf(f)))
    expect(missing, 'these add a dictionary word without saying why it failed')
      .toEqual([])
  })

  it('every one of them imports it rather than re-implementing it', () => {
    for (const f of callers) {
      expect(codeOf(f), f + ' must import dictAddToast')
        .toMatch(/import \{[^}]*dictAddToast[^}]*\} from '\.\/dict(Search|AddFeedback)'/)
    }
  })

  it('no screen hardcodes one of the three refusal messages', () => {
    // The copy lives in one place. A literal here would drift from it silently,
    // which is how the shared brake came to say "that's enough new words for
    // today" to a learner who had added nothing.
    for (const f of callers) {
      expect(codeOf(f), f + ' hardcodes refusal copy')
        .not.toMatch(/enough new words for today|dictionary is busy/i)
    }
  })
})
