// Diacritic-folding for search: let a learner type toneless pinyin ("tianqi")
// and still match the stored, tone-marked reading ("tiānqì"). Pure and
// unit-tested.
//
// We lower-case, then decompose (NFD) and drop only the combining marks in the
// Latin range U+0300–U+036F — exactly the pinyin tone marks over a–z vowels.
// Japanese dakuten/handakuten (U+3099/U+309A) sit OUTSIDE that range, so kana
// like が are never folded to か; both the query and the field decompose the
// same way, so kana search stays correct. (Cyrillic й→и / ё→е fold too, which
// only makes search a touch more lenient — never wrong.)
const COMBINING_MARKS = /[̀-ͯ]/g

export function foldForSearch(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
}

// True when `needle` (the user's raw query) is found in `haystack`, comparing
// both with tone/diacritic marks folded away. An empty needle matches.
export function foldIncludes(haystack, needle) {
  const n = foldForSearch(needle)
  if (!n) return true
  return foldForSearch(haystack).includes(n)
}
