// Achievement definitions — derived live from existing stats, so there is no
// achievements table to maintain. Each has a `test(stats)` predicate. Keep the
// tone calm and adult (engraved "seals"), not a noisy game.
//
// stats shape: { streak, learned, mastered, level, daysStudied }

export const ACHIEVEMENTS = [
  // Consistency (streak)
  { id: 'streak_3',  group: 'Consistency', icon: 'flame',    title: 'Warming Up',      desc: 'Reach a 3-day streak',   test: s => s.streak >= 3 },
  { id: 'streak_7',  group: 'Consistency', icon: 'flame',    title: 'One Week Strong', desc: 'Reach a 7-day streak',   test: s => s.streak >= 7 },
  { id: 'streak_30', group: 'Consistency', icon: 'flame',    title: 'Unbroken',        desc: 'Reach a 30-day streak',  test: s => s.streak >= 30 },

  // Vocabulary (words learned)
  { id: 'learn_10',  group: 'Vocabulary',  icon: 'layers',   title: 'First Words',     desc: 'Learn 10 words',         test: s => s.learned >= 10 },
  { id: 'learn_50',  group: 'Vocabulary',  icon: 'layers',   title: 'Building Up',     desc: 'Learn 50 words',         test: s => s.learned >= 50 },
  { id: 'learn_100', group: 'Vocabulary',  icon: 'layers',   title: 'Century',         desc: 'Learn 100 words',        test: s => s.learned >= 100 },

  // Mastery (FSRS stability)
  { id: 'master_10',  group: 'Mastery',    icon: 'sparkles', title: 'Sticking',        desc: 'Master 10 words',        test: s => s.mastered >= 10 },
  { id: 'master_50',  group: 'Mastery',    icon: 'sparkles', title: 'Deep Roots',      desc: 'Master 50 words',        test: s => s.mastered >= 50 },
  { id: 'master_100', group: 'Mastery',    icon: 'sparkles', title: 'Locked In',       desc: 'Master 100 words',       test: s => s.mastered >= 100 },

  // Progress (account level)
  { id: 'level_5',  group: 'Progress',     icon: 'trophy',   title: 'Adept',           desc: 'Reach account level 5',  test: s => s.level >= 5 },
  { id: 'level_10', group: 'Progress',     icon: 'trophy',   title: 'Devoted',         desc: 'Reach account level 10', test: s => s.level >= 10 },

  // Dedication (distinct study days)
  { id: 'days_7',  group: 'Dedication',    icon: 'calendar', title: 'Habit Forming',   desc: 'Study on 7 days',        test: s => s.daysStudied >= 7 },
  { id: 'days_30', group: 'Dedication',    icon: 'calendar', title: 'Part of Life',    desc: 'Study on 30 days',       test: s => s.daysStudied >= 30 },
]

export function evaluateAchievements(stats) {
  return ACHIEVEMENTS.map(a => ({ ...a, earned: Boolean(a.test(stats)) }))
}

export function countEarned(stats) {
  return ACHIEVEMENTS.reduce((n, a) => n + (a.test(stats) ? 1 : 0), 0)
}
