import { it, vi } from 'vitest'
import { schedule } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/srs.js'
import { isMastered } from '/tmp/claude-0/-home-user-Hanzi-dojo/12b442f1-0fb8-5241-944f-52ce182089d0/scratchpad/main/src/knowledgeState.js'
it('time to mastered', () => {
  for (const g of [3, 2]) {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T10:00:00Z'))
    let c = { id: null, state: 'new' }; let reviews = 0; const t0 = Date.now(); const path = []
    while (!isMastered(c) && reviews < 20) {
      const r = schedule(c, g); reviews++
      c = { ...c, ...r.updates, id: 'x' }
      path.push(r.updates.state[0] + ':S' + r.updates.stability.toFixed(1) + '/' + r.updates.scheduled_days + 'd')
      if (isMastered(c)) break
      vi.setSystemTime(r.stay ? new Date(Date.now() + 10*60000) : new Date(r.updates.due_at))
    }
    console.log('RESULT always grade', g, ': mastered after', reviews, 'grades, day', ((Date.now()-t0)/864e5).toFixed(1), path.join(' '))
    vi.useRealTimers()
  }
})
