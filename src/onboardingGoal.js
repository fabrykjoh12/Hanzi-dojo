// How many days at a given daily-new-cards pace to reach a word target. Used to
// frame the goal step as an outcome ("unlock more stories in ~N days") instead
// of a bare cards/day number. Pure and tested.
//
// A non-positive pace is a degenerate/unset input (no daily goal to project
// from), so it clamps straight to the 1-day floor rather than dividing by a
// pace forced up to 1 — that would turn "no pace" into a misleadingly huge
// day count instead of the same floor used for an already-fast pace.
export function daysToWords(dailyNewCards, targetWords) {
  const pace = dailyNewCards || 0
  if (pace <= 0) return 1
  return Math.max(1, Math.ceil(targetWords / pace))
}
