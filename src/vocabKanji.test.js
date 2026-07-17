import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Guard against the kana-where-kanji-belongs regression: the JLPT N5 vocabulary
// was seeded with several words stored in kana that have a standard kanji form
// (e.g. きょねん where 去年 is expected), which surfaced as a bare-kana flashcard.
// data/jlpt-n5-kanji-corrections.json is the reviewed correction set; the fix is
// applied to production via fix-vocab-kanji.mjs and mirrored into the N5 vocab
// snapshot. These tests fail if a corrected kana form ever reappears in the
// snapshot (i.e. the fix was reverted or a re-seed reintroduced kana).

const snapshot = JSON.parse(readFileSync(new URL('../data/jlpt1-vocab-snapshot.json', import.meta.url), 'utf8'))
const corrections = JSON.parse(readFileSync(new URL('../data/jlpt-n5-kanji-corrections.json', import.meta.url), 'utf8'))
const words = new Set(snapshot.map(([w]) => w))

function hasKanji(s) { return /[㐀-鿿]/.test(s || '') }

describe('N5 vocabulary uses kanji where a kanji form was corrected', () => {
  it('no corrected word remains stored in kana', () => {
    // apply = unambiguous; byId = homophones resolved per-row by example context.
    const correctedKana = [...corrections.apply, ...(corrections.byId || [])]
    const regressed = correctedKana.filter(c => words.has(c.kana)).map(c => `${c.kana}→${c.kanji}`)
    expect(regressed, 'kana forms that should now be kanji: ' + regressed.join(', ')).toEqual([])
  })

  it('every corrected kanji form is present in the snapshot', () => {
    const missing = corrections.apply.filter(c => !words.has(c.kanji)).map(c => c.kanji)
    expect(missing, 'expected kanji missing from snapshot: ' + missing.join(', ')).toEqual([])
  })

  it('the correction map is well-formed (real kanji, no kana↔keep overlap)', () => {
    for (const c of corrections.apply) {
      expect(hasKanji(c.kanji), `not kanji: ${c.kanji}`).toBe(true)
      expect(c.kana).not.toBe(c.kanji)
    }
    const keep = new Set(corrections.keepKana)
    const overlap = corrections.apply.filter(c => keep.has(c.kana)).map(c => c.kana)
    expect(overlap, 'words both fixed and kept-as-kana: ' + overlap.join(', ')).toEqual([])
  })
})
