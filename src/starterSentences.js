// Pure accessors over the bundled starter-sentence dataset used by the pre-signup
// "read a sentence" wow moment. No React, no Supabase — safe to unit-test in
// isolation and to run before an account exists.
import data from '../data/starter-sentences.chinese.json'

// The sentence to show for a reason. Unknown/empty reasons use the `default`
// bucket, so the flow never dead-ends. `index` wraps so "try another" is safe.
export function sentenceForReason(reason, index = 0) {
  const bucket = (reason && data[reason]) || data.default
  return bucket[((index % bucket.length) + bucket.length) % bucket.length]
}

// Up to 3 words to feature in the character taste: the authored `learn` list
// (mapped to word objects, in sentence order), else the shortest real words.
export function charsToLearn(sentence) {
  const real = sentence.words.filter(w => !w.punct)
  if (sentence.learn && sentence.learn.length) {
    // Iterate the words in sentence order, keeping those named in `learn`, so
    // the taste follows the reading order (not the order they were listed).
    const want = new Set(sentence.learn)
    const picks = real.filter(w => want.has(w.hanzi)).slice(0, 3)
    if (picks.length) return picks
  }
  return [...real].sort((a, b) => a.hanzi.length - b.hanzi.length).slice(0, 3)
}

// Share of real (non-punct) words revealed, 0–100. Punctuation never counts, so
// revealing every real word reaches exactly 100.
export function understandPct(sentence, revealedIndexes) {
  const revealed = revealedIndexes instanceof Set ? revealedIndexes : new Set(revealedIndexes || [])
  const realIdx = sentence.words.map((w, i) => (w.punct ? -1 : i)).filter(i => i >= 0)
  if (realIdx.length === 0) return 0
  const hit = realIdx.filter(i => revealed.has(i)).length
  return Math.round((100 * hit) / realIdx.length)
}

// Convention-based static path (files live in public/starter-audio/, served at
// the site root). `wordIndex === null` → the whole-sentence clip.
export function audioSrcFor(sentenceId, wordIndex) {
  return wordIndex == null
    ? `/starter-audio/${sentenceId}.mp3`
    : `/starter-audio/${sentenceId}-${wordIndex}.mp3`
}
