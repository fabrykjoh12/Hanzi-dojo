// Account-wide XP and level helpers.
//
// XP is earned per graded flashcard. A weaker recall is still worth a little
// (you showed up and the algorithm learned something); a confident recall is
// worth more. Values are deliberately small so levels feel earned over weeks.

export function xpForGrade(grade) {
  if (grade === 0) return 2   // Again
  if (grade === 1) return 6   // Hard
  return 10                   // Good / Easy
}

// XP required to clear a given level. Deliberately steep so levels are earned
// over real weeks of study, not a single big session: level 1 → 2 costs 250,
// and each level after that costs 170 more than the last (2→3 = 420, 3→4 = 590…).
function spanForLevel(level) {
  return 250 + (level - 1) * 170
}

// Milestone titles — the dojo's rank ladder. Earned at the level shown, kept
// until the next one. Displayed beside the account level on Home/Profile and
// announced in the level-up moment.
const TITLES = [
  { min: 1, name: 'Novice' },
  { min: 3, name: 'Student' },
  { min: 6, name: 'Adept' },
  { min: 10, name: 'Wanderer' },
  { min: 15, name: 'Scholar' },
  { min: 20, name: 'Master' },
  { min: 30, name: 'Sensei' },
]

// levelTitle(level) → current rank name for an account level.
export function levelTitle(level) {
  let name = TITLES[0].name
  for (let i = 0; i < TITLES.length; i += 1) {
    if (level >= TITLES[i].min) name = TITLES[i].name
  }
  return name
}

// The next title milestone above `level`, or null at the top — for
// "next reward" previews.
export function nextTitle(level) {
  for (let i = 0; i < TITLES.length; i += 1) {
    if (TITLES[i].min > level) return TITLES[i]
  }
  return null
}

// levelInfo(totalXp) → { level, intoLevel, levelSpan, pct }
//   level     : current account level (starts at 1)
//   intoLevel : XP accumulated within the current level
//   levelSpan : XP needed to reach the next level
//   pct       : 0–100 progress toward the next level
export function levelInfo(totalXp) {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp || 0))
  let span = spanForLevel(level)
  while (remaining >= span) {
    remaining -= span
    level += 1
    span = spanForLevel(level)
  }
  return {
    level,
    intoLevel: remaining,
    levelSpan: span,
    pct: span > 0 ? Math.round((remaining / span) * 100) : 0,
  }
}

// How many whole levels the account gained when total XP moved from prevXp to
// newXp. 0 when no level boundary was crossed. Used to fire level-up rewards.
export function levelsGained(prevXp, newXp) {
  return Math.max(0, levelInfo(newXp).level - levelInfo(prevXp).level)
}
