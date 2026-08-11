// The Profile screen's controls, as rows.
//
// They used to be four full panels stacked down the page — daily goal, reset a
// language, remove a language, delete account — each with a heading, a
// paragraph of explanation and a button, plus a fifth standalone Sign out
// button. Together they were ~590px of the screen, and four of the five are
// things a learner touches roughly once ever (P10-B1 audit §B1.4).
//
// So they collapse to labelled rows in two groups, and each row opens its own
// full control when tapped. Nothing was removed: every option, every warning
// and every confirmation step is still there, one tap in.
//
// Pure: the rows are data, so which rows exist and what each one says can be
// tested without rendering Profile. Icons and the open/closed state stay in the
// component, where they belong.

// Tall enough to be a comfortable target on its own, before any padding —
// well clear of the 44px floor.
export const CONTROL_ROW_MIN_HEIGHT = 52

// The right-hand side of the daily-goal row. Short on purpose: at 320px it
// shares a line with the label and a chevron, and the expanded body spells the
// three options out in full anyway.
export function cardsPerDay(n) {
  const v = Math.max(0, Math.round(Number(n) || 0))
  return v + ' a day'
}

// removableCount: tracks for a language that is no longer offered, which the
// learner may drop (see LanguageSwitcher). Zero for almost everyone, so the row
// only exists when there is something to remove.
export function controlGroups({
  dailyNewCards = 0,
  resetLanguageName = '',
  removableCount = 0,
} = {}) {
  const destructive = [
    { key: 'reset', label: 'Reset a language', value: resetLanguageName, expands: true },
  ]
  if (removableCount > 0) {
    destructive.push({
      key: 'remove',
      label: 'Remove a language',
      value: removableCount === 1 ? '1 track' : removableCount + ' tracks',
      expands: true,
    })
  }
  destructive.push({ key: 'delete', label: 'Delete account', value: '', expands: true })

  return [
    {
      key: 'account',
      heading: 'Account',
      tone: 'normal',
      rows: [
        { key: 'goal', label: 'Daily new cards', value: cardsPerDay(dailyNewCards), expands: true },
        // The one row that acts immediately instead of opening something.
        { key: 'signout', label: 'Sign out', value: '', expands: false },
      ],
    },
    {
      // Everything here erases something. Grouped so the destructive options sit
      // together at the foot of the screen rather than interleaved with settings.
      key: 'danger',
      heading: 'Reset and delete',
      tone: 'danger',
      rows: destructive,
    },
  ]
}
