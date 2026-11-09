import { describe, it, vi, expect } from 'vitest'
const store = vi.hoisted(() => ({ rows: [], next: 1 }))
vi.mock('/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/offline.js', () => ({
  outboxAdd: async (op) => { const id = store.next++; store.rows.push({ id, op }); return id },
  outboxAll: async () => store.rows.slice(),
  outboxDelete: async (id) => { store.rows = store.rows.filter(r => r.id !== id) },
  outboxCount: async () => store.rows.length,
}))
import { enqueueGrade, flushOutbox, gradeCardWrite, nextActivityCounts, newOpId } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/syncQueue.js'
import { schedule } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/srs.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// JS model of grade_card (20260906120000) + PostgREST uuid arg cast
function fakeServer() {
  const s = { cards: {}, logs: [], activity: {}, seq: 1 }
  s.rpc = async (name, a) => {
    for (const k of ['p_card_id', 'p_vocab_id', 'p_op_id']) if (a[k] != null && !UUID.test(a[k])) return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid: "' + a[k] + '"' } }
    if (a.p_op_id) { const l = s.logs.find(l => l.op === a.p_op_id); if (l) return { data: { card_id: l.card, log_id: l.id, already_applied: true }, error: null } }
    const inc = a.p_updates.reps; let stale = false, id, inserted = false
    if (a.p_card_id) {
      const c = s.cards[a.p_card_id]; if (!c) return { data: null, error: { code: 'P0001', message: 'Card not found' } }
      if (inc == null || c.reps == null || inc > c.reps) Object.assign(c, a.p_updates); else stale = true
      id = c.id
    } else {
      let c = Object.values(s.cards).find(c => c.vocab_id === a.p_vocab_id)
      if (!c) { id = '00000000-0000-4000-8000-' + String(s.seq++).padStart(12, '0'); s.cards[id] = { id, vocab_id: a.p_vocab_id, ...a.p_updates }; inserted = true }
      else if (inc > c.reps) { Object.assign(c, a.p_updates); id = c.id } else { stale = true; id = c.id }
    }
    let log_id = null
    if (a.p_log && !stale) { log_id = s.seq++; s.logs.push({ id: log_id, card: id, op: a.p_op_id }) }
    if (a.p_activity && !stale) {
      const d = a.p_activity.date, cur = s.activity[d] || { studied: 0 }
      s.activity[d] = { studied: a.p_activity.mode === 'increment' ? cur.studied + a.p_activity.studied : a.p_activity.studied }
    }
    return { data: { card_id: id, log_id, already_applied: false, inserted, stale }, error: null }
  }
  s.from = () => { throw new Error('legacy path not expected') }
  return s
}
const VOCAB = '11111111-1111-4111-8111-111111111111'

describe('offline brand-new card graded twice in one session', () => {
  it('replays', async () => {
    store.rows = []
    const srv = fakeServer()
    // Study offline branch, verbatim logic: card.id null -> local id; reinserted item carries id: cardId
    let card = { id: null, vocab_id: VOCAB, state: 'new', interval_days: 0, learning_step: 0 }
    const grades = [2, 2, 2]
    for (const g of grades) {
      const res = schedule(card, g)
      let cardId = card.id
      if (!cardId) cardId = 'local-' + Date.now() + '-' + card.vocab_id
      await enqueueGrade({ userId: 'u1', language: 'chinese', system: 'hsk_3', vocabId: card.vocab_id, cardId: card.id || null, updates: res.updates, log: {}, day: '2026-11-09', state: card.state })
      console.log('RESULT grade', g, '->', res.updates.state, 'reps', res.updates.reps, 'stay', res.stay, 'op.cardId', store.rows[store.rows.length-1].op.cardId)
      if (!res.stay) break
      card = { ...card, ...res.updates, id: cardId }
    }
    const r1 = await flushOutbox(srv, 'u1')
    const r2 = await flushOutbox(srv, 'u1')
    const c = Object.values(srv.cards)[0]
    console.log('RESULT flush1', r1, 'flush2', r2, 'outbox left', store.rows.length, 'server card reps', c.reps, 'state', c.state, 'logs', srv.logs.length, 'activity', JSON.stringify(srv.activity))
  })
})

