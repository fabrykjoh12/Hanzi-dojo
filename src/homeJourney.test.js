import { describe, expect, it } from 'vitest'
import {
  SAMPLE_MAX_PX, SAMPLE_MAX_WORDS, SAMPLE_MIN_PX,
  homeFirstName, homeJourneySteps, homeLevelPill, homePrimaryAction,
  sampleEmLength, sampleFontSize, sampleRowWidth, sessionQueueLine,
  sessionSampleWords, storyRewardState, storyUnlockTitle,
} from './homeJourney'

describe('homeFirstName', () => {
  it('takes the first word of the display name', () => {
    expect(homeFirstName({ display_name: 'Fabian' })).toBe('Fabian')
    expect(homeFirstName({ display_name: 'Test Learner' })).toBe('Test')
    expect(homeFirstName({ display_name: '  spaced  out ' })).toBe('spaced')
  })

  it('is empty when there is no name — the greeting stands alone', () => {
    expect(homeFirstName({})).toBe('')
    expect(homeFirstName(null)).toBe('')
    expect(homeFirstName({ display_name: '   ' })).toBe('')
  })
})

describe('homeLevelPill', () => {
  it('prints level and progress on one line', () => {
    expect(homeLevelPill({ levelLabel: 'HSK 2', learned: 42, totalWords: 100 })).toBe('HSK 2 · 42%')
    expect(homeLevelPill({ levelLabel: 'HSK 1', learned: 1, totalWords: 3 })).toBe('HSK 1 · 33%')
  })

  it('shows 0% rather than dividing by zero', () => {
    expect(homeLevelPill({ levelLabel: 'HSK 1', learned: 0, totalWords: 0 })).toBe('HSK 1 · 0%')
  })
})

describe('sessionQueueLine', () => {
  it('prints the real composition, sharing deskCardsSub’s wording', () => {
    expect(sessionQueueLine({ dueCount: 13, newCount: 10 })).toBe('13 reviews · 10 new')
    expect(sessionQueueLine({ dueCount: 1, newCount: 0 })).toBe('1 review · 0 new')
  })

  it('stays honest when the counts failed', () => {
    expect(sessionQueueLine({ failed: true })).toBe('Queue unavailable — starting will retry')
  })
})

describe('sessionSampleWords', () => {
  const WIDE = 390
  const NARROW = 320

  it('takes up to four words from the front of the actual queue', () => {
    expect(sessionSampleWords(['学', '夜', '路', '灯', '花'], WIDE))
      .toEqual(['学', '夜', '路', '灯'])
  })

  it('never fabricates and never repeats', () => {
    expect(sessionSampleWords([], WIDE)).toEqual([])
    expect(sessionSampleWords([null, ''], WIDE)).toEqual([])
    expect(sessionSampleWords(['学', '学', '夜'], WIDE)).toEqual(['学', '夜'])
  })

  it('shows four two-character words at normal width but drops to three when narrow', () => {
    const queue = ['回家', '朋友', '喝水', '花']
    expect(sessionSampleWords(queue, WIDE)).toEqual(['回家', '朋友', '喝水', '花'])
    expect(sessionSampleWords(queue, NARROW)).toEqual(['回家', '朋友', '喝水'])
  })

  it('never lets a multi-word sample fall below the premium floor size', () => {
    for (const width of [WIDE, NARROW]) {
      const words = sessionSampleWords(['不好意思', '没关系', '一点儿', '什么'], width)
      expect(words.length).toBeLessThan(SAMPLE_MAX_WORDS)
      if (words.length > 1) {
        expect(sampleFontSize(words, width)).toBeGreaterThanOrEqual(SAMPLE_MIN_PX)
      }
    }
  })

  it('always keeps at least the first word, whole — never truncated', () => {
    expect(sessionSampleWords(['不好意思了没关系吗'], NARROW)).toEqual(['不好意思了没关系吗'])
  })
})

describe('sampleFontSize', () => {
  it('is large at normal width and never exceeds the cap', () => {
    expect(sampleFontSize(['学', '夜', '路', '灯'], 390)).toBeLessThanOrEqual(SAMPLE_MAX_PX)
    expect(sampleFontSize(['学'], 390)).toBe(SAMPLE_MAX_PX)
  })

  it('keeps the row inside the card at every supported width', () => {
    for (const width of [320, 390, 430, 1440]) {
      const words = sessionSampleWords(['回家', '朋友', '喝水', '花'], width)
      const px = sampleFontSize(words, width)
      expect(px * sampleEmLength(words)).toBeLessThanOrEqual(sampleRowWidth(width))
    }
  })
})

describe('storyUnlockTitle', () => {
  it('uses the real story and derives the chapter from its title', () => {
    expect(storyUnlockTitle({ story: { title: '6. 我们的歌' } })).toBe('Unlock 我们的歌 · Chapter 6')
    expect(storyUnlockTitle({ story: { title: '夜里的字' } })).toBe('Unlock 夜里的字')
  })

  it('falls back honestly while the story is unknown', () => {
    expect(storyUnlockTitle(undefined)).toBe('Today’s story')
    expect(storyUnlockTitle(null)).toBe('Today’s story')
  })
})

