import { describe, expect, it } from 'vitest'
import { schedule } from './srs'
import { createStudyGradeIntent, advanceStudyGrade } from './studyGradeIntent'

const track = { language: 'chinese', system: 'hsk_3' }
const card = { id: 'c1', user_id: 'u1', vocab_id: 'v1', revision: 3, state: 'learning', reps: 1,
  due_at: '2026-09-28T09:00:00.000Z', vocab: { id: 'v1', level: 1 }, vocabulary: { level: 1 } }
const result = { updates: { state: 'learning', reps: 2, due_at: '2026-09-28T10:00:00.000Z' }, stay: true, gap: 2 }
const intent = createStudyGradeIntent({ card, result, grade: 0, userId: 'u1', track, generation: 7, day: '2026-09-28', opId: 'op1' })
const saved = { ok: true, pending: false, cardId: 'c1', card: { ...card, ...result.updates, revision: 4 } }

describe('original grade intent and acknowledged queue transition', () => {
  it('retains the complete expected snapshot while excluding view-only joins', () => {
    expect(intent).toMatchObject({ opId: 'op1', generation: 7, day: '2026-09-28', state: 'learning', language: 'chinese', level: 1 })
    expect(intent.expected).toMatchObject({ id: 'c1', revision: 3, reps: 1, due_at: card.due_at })
    expect(intent.expected.vocab).toBeUndefined()
    expect(intent.expected.vocabulary).toBeUndefined()
  })
  it('sends genuine schedule output and expected absence for an unseen word', () => {
    const fresh = { vocab_id: 'v2', state: 'new', vocab: { level: 2 } }
    const scheduled = schedule(fresh, 2)
    const produced = createStudyGradeIntent({ card: fresh, result: scheduled, grade: 2, userId: 'u1', track, day: '2026-09-28' })
    expect(produced.expected).toBeNull()
    expect(produced.updates).toEqual(scheduled.updates)
    expect(produced.log).toMatchObject({ grade: 2, previous_state: 'new', next_state: scheduled.updates.state })
    expect(produced.updates.reps).toBe(1)
  })
  it('reinserts Again only from its exact acknowledged server transition', () => {
    const other = { vocab_id: 'v2' }
    const queue = advanceStudyGrade([card, other], card, result, saved, intent)
    expect(queue[0]).toEqual(other)
    expect(queue[1]).toMatchObject({ id: 'c1', revision: 4 })
  })
  it('does not schedule the same pending offline word twice', () => {
    expect(advanceStudyGrade([card], card, result, { ...saved, pending: true }, intent)).toEqual([])
  })
  it('does not reinsert an original Again after another device already graduated it', () => {
    const current = { ...saved, card: { ...saved.card, revision: 5, state: 'review', reps: 3 } }
    expect(advanceStudyGrade([card], card, result, current, intent)).toEqual([])
  })
  it('rejects replacement identity or different due time even with a matching revision', () => {
    expect(advanceStudyGrade([card], card, result, { ...saved, cardId: 'c2', card: { ...saved.card, id: 'c2' } }, intent)).toEqual([])
    expect(advanceStudyGrade([card], card, result, { ...saved, card: { ...saved.card, due_at: '2026-10-01T10:00:00Z' } }, intent)).toEqual([])
  })
})
