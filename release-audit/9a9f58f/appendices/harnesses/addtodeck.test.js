import { describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hskVocabRows } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/fakePostgrest.js'
import { todayStr } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/streak.js'
const db = vi.hoisted(() => ({ current: null }))
vi.mock('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/supabase.js', () => ({ supabase: { from: (...a) => db.current.from(...a) } }))
vi.mock('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/offline.js', () => ({ cacheGet: vi.fn(async () => null), cacheSet: vi.fn() }))
vi.mock('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/ttsAudio.js', () => ({ loadTtsAudio: vi.fn(async () => {}) }))
import { buildStudySession } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/sessionPrep.js'

describe('add-to-deck card (state new, reps 0, no claim)', () => {
  it('is it ever served by Study?', async () => {
    const vocabulary = hskVocabRows([1])
    const weekAgo = new Date(Date.now() - 7*864e5).toISOString()
    // learner has graded word 0 (review, not due); added words 1..3 via add-to-deck days ago
    const cards = [
      { id: 'c0', user_id: 'u1', vocab_id: vocabulary[0].id, state: 'review', reps: 3, due_at: new Date(Date.now()+30*864e5).toISOString(), created_at: weekAgo, stability: 10, lapses: 0 },
      ...[1,2,3].map(i => ({ id: 'c'+i, user_id: 'u1', vocab_id: vocabulary[i].id, state: 'new', learning_step: 0, reps: 0, due_at: weekAgo, created_at: weekAgo })),
    ]
    db.current = fakeSupabase({ vocabulary, cards })
    const data = await buildStudySession({ userId: 'u1', profile: { daily_new_cards: 10, last_studied_on: todayStr() }, track: { language: 'chinese', system: 'hsk_3', current_level: 1 } })
    const ids = data.queue.map(c => c.vocab_id)
    console.log('RESULT queue size', ids.length, 'added words served:', [1,2,3].map(i => ids.includes(vocabulary[i].id)))
    console.log('RESULT first queue items', data.queue.slice(0,4).map(c => c.vocab_id + ':' + c.state + ':' + (c.id||'null')))
    // level-null dictionary save too
  })
})

describe('add-to-deck TODAY consumes the daily new allotment', () => {
  it('10 words added from a story today, daily_new_cards 10', async () => {
    const vocabulary = hskVocabRows([1])
    const nowIso = new Date().toISOString()
    const cards = [10,11,12,13,14,15,16,17,18,19].map(i => ({ id: 'a'+i, user_id: 'u1', vocab_id: vocabulary[i].id, state: 'new', learning_step: 0, reps: 0, due_at: nowIso, created_at: nowIso }))
    db.current = fakeSupabase({ vocabulary, cards })
    const data = await buildStudySession({ userId: 'u1', profile: { daily_new_cards: 10, last_studied_on: todayStr() }, track: { language: 'chinese', system: 'hsk_3', current_level: 1 } })
    console.log('RESULT queue size after adding 10 today:', data.queue.length, 'added served:', data.queue.filter(c => cards.some(k => k.vocab_id === c.vocab_id)).length)
  })
})
