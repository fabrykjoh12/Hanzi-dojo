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

// XP required to clear a given level (level 1 → 2 costs 100, then +50 each level).
function spanForLevel(level) {
  return 100 + (level - 1) * 50
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
