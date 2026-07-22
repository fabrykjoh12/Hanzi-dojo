// Achievement definitions — derived live from existing stats, so there is no
// achievements table to maintain. Each has a `test(stats)` predicate. Keep the
// tone calm and adult (engraved "seals"), not a noisy game.
//
// stats shape: { learned, mastered, daysStudied, storiesRead }

export const ACHIEVEMENTS = [
  // Vocabulary (words learned)
  { id: 'learn_10',  group: 'Vocabulary',  icon: 'layers',   title: 'First Words',     desc: 'Learn 10 words',         test: s => s.learned >= 10 },
  { id: 'learn_50',  group: 'Vocabulary',  icon: 'layers',   title: 'Building Up',     desc: 'Learn 50 words',         test: s => s.learned >= 50 },
  { id: 'learn_100', group: 'Vocabulary',  icon: 'layers',   title: 'Century',         desc: 'Learn 100 words',        test: s => s.learned >= 100 },

  // Mastery (FSRS stability)
  { id: 'master_10',  group: 'Mastery',    icon: 'sparkles', title: 'Sticking',        desc: 'Master 10 words',        test: s => s.mastered >= 10 },
  { id: 'master_50',  group: 'Mastery',    icon: 'sparkles', title: 'Deep Roots',      desc: 'Master 50 words',        test: s => s.mastered >= 50 },
  { id: 'master_100', group: 'Mastery',    icon: 'sparkles', title: 'Locked In',       desc: 'Master 100 words',       test: s => s.mastered >= 100 },

  // Dedication (distinct study days)
  { id: 'days_7',  group: 'Dedication',    icon: 'calendar', title: 'Habit Forming',   desc: 'Study on 7 days',        test: s => s.daysStudied >= 7 },
  { id: 'days_30', group: 'Dedication',    icon: 'calendar', title: 'Part of Life',    desc: 'Study on 30 days',       test: s => s.daysStudied >= 30 },

  // Reading (stories finished) — rewards the core activity, not just flashcards.
  { id: 'read_1',  group: 'Reading',       icon: 'book',     title: 'First Story',     desc: 'Finish a story',         test: s => (s.storiesRead || 0) >= 1 },
  { id: 'read_10', group: 'Reading',       icon: 'book',     title: 'Bookworm',        desc: 'Finish 10 stories',      test: s => (s.storiesRead || 0) >= 10 },
  { id: 'read_25', group: 'Reading',       icon: 'book',     title: 'Well Read',       desc: 'Finish 25 stories',      test: s => (s.storiesRead || 0) >= 25 },
]

export function evaluateAchievements(stats) {
  return ACHIEVEMENTS.map(a => ({ ...a, earned: Boolean(a.test(stats)) }))
}

export function countEarned(stats) {
  return ACHIEVEMENTS.reduce((n, a) => n + (a.test(stats) ? 1 : 0), 0)
}
