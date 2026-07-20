// Split a sentence into parts around every occurrence of `word`, so a caller can
// emphasise the looked-up word inside its example sentences. Pure and tested.
// Returns [{ text, hit }] where `hit` marks the word occurrences.
export function splitOnWord(text, word) {
  const s = text || ''
  if (!word) return [{ text: s, hit: false }]
  const parts = []
  let i = 0
  while (i < s.length) {
    const idx = s.indexOf(word, i)
    if (idx === -1) { parts.push({ text: s.slice(i), hit: false }); break }
    if (idx > i) parts.push({ text: s.slice(i, idx), hit: false })
    parts.push({ text: word, hit: true })
    i = idx + word.length
  }
  return parts.length ? parts : [{ text: s, hit: false }]
}
