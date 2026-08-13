// Learner states for the P14-5D vitality lab. Dev-only, deleted with the lab.
//
// Same four states the production guide has, with the numbers P14-5D's data work
// produced: `totalReady` is the whole session, and the breakdown under it is what
// it is made of. The artwork is production artwork committed in this repo.

export const COVER = '/story-covers/generated/hsk1-10-li-ming-sings.webp'

const STORY_OPEN = {
  kind: 'chapter',
  title: '李明唱歌',
  chapterLabel: 'Chapter 4',
  levelLabel: 'HSK 1',
  knownPct: 91,
  coverUrl: COVER,
  locked: false,
}

const WEAK = { key: 'weak', title: 'Weak words', cta: 'Practise these' }
const LEVEL = { learnedCount: 128, totalWords: 200, masteredCount: 96 }

export const VITALITY_STATES = [
  {
    key: 'cards',
    label: 'Cards active',
    input: {
      counts: {
        loaded: true, failed: false,
        // 136 = 74 reviews + 62 new — the device's own numbers, now one total.
        newCount: 62, learnCount: 0, dueCount: 74, totalReady: 136,
        weakCount: 6, grammarDueCount: 0, ...LEVEL,
      },
      story: { ...STORY_OPEN, locked: true },
      practice: WEAK,
      studiedToday: 0,
      storyReadToday: false,
    },
  },
  {
    key: 'story',
    label: 'Story active',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0, totalReady: 0,
        weakCount: 6, grammarDueCount: 0, ...LEVEL,
      },
      story: STORY_OPEN,
      practice: WEAK,
      studiedToday: 18,
      storyReadToday: false,
    },
  },
  {
    key: 'practice',
    label: 'Practice active',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0, totalReady: 0,
        weakCount: 6, grammarDueCount: 0, ...LEVEL,
      },
      story: STORY_OPEN,
      practice: WEAK,
      studiedToday: 18,
      storyReadToday: true,
    },
  },
  {
    key: 'complete',
    label: 'Training complete',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0, totalReady: 0,
        weakCount: 0, grammarDueCount: 0, ...LEVEL,
      },
      story: STORY_OPEN,
      practice: { key: 'listen', title: 'Listening', cta: 'Start listening' },
      studiedToday: 18,
      storyReadToday: true,
    },
  },
]

export const VITALITY_WIDTHS = [320, 390, 430]
