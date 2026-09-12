import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// FAB-28 finding 4, the wiring — and the regression test the fix owed.
//
// `dropQueuedWritesForTrack` is covered thoroughly in syncQueue.test.js, in
// isolation against a mocked outbox. What was not covered is the part that
// makes it do anything: the four `await` calls in JSX. Delete one of them and
// its import and the whole suite still passes, lint stays at zero, and the
// regression this change exists to fix is back for that path. syncQueue.test.js
// says as much about its own limits ("what they cannot reach is the JSX call
// sites"); naming a gap is not the same as closing it.
//
// This is a SOURCE-TEXT spec, and the honest description of what it proves is:
// every screen that calls a reset RPC also calls the drop and the session
// clear, and no fifth reset path exists that does neither. It does not prove
// they run in the right order or that the reset succeeded first — those live in
// the code's own comments and in review. A behavioural version would need
// IndexedDB seeded through Playwright against a mocked RPC; worth building if
// this area grows, and not worth its flakiness for four one-liners today.

const SRC = 'src'
const read = (f) => readFileSync(SRC + '/' + f, 'utf8')

// Comments in this area quote the RPC names constantly; only calls count.
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

// Recursive: src/ is flat by convention (CLAUDE.md §3) but has src/tts/ and
// src/migration/ in it, and a reset path added under one of those would
// otherwise be invisible to "no fifth reset path" — the assertion that is
// supposed to notice a new one.
const walk = (dir) => readdirSync(SRC + '/' + dir, { withFileTypes: true }).flatMap((e) => {
  const rel = dir ? dir + '/' + e.name : e.name
  if (e.isDirectory()) return walk(rel)
  return (e.name.endsWith('.js') || e.name.endsWith('.jsx')) && !e.name.includes('.test.') ? [rel] : []
})
const clientFiles = walk('')

