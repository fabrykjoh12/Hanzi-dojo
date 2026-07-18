import { shuffle } from './utils'

export const FILL_BLANK_QUESTION_COUNT = 12

// Build fill-in-the-blank questions from a vocab pool. Each question blanks the
// target word out of its example sentence; distractors are other words from the
// pool. Pure (randomness aside) so it can source cloze from a level's vocab OR
// from the words in a story the learner just read. Extracted from FillBlank so
// both callers share one builder.
export function buildFillBlankQuestions(pool, count = FILL_BLANK_QUESTION_COUNT) {
  const usable = (pool || []).filter(v => v.example_sentence && v.example_sentence.indexOf(v.word) !== -1)
  if (usable.length < 4) return []
  return shuffle(usable).slice(0, Math.min(count, usable.length)).map(v => {
    // Blank EVERY occurrence of the word — a visible second occurrence would give
    // the answer away. `parts` are the fragments between blanks (usable guarantees
    // at least one occurrence, so split yields ≥2 parts).
    const parts = v.example_sentence.split(v.word)
    const distractors = shuffle(pool.filter(o => o.id !== v.id && o.word !== v.word)).slice(0, 3)
    return { vocab: v, parts, options: shuffle([v, ...distractors]) }
  })
}