describe('homePrimaryAction', () => {
  it('names exactly one primary object per stage — none when all done', () => {
    expect(homePrimaryAction('cards')).toBe('cards')
    expect(homePrimaryAction('story')).toBe('story')
    expect(homePrimaryAction('practice')).toBe('practice')
    expect(homePrimaryAction('caught-up')).toBe('shelf')
    expect(homePrimaryAction('complete')).toBe(null)
  })
})

describe('homeJourneySteps', () => {
  const daily = { story: { title: '6. 我们的歌' }, completedToday: false }

  it('always yields exactly three steps', () => {
    for (const stage of ['cards', 'story', 'practice', 'complete', 'caught-up']) {
      expect(homeJourneySteps({ stage, counts: {}, daily }).length).toBe(3)
    }
  })

  it('has at most one current step, matching the primary action', () => {
    for (const stage of ['cards', 'story', 'practice', 'complete', 'caught-up']) {
      const steps = homeJourneySteps({ stage, counts: {}, daily })
      const current = steps.filter(s => s.status === 'current')
      if (stage === 'complete') expect(current.length).toBe(0)
      else expect(current.length).toBe(1)
    }
  })

  it('cards stage: session is current, story locked with its unlock line, practice waits', () => {
    const steps = homeJourneySteps({ stage: 'cards', counts: { dueCount: 2, newCount: 4 }, daily })
    expect(steps[0]).toMatchObject({ key: 'cards', status: 'current', title: 'Today’s session' })
    expect(steps[1]).toMatchObject({ key: 'story', status: 'upcoming', title: 'Unlock 我们的歌 · Chapter 6', sub: 'Finish cards to unlock' })
    expect(steps[2]).toMatchObject({ key: 'practice', status: 'upcoming', sub: 'After your story' })
  })

  it('story stage: cards fold into a done row; the step points at the reward card instead of repeating its title', () => {
    const steps = homeJourneySteps({ stage: 'story', counts: {}, daily })
    expect(steps[0]).toMatchObject({ key: 'cards', status: 'done', sub: 'Nothing due right now' })
    expect(steps[1]).toMatchObject({ key: 'story', status: 'current', title: 'Story unlocked', sub: 'Ready to read' })
    expect(steps[1].title).not.toContain('我们的歌')
  })

  it('story stage while the story is loading says so instead of lying', () => {
    const steps = homeJourneySteps({ stage: 'story', counts: {}, daily: undefined })
    expect(steps[1]).toMatchObject({ key: 'story', title: 'Today’s story', sub: 'Finding today’s story' })
  })

  it('practice stage: story done, grammar current with its real count', () => {
    const steps = homeJourneySteps({ stage: 'practice', counts: { grammarDueCount: 3 }, daily: { ...daily, completedToday: true } })
    expect(steps[1]).toMatchObject({ key: 'story', status: 'done', sub: 'Story complete' })
    expect(steps[2]).toMatchObject({ key: 'practice', status: 'current', sub: '3 patterns due' })
  })

  it('complete stage: every step is done', () => {
    const steps = homeJourneySteps({ stage: 'complete', counts: {}, daily: { ...daily, completedToday: true } })
    expect(steps.map(s => s.status)).toEqual(['done', 'done', 'done'])
    expect(steps[2].sub).toBe('Complete for today')
  })

  it('caught-up stage: no story exists, so the shelf is the honest middle step', () => {
    const steps = homeJourneySteps({ stage: 'caught-up', counts: {}, daily: null })
    expect(steps[1]).toMatchObject({ key: 'shelf', status: 'current', title: 'Open the story shelf' })
    expect(steps[2].sub).toBe('Nothing due')
  })

  it('never prints the mockup’s hard-coded practice copy', () => {
    for (const stage of ['cards', 'story', 'practice', 'complete', 'caught-up']) {
      const steps = homeJourneySteps({ stage, counts: {}, daily })
      for (const step of steps) {
        expect(step.title || '').not.toMatch(/stroke order/i)
        expect(step.sub || '').not.toMatch(/stroke order/i)
      }
    }
  })
})

describe('storyRewardState', () => {
  const daily = { story: { title: '6. 我们的歌' } }

  it('follows the stage', () => {
    expect(storyRewardState({ stage: 'story', daily: undefined })).toEqual({ kind: 'skeleton' })
    expect(storyRewardState({ stage: 'caught-up', daily: null })).toEqual({ kind: 'hidden' })
    expect(storyRewardState({ stage: 'cards', daily })).toMatchObject({ kind: 'locked' })
    expect(storyRewardState({ stage: 'story', daily })).toMatchObject({ kind: 'ready' })
    expect(storyRewardState({ stage: 'practice', daily })).toMatchObject({ kind: 'complete' })
    expect(storyRewardState({ stage: 'complete', daily })).toMatchObject({ kind: 'complete' })
  })

  it('is tappable only when reading is the current step', () => {
    // 'ready' is the ONLY kind the card renders as a button — the journey and
    // the reward card together must never offer two primary actions.
    expect(storyRewardState({ stage: 'story', daily }).kind).toBe('ready')
    expect(storyRewardState({ stage: 'cards', daily }).kind).not.toBe('ready')
    expect(storyRewardState({ stage: 'practice', daily }).kind).not.toBe('ready')
  })
})