// Both names: reset_current_language_progress is a delegating wrapper around
// reset_language_progress (20260725120000), so a screen calling either deletes
// the same rows and strands the same queued writes.
const RESET_RPC = /rpc\(\s*'reset_(current_)?language_progress'/

describe('every reset path drains the queued writes it invalidates', () => {
  const resetters = clientFiles.filter(f => RESET_RPC.test(codeOf(f)))

  it('finds the four reset paths, and no fifth', () => {
    // Profile has two (the reset panel and remove-language), Dev and
    // CreativeMode one each. A new one shows up here first.
    expect(resetters.sort()).toEqual(['CreativeMode.jsx', 'Dev.jsx', 'Profile.jsx'])
    const calls = resetters.reduce(
      (n, f) => n + (codeOf(f).match(new RegExp(RESET_RPC.source, 'g')) || []).length, 0)
    expect(calls, 'a reset path was added or removed').toBe(4)
  })

  // COUNTS, not "the file mentions it somewhere". Profile has two reset paths,
  // so a presence check passes with one of them gutted — which is exactly the
  // mutation this spec exists to catch, and exactly the defect it had in its
  // first draft: deleting one of Profile's two drop calls left it green.
  const countIn = (f, re) => (codeOf(f).match(re) || []).length
  const resetsIn = (f) => countIn(f, new RegExp(RESET_RPC.source, 'g'))

  it('drops the queued writes once per reset path, not once per file', () => {
    // The op that would otherwise be replayed either recreates a card the
    // reset deleted (cardId null takes grade_card's INSERT branch) or wedges
    // the queue forever on 'Card not found'.
    for (const f of resetters) {
      expect(countIn(f, /dropQueuedWritesForTrack\s*\(/g), f + ' has a reset path that drains nothing')
        .toBe(resetsIn(f))
    }
  })

  it('every one of them names the account it is dropping for', () => {
    // The outbox is one store per device, shared by every account that has
    // signed in on it, and the reset RPC deletes only auth.uid()'s rows. A drop
    // that cannot name the account has no business deleting from it — and the
    // function refuses without one, so a call that forgot would silently do
    // nothing rather than fail.
    for (const f of resetters) {
      const code = codeOf(f)
      for (const call of code.match(/dropQueuedWritesForTrack\s*\([^)]*\)/g) || []) {
        expect(call, f + ': ' + call + ' passes no account').toMatch(/,\s*[\w.]*(userId|user\.id)/)
      }
    }
  })

  it('clears the prepared session once per reset path', () => {
    // prepKey covers learner, track, level and day — none of which a reset
    // changes — so takePreparedSession would still match and open Study on a
    // queue built from cards that no longer exist.
    for (const f of resetters) {
      expect(countIn(f, /clearPreparedSession\s*\(\)/g), f + ' has a reset path that leaves the slot')
        .toBe(resetsIn(f))
    }
  })

  // One entry per reset call: where it starts, the p_language expression it
  // was given, and the first drop call that follows it. Pairing them is what
  // lets the assertions below be about a reset PATH rather than about a file.
  const pathsIn = (f) => {
    const code = codeOf(f)
    const starts = [...code.matchAll(new RegExp(RESET_RPC.source, 'g'))].map(m => m.index)
    return starts.map((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : code.length
      const segment = code.slice(start, end)
      const lang = segment.match(/p_language:\s*([A-Za-z_$][\w$]*)(\.[\w$]+)?/)
      const drop = segment.match(/dropQueuedWritesForTrack\s*\(([\s\S]*?)\)\s*$/m)
        || segment.match(/dropQueuedWritesForTrack\s*\(([\s\S]{0,240})/)
      return { file: f, segment, langBase: lang && lang[1], dropArgs: drop && drop[1] }
    })
  }
  const allPaths = () => resetters.flatMap(pathsIn)

  it('drops the track it just reset, not some other track in scope', () => {
    // The mutation this exists for: Profile's reset panel targets whichever
    // track the radio group selected, so swapping `targetTrack` for `track`
    // drains the ACTIVE track's queue and leaves the reset track's intact —
    // and every count-based assertion in this file stays green.
    //
    // Pinned through the RPC's own p_language argument rather than by naming
    // the variables here, so renaming them is not a false failure.
    for (const path of allPaths()) {
      expect(path.langBase, path.file + ': could not read p_language').toBeTruthy()
      expect(path.dropArgs, path.file + ': reset path with no drop').toBeTruthy()
      expect(
        new RegExp('(^|[^\\w$])' + path.langBase + '([^\\w$]|$)').test(path.dropArgs),
        path.file + ': reset uses ' + path.langBase + ' but the drop is given `' + path.dropArgs.trim() + '`',
      ).toBe(true)
    }
  })

  it('tells the drop which language the learner is actually on', () => {
    // Without it the drop falls back to its widest behaviour and deletes
    // untagged writes belonging to a track nothing was deleted from. The
    // fallback exists so the module has a defined answer, not so a call site
    // can use it — see shouldDropUntaggedOps.
    for (const path of allPaths()) {
      expect(path.dropArgs, path.file + ': the drop cannot tell which track is active')
        .toMatch(/activeLanguage:/)
    }
  })

  it('drops AFTER its own reset and after that reset\'s error guard', () => {
    // Before would empty the queue for a reset that then failed — losing
    // unsynced work to clean up after nothing. Per reset path now, not just the
    // first: the earlier version searched the whole file, so moving a drop up
    // between the RPC and its `if (error) return` still passed.
    for (const path of allPaths()) {
      const drop = path.segment.search(/dropQueuedWritesForTrack\s*\(/)
      const guard = path.segment.search(/if\s*\(\s*\w*[eE]rr\w*\s*[)?]/)
      expect(drop, path.file + ': reset path with no drop').toBeGreaterThan(-1)
      expect(guard, path.file + ': a reset with no error guard at all').toBeGreaterThan(-1)
      expect(drop, path.file + ': drops before the reset error is checked').toBeGreaterThan(guard)
    }
  })

  it('imports both rather than re-implementing either', () => {
    for (const f of resetters) {
      expect(codeOf(f), f).toMatch(/import \{[^}]*dropQueuedWritesForTrack[^}]*\} from '\.\/syncQueue'/)
      expect(codeOf(f), f).toMatch(/import \{[^}]*clearPreparedSession[^}]*\} from '\.\/sessionPrep'/)
    }
  })
})
