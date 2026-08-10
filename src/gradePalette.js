import { ink } from './languageTheme'

// The four grades, in fixed order. Position and label carry the meaning; the
// palette below is a second signal, never the only one. Lives here rather than
// in GradeRow.jsx so both can be imported without breaking fast refresh.
export const GRADES = [
  { grade: 0, label: 'Again' },
  { grade: 1, label: 'Hard' },
  { grade: 2, label: 'Good' },
  { grade: 3, label: 'Easy' },
]

// Grade button palette — desaturated to sit quietly on the card until pressed.
// Fixed positions + text labels carry the meaning; color is a second signal,
// never the only one (kept in sync with the icon/label per button below).
//
// These were four hardcoded near-white pastels (#FBEDEA, #FBF1E4, #E9F2EA,
// #E7EFF3). In light mode they read as intended; in dark mode they were four
// bright cards floating on a dark screen — reported from a device, and exactly
// what CLAUDE.md §5 says a hardcoded neutral does. Nothing about them was
// theme-aware.
//
// Now each grade is ONE hue, and the three surfaces are derived from it the way
// the rest of the app derives its tints: the fill mixes into `--surface` and
// the border into `--border`, so both follow the theme instead of overriding
// it, and the label goes through `ink()`, which lifts toward white in dark mode.
// Same four colours in light mode, dark surfaces in dark mode, one definition.
export const GRADE_HUES = ['#B3402A', '#A9741F', '#3E7A47', '#3A6E82']

export const GRADE_STYLES = GRADE_HUES.map((hue) => ({
  // 12% is the same weight the panels use: enough to tell four buttons apart,
  // not enough to become a colour block on either theme.
  bg: 'color-mix(in srgb, ' + hue + ' 12%, var(--surface))',
  // The resting border doubles as the pressed/suggested fill (see GradeButton),
  // so it has to be a clear step up from `bg` without inventing a new shade.
  border: 'color-mix(in srgb, ' + hue + ' 34%, var(--border))',
  text: ink(hue),
}))
