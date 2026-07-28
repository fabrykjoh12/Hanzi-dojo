import { describe, it, expect } from 'vitest'
import { missingVocabIds, mergeVocab } from './deckVocab'

// The regression these specs exist for: a card whose vocabulary the level-scoped
// load didn't return was silently dropped from the study queue, so a word saved
// from a story ("save" → marked as started) could never be reviewed.
describe('missingVocabIds', () => {
  it('names the cards whose vocabulary the level load did not return', () => {
    const cards = [{ vocab_id: 'a' }, { vocab_id: 'b' }, { vocab_id: 'c' }]
    expect(missingVocabIds(cards, { a: { id: 'a' } })).toEqual(['b', 'c'])
  })

  it('is empty when every card resolved — no needless second query', () => {
    const cards = [{ vocab_id: 'a' }, { vocab_id: 'b' }]
    expect(missingVocabIds(cards, { a: { id: 'a' }, b: { id: 'b' } })).toEqual([])
  })

  it('dedupes, so one id is fetched once however many cards point at it', () => {
    const cards = [{ vocab_id: 'x' }, { vocab_id: 'x' }, { vocab_id: 'y' }, { vocab_id: 'x' }]
    expect(missingVocabIds(cards, {})).toEqual(['x', 'y'])
  })

  it('ignores rows with no vocab_id rather than fetching undefined', () => {
    expect(missingVocabIds([{ vocab_id: null }, {}, null, { vocab_id: 'z' }], {})).toEqual(['z'])
  })

  it('is empty for no cards at all', () => {
    expect(missingVocabIds(null, {})).toEqual([])
    expect(missingVocabIds([], {})).toEqual([])
  })
})

describe('mergeVocab', () => {
  it('adds the fetched rows', () => {
    const merged = mergeVocab({ a: { id: 'a', level: 1 } }, [{ id: 'b', level: null }])
    expect(merged.a.level).toBe(1)
    expect(merged.b).toEqual({ id: 'b', level: null })
  })

  it('never overwrites a row the level-scoped load already resolved', () => {
    const merged = mergeVocab({ a: { id: 'a', word: 'canonical' } }, [{ id: 'a', word: 'stale' }])
    expect(merged.a.word).toBe('canonical')
  })

  it('does not mutate the map it was given', () => {
    const original = { a: { id: 'a' } }
    mergeVocab(original, [{ id: 'b' }])
    expect(original.b).toBeUndefined()
  })

  it('tolerates junk rows', () => {
    expect(mergeVocab({}, [null, {}, { id: 'ok' }])).toEqual({ ok: { id: 'ok' } })
  })
})
