import { describe, it, expect } from 'vitest'
import { resumeInvalidations, HOME_COUNTS_STALE_MS } from './appResume'
import { HOME_COUNTS, HOME_HANDOFF } from './cacheEvents'

const at = (h, m = 0, day = 9) => new Date(2026, 7, day, h, m, 0).getTime()

describe('resumeInvalidations', () => {
  it('does nothing for a short trip out of the app', () => {
    // The common case by far — a glance at a notification. It must be free.
    const plan = resumeInvalidations({ backgroundedAt: at(10, 0), resumedAt: at(10, 2) })
    expect(plan.keys).toEqual([])
    expect(plan.reason).toBe('none')
  })

  it('marks the counts once the app has been away long enough', () => {
    const plan = resumeInvalidations({
      backgroundedAt: at(10, 0),
      resumedAt: at(10, 0) + HOME_COUNTS_STALE_MS,
    })
    expect(plan.keys).toEqual([HOME_COUNTS])
    expect(plan.reason).toBe('stale')
  })

  it('is exclusive at the threshold, not inclusive of the moment before it', () => {
    const plan = resumeInvalidations({
      backgroundedAt: at(10, 0),
      resumedAt: at(10, 0) + HOME_COUNTS_STALE_MS - 1,
    })
    expect(plan.keys).toEqual([])
  })

  it('marks the counts AND the hand-off across local midnight', () => {
    // Four minutes — under the staleness window — but a different day, which is
    // when the day's reviews, the new-card allowance and today's reward claim
    // all roll over. Home left open overnight is the case this exists for.
    const plan = resumeInvalidations({
      backgroundedAt: at(23, 58),
      resumedAt: at(0, 2, 10),
    })
    expect(plan.keys).toEqual([HOME_COUNTS, HOME_HANDOFF])
    expect(plan.reason).toBe('midnight')
  })

  it('never touches the shelf — published stories do not change in a pocket', () => {
    const overnight = resumeInvalidations({ backgroundedAt: at(23, 58), resumedAt: at(0, 2, 10) })
    const long = resumeInvalidations({ backgroundedAt: at(10, 0), resumedAt: at(12, 0) })
    expect(overnight.keys.some(k => k.startsWith('stories'))).toBe(false)
    expect(long.keys.some(k => k.startsWith('stories'))).toBe(false)
  })

  it('does nothing when there was no matching background', () => {
    // The first activation of the run, or a resume whose hide we never saw.
    // Guessing "refetch" here is how resume quietly becomes reload.
    expect(resumeInvalidations({ backgroundedAt: null, resumedAt: at(10, 0) }).keys).toEqual([])
    expect(resumeInvalidations({}).keys).toEqual([])
    expect(resumeInvalidations().keys).toEqual([])
  })
})
