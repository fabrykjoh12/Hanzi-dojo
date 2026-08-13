// Learner states for the P14-5B Home concept lab. Dev-only data, deleted with
// the lab when a concept is migrated.
//
// These are not invented numbers: every field is one the app genuinely produces
// (docs/P14-5B-HOME-GUIDE-AUDIT.md maps each to its source), and the two story
// shapes are the two shapes Home actually receives —
//
//   · a REWARD CHAPTER, which is locked until today's session unlocks it and
//     carries no readability, so no "% known"
//   · the DAILY STORY, which is open and does carry one
//
// The artwork is production artwork committed in this repo
// (public/story-covers/generated), and the titles are the real published
// stories those covers belong to — the 李明 Spring-Festival arc at HSK 1. Chinese
// titles on purpose: that is what the screen shows, and a concept has to be
// judged with the type it will really render.

export const COVERS = {
  liMingSings: '/story-covers/generated/hsk1-10-li-ming-sings.webp',
  workAndSchool: '/story-covers/generated/hsk1-08-work-and-school.webp',
  ourSong: '/story-covers/generated/hsk1-12-our-song.webp',
}

// A real published chapter, still locked — what a learner with cards waiting has.
const CHAPTER_LOCKED = {
  kind: 'chapter',
  title: '李明唱歌',
  chapterLabel: 'Chapter 4',
  levelLabel: 'HSK 1',
  knownPct: null,
  coverUrl: COVERS.liMingSings,
  locked: true,
}

// The same chapter after the session opened it.
const CHAPTER_OPEN = { ...CHAPTER_LOCKED, locked: false, knownPct: 91 }

// The daily story: open, and readability is computed for it.
const DAILY_OPEN = {
  kind: 'daily',
  title: '我们的歌',
  chapterLabel: null,
  levelLabel: 'HSK 1',
  knownPct: 86,
  coverUrl: COVERS.ourSong,
  locked: false,
}

const WEAK_PRIMARY = { key: 'weak', title: 'Weak words', cta: 'Practise these' }
const LISTEN_PRIMARY = { key: 'listen', title: 'Listening', cta: 'Start listening' }

const LEVEL = { learnedCount: 128, totalWords: 200, masteredCount: 96 }

export const CONCEPT_STATES = [
  {
    key: 'cards',
    label: 'Cards active',
    note: 'Reviews waiting; the chapter is real but still locked.',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 5, learnCount: 2, dueCount: 15,
        weakCount: 6, grammarDueCount: 0, ...LEVEL,
      },
      story: CHAPTER_LOCKED,
      practice: WEAK_PRIMARY,
      studiedToday: 0,
      storyReadToday: false,
    },
  },
  {
    key: 'story',
    label: 'Story active',
    note: 'Queue cleared, 22 cards done, chapter unlocked.',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0,
        weakCount: 6, grammarDueCount: 0, ...LEVEL,
      },
      story: CHAPTER_OPEN,
      practice: WEAK_PRIMARY,
      studiedToday: 22,
      storyReadToday: false,
    },
  },
  {
    key: 'practice',
    label: 'Practice active',
    note: 'Chapter read; six words keep slipping.',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0,
        weakCount: 6, grammarDueCount: 0, ...LEVEL,
      },
      story: DAILY_OPEN,
      practice: WEAK_PRIMARY,
      studiedToday: 22,
      storyReadToday: true,
    },
  },
  {
    key: 'complete',
    label: 'Training complete',
    note: 'All three done, nothing needs attention.',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0,
        weakCount: 0, grammarDueCount: 0, ...LEVEL,
      },
      story: DAILY_OPEN,
      practice: LISTEN_PRIMARY,
      studiedToday: 22,
      storyReadToday: true,
    },
  },
  {
    // Criterion 10: the screen has to survive a learner with nothing going on.
    // Caught up, no series, nothing slipping, nothing done today.
    key: 'empty',
    label: 'Quiet day (boring state)',
    note: 'Caught up, no story unlocked, nothing slipping, nothing done today.',
    input: {
      counts: {
        loaded: true, failed: false,
        newCount: 0, learnCount: 0, dueCount: 0,
        weakCount: 0, grammarDueCount: 0, learnedCount: 12, totalWords: 200, masteredCount: 4,
      },
      story: null,
      practice: LISTEN_PRIMARY,
      studiedToday: 0,
      storyReadToday: false,
    },
  },
]

export const CONCEPT_KEYS = ['A', 'B', 'C']
export const FRAME_WIDTHS = [320, 390, 430]