describe('daily_activity set mode across two Study mounts same day', () => {
  it('overwrites', async () => {
    const srv = fakeServer(); const day = '2026-11-09'
    async function session(n, vocabBase) {
      let act = { studied: 0, newC: 0, learn: 0, review: 0 } // activityRef initial value, Study.jsx:253
      for (let i = 0; i < n; i++) {
        const v = vocabBase + String(i).padStart(12, '0')
        const res = schedule({ id: null, vocab_id: v, state: 'new' }, 3)
        const nc = nextActivityCounts(act, 'new')
        await gradeCardWrite(srv, { userId: 'u1', cardId: null, vocabId: v, updates: res.updates, log: {}, activity: { mode: 'set', date: day, studied: nc.studied, new: nc.newC, learning: nc.learn, review: nc.review }, opId: newOpId() })
        act = nc
      }
    }
    await session(20, '22222222-2222-4222-8222-')
    const after1 = srv.activity[day].studied
    await session(3, '33333333-3333-4333-8333-')
    console.log('RESULT morning session 20 grades -> studied', after1, '; evening session 3 grades -> studied', srv.activity[day].studied, '; review_logs', srv.logs.length)
    // offline increment then online set in same mount
    store.rows = []
    const srv2 = fakeServer()
    let act = { studied: 0 }
    for (let i = 0; i < 5; i++) { const v = '44444444-4444-4444-8444-' + String(i).padStart(12,'0'); const res = schedule({ id:null, vocab_id:v, state:'new' }, 3); await enqueueGrade({ userId:'u1', vocabId:v, cardId:null, updates:res.updates, log:{}, day, state:'new' }); act = nextActivityCounts(act,'new') }
    await flushOutbox(srv2, 'u1')
    const mid = srv2.activity[day].studied
    const v = '55555555-5555-4555-8555-000000000000'; const res = schedule({ id:null, vocab_id:v, state:'new' }, 3)
    const nc = nextActivityCounts(act, 'new')
    await gradeCardWrite(srv2, { userId:'u1', cardId:null, vocabId:v, updates:res.updates, log:{}, activity:{ mode:'set', date:day, studied:nc.studied, new:nc.newC, learning:nc.learn, review:nc.review }, opId:newOpId() })
    console.log('RESULT 5 offline (increment) then 1 online (set), same mount: after flush', mid, 'after online', srv2.activity[day].studied)
  })
})

describe('stale guard', () => {
  it('replay after newer grade and two tabs', async () => {
    store.rows = []
    const srv = fakeServer()
    const id = '66666666-6666-4666-8666-000000000001'
    const base = { id, vocab_id: VOCAB, state: 'review', reps: 4, stability: 10, difficulty: 5, lapses: 0, due_at: new Date(Date.now()-864e5).toISOString(), last_review: new Date(Date.now()-10*864e5).toISOString(), scheduled_days: 9, elapsed_days: 0, learning_step: 0 }
    srv.cards[id] = { ...base }
    const offlineRes = schedule(base, 0) // phone offline: Again
    await enqueueGrade({ userId: 'u1', vocabId: VOCAB, cardId: id, updates: offlineRes.updates, log: {}, day: '2026-11-09', state: 'review' })
    const webRes = schedule(base, 2) // web online Good
    const w = await gradeCardWrite(srv, { userId: 'u1', cardId: id, vocabId: VOCAB, updates: webRes.updates, log: {}, activity: null, opId: newOpId() })
    await flushOutbox(srv, 'u1')
    console.log('RESULT web applied stale?', w.stale, 'server after replay: state', srv.cards[id].state, 'reps', srv.cards[id].reps, 'stab', srv.cards[id].stability.toFixed(2), 'logs', srv.logs.length, 'outbox', store.rows.length)
    // duplicate submit same opId
    const op = newOpId(); const r = schedule(srv.cards[id], 2)
    const a = await gradeCardWrite(srv, { userId:'u1', cardId:id, vocabId:VOCAB, updates:r.updates, log:{}, activity:{mode:'increment', date:'d', studied:1}, opId: op })
    const b = await gradeCardWrite(srv, { userId:'u1', cardId:id, vocabId:VOCAB, updates:r.updates, log:{}, activity:{mode:'increment', date:'d', studied:1}, opId: op })
    console.log('RESULT duplicate opId: second alreadyApplied', b.alreadyApplied, 'logs', srv.logs.length, 'activity d', srv.activity.d.studied)
  })
})
