import { describe, it, vi, afterEach } from 'vitest'
import { schedule, previewLabels, isCardDue, endOfLocalDay } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/srs.js'
afterEach(() => vi.useRealTimers())
const TZ = process.env.TZ
function at(iso) { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }
const fmt = d => new Date(d).toISOString().replace(':00.000Z','Z')

describe('scheduler numbers TZ=' + TZ, () => {
  it('new card: each grade', () => {
    at('2026-11-09T10:00:00Z')
    const card = { id: null, state: 'new' }
    console.log('RESULT['+TZ+'] preview new', JSON.stringify(previewLabels(card)))
    for (const g of [0,1,2,3]) { const r = schedule(card, g); console.log('RESULT['+TZ+'] new g'+g, r.updates.state, 'due', fmt(r.updates.due_at), 'sched', r.updates.scheduled_days, 'step', r.updates.learning_step, 'stab', r.updates.stability.toFixed(3), 'stay', r.stay, 'gap', r.gap, 'learned', r.updates.learned) }
  })
  it('learning step collapse: Good then regrade Good after 30s vs after 10min vs next day', () => {
    at('2026-11-09T10:00:00Z')
    const r1 = schedule({ id: null, state: 'new' }, 2)
    const c1 = { id: 'x', ...r1.updates }
    for (const [label, t] of [['30s','2026-11-09T10:00:30Z'],['10m','2026-11-09T10:10:00Z'],['1d','2026-11-10T10:00:00Z']]) {
      vi.setSystemTime(new Date(t))
      const lbl = previewLabels(c1)
      const r = schedule(c1, 2)
      console.log('RESULT['+TZ+'] learning(step1) regrade Good after', label, '->', r.updates.state, 'sched', r.updates.scheduled_days, 'stab', r.updates.stability.toFixed(3), 'due', fmt(r.updates.due_at), 'isDueAtCreate', isCardDue(c1, new Date(t)), 'preview', JSON.stringify(lbl))
    }
  })
  it('again on new then immediate regrade', () => {
    at('2026-11-09T10:00:00Z')
    let c = { id: 'x', ...schedule({ id: null, state: 'new' }, 0).updates }
    const seq = []
    for (let i = 0; i < 4; i++) { vi.advanceTimersByTime(20000); const r = schedule(c, 2); seq.push(r.updates.state + '/' + r.updates.scheduled_days + 'd/step' + r.updates.learning_step); c = { ...c, ...r.updates } }
    console.log('RESULT['+TZ+'] Again then Good x4 at 20s spacing:', seq.join(' -> '))
  })
  it('day-based availability around local midnight', () => {
    // a review card due tomorrow at 00:30 local and at 23:30 local today
    const now = new Date(); 
    for (const base of ['2026-11-09T12:00:00Z']) {
      vi.useFakeTimers(); vi.setSystemTime(new Date(base))
      const n = new Date()
      const eod = endOfLocalDay(n)
      const justAfter = new Date(eod.getTime() + 1)
      const card = { state: 'review', due_at: justAfter.toISOString() }
      console.log('RESULT['+TZ+'] now', n.toISOString(), 'eod', eod.toISOString(), 'card due 1ms after eod due now?', isCardDue(card, n), 'due at eod?', isCardDue({ state:'review', due_at: eod.toISOString() }, n))
    }
  })
  it('DST days: endOfLocalDay length', () => {
    for (const d of ['2026-03-08T15:00:00Z','2026-11-01T15:00:00Z','2026-04-05T02:00:00Z','2026-09-27T02:00:00Z','2026-03-29T12:00:00Z','2026-10-25T12:00:00Z']) {
      const n = new Date(d); const eod = endOfLocalDay(n); const sod = new Date(n); sod.setHours(0,0,0,0)
      console.log('RESULT['+TZ+'] DST probe', d, 'local day length h', ((eod - sod + 1)/36e5).toFixed(2))
    }
  })
  it('1-day review interval reviewed late evening: when available', () => {
    at('2026-11-09T09:30:00Z') // varies local
    const rev = { id:'x', state:'review', reps:3, stability:1.2, difficulty:6, lapses:0, due_at: new Date().toISOString(), last_review: new Date(Date.now()-864e5).toISOString(), scheduled_days:1, elapsed_days:1, learning_step:0 }
    const r = schedule(rev, 1)
    const due = new Date(r.updates.due_at)
    const sod = new Date(due); sod.setHours(0,0,0,0)
    console.log('RESULT['+TZ+'] Hard on S=1.2 review: sched', r.updates.scheduled_days, 'due', due.toISOString(), 'available from local', sod.toISOString())
  })
  it('clock skew: device 2h behind last_review (last_review in future)', () => {
    at('2026-11-09T10:00:00Z')
    const rev = { id:'x', state:'review', reps:3, stability:5, difficulty:5, lapses:0, due_at: '2026-11-09T12:00:00Z', last_review: '2026-11-09T12:00:00Z', scheduled_days:5, elapsed_days:0, learning_step:0 }
    try { const r = schedule(rev, 2); console.log('RESULT['+TZ+'] skew: future last_review Good -> sched', r.updates.scheduled_days, 'stab', r.updates.stability.toFixed(3), 'elapsed', r.updates.elapsed_days) } catch (e) { console.log('RESULT['+TZ+'] skew threw', e.message) }
    // overdue: due 60 days ago
    const od = { ...rev, last_review: '2026-08-01T10:00:00Z', due_at: '2026-08-06T10:00:00Z' }
    const r2 = schedule(od, 2); console.log('RESULT['+TZ+'] overdue 95d S=5 Good -> sched', r2.updates.scheduled_days, 'stab', r2.updates.stability.toFixed(2))
    const r3 = schedule(od, 0); console.log('RESULT['+TZ+'] overdue 95d S=5 Again ->', r3.updates.state, 'lapses', r3.updates.lapses, 'stab', r3.updates.stability.toFixed(2), 'learned', r3.updates.learned)
  })
  it('invalid grade', () => {
    try { schedule({ id: null, state: 'new' }, 4); console.log('RESULT grade 4 no throw') } catch (e) { console.log('RESULT['+TZ+'] grade 4 throws:', e.message) }
    try { const r = schedule({ id: null, state: 'new' }, '2'); console.log('RESULT['+TZ+'] grade "2" ok', r.updates.state) } catch (e) { console.log('RESULT grade "2" throws', e.message) }
  })
})
