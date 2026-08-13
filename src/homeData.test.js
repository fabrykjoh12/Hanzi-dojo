import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { countsExpired, trackSignature, HOME_COUNTS_STALE_MS, firstSessionPending } from './homeData'

const TRACK = { language: 'chinese', system: 'hsk', current_level: 2 }

describe('countsExpired', () => {
  const noon = new Date(2026, 7, 9, 12, 0, 0).getTime()

  it('is expired when nothing has ever been fetched', () => {
    expect(countsExpired(0, noon)).toBe(true)
    expect(countsExpired(null, noon)).toBe(true)
  })

  it('is not expired a minute later on the same day', () => {
    expect(countsExpired(noon - 60 * 1000, noon)).toBe(false)
  })

  it('expires once the value is older than the window', () => {
    expect(countsExpired(noon - HOME_COUNTS_STALE_MS, noon)).toBe(true)
    expect(countsExpired(noon - HOME_COUNTS_STALE_MS + 1, noon)).toBe(false)
  })

  it('expires across local midnight however recent it looks', () => {
    // Two minutes old, but yesterday's — which is when new cards and the day's
    // reviews roll over, so the numbers are wrong regardless of the clock.
    const justAfterMidnight = new Date(2026, 7, 10, 0, 1, 0).getTime()
    const justBefore = new Date(2026, 7, 9, 23, 59, 0).getTime()
    expect(countsExpired(justBefore, justAfterMidnight)).toBe(true)
  })
})

describe('trackSignature', () => {
  it('is equal for two different objects with the same fields', () => {
    // The bug this exists for: loadProfile hands down a freshly-fetched track,
    // and depending on its identity re-ran Home's whole story block.
    expect(trackSignature({ ...TRACK })).toBe(trackSignature({ ...TRACK }))
  })

  it('changes when the level changes', () => {
    expect(trackSignature({ ...TRACK, current_level: 3 })).not.toBe(trackSignature(TRACK))
  })

  it('changes when the language or system changes', () => {
    expect(trackSignature({ ...TRACK, language: 'japanese' })).not.toBe(trackSignature(TRACK))
    expect(trackSignature({ ...TRACK, system: 'hsk_3' })).not.toBe(trackSignature(TRACK))
  })

  it('survives no track at all', () => {
    expect(trackSignature(null)).toBe('')
  })
})

// fetchHandoff decides whether the daily-story card is fetched AT ALL, which is
// the four-requests-per-visit saving. Mocked at the module boundary so the
// assertion is about the calls, not about the data.
vi.mock('./storyRewardData', () => ({
  getSessionRewardTeaser: vi.fn(),
}))
vi.mock('./homeStory', () => ({
  getDailyStoryCard: vi.fn(),
}))

const { getSessionRewardTeaser } = await import('./storyRewardData')
const { getDailyStoryCard } = await import('./homeStory')
const { fetchHandoff } = await import('./homeData')

describe('fetchHandoff', () => {
  beforeEach(() => {
    getSessionRewardTeaser.mockReset()
    getDailyStoryCard.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not fetch the daily story when a reward teaser exists', async () => {
    getSessionRewardTeaser.mockResolvedValue({ state: 'locked', seriesTitle: 'The Inkbound' })
    const res = await fetchHandoff('u1', TRACK, 40)
    expect(res.reward).toEqual({ state: 'locked', seriesTitle: 'The Inkbound' })
    expect(res.daily).toBe(null)
    // Home renders `!rewardTeaser && daily`, so these four queries — one of
    // which pulls every reachable story's full text — could never be shown.
    expect(getDailyStoryCard).not.toHaveBeenCalled()
  })

  it('falls through to the daily story when there is no series going', async () => {
    getSessionRewardTeaser.mockResolvedValue(null)
    getDailyStoryCard.mockResolvedValue({ story: { id: 's1' }, knownPct: 80 })
    const res = await fetchHandoff('u1', TRACK, 40)
    expect(res.reward).toBe(null)
    expect(res.daily).toEqual({ story: { id: 's1' }, knownPct: 80 })
    expect(getDailyStoryCard).toHaveBeenCalledWith('u1', TRACK, 40)
  })

  it('fetches nothing at all without a user or a track', async () => {
    const res = await fetchHandoff(null, TRACK, 0)
    expect(res).toEqual({ reward: null, daily: null, readToday: false })
    expect(getSessionRewardTeaser).not.toHaveBeenCalled()
    expect(getDailyStoryCard).not.toHaveBeenCalled()
  })
})

// Home's one first-use nudge. Derived from the account's own data — cards, or
// the absence of them — because a flag that has to be set correctly AND cleared
// correctly is a flag that eventually greets an established learner.
describe('firstSessionPending', () => {
  const fresh = { loaded: true, failed: false, cardCount: 0, newCount: 12 }

  it('is true for an account that has never graded anything', () => {
    expect(firstSessionPending(fresh)).toBe(true)
  })

  it('goes away the moment there is a single card', () => {
    expect(firstSessionPending({ ...fresh, cardCount: 1 })).toBe(false)
  })

  it('says nothing until the counts are actually known', () => {
    expect(firstSessionPending({ ...fresh, loaded: false })).toBe(false)
    expect(firstSessionPending({ ...fresh, failed: true })).toBe(false)
    expect(firstSessionPending(null)).toBe(false)
    expect(firstSessionPending({})).toBe(false)
  })

  it('says nothing when an older build left no card count at all', () => {
    const legacy = { ...fresh }
    delete legacy.cardCount
    expect(firstSessionPending(legacy)).toBe(false)
  })

  it('says nothing when there is no work to point at', () => {
    expect(firstSessionPending({ ...fresh, newCount: 0 })).toBe(false)
  })
})
