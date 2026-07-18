import { shuffle } from './utils'
import { cleanMeaning } from './cleanMeaning'

// Build up to `count` multiple-choice questions from a set of vocabulary rows.
// Mixes prompt→answer directions (meaning→word and word→meaning) with three
// distractors drawn from the SAME set passed in, so the caller controls the
// difficulty band by controlling which vocab it hands over. Pure given its
// inputs (randomness aside).
//
// Extracted from PlacementTest so the placement quiz and the public reading
// assessment share one MCQ builder and can't drift.
export function buildMcqQuestions(vocab, language, count) {
  const usable = (vocab || []).filter(v => v.word && v.meaning)
  if (usable.length < 4) return []
  const picked = shuffle(usable).slice(0, Math.min(count, usable.length))
  return picked.map(v => {
    const wrong = shuffle(usable.filter(w => w.id !== v.id)).slice(0, 3)
    const toEnglish = Math.random() > 0.5
    if (toEnglish) {
      const options = shuffle([v, ...wrong].map(w => cleanMeaning(w.meaning)))
      return {
        prompt: v.word,
        promptReading: v.reading,
        promptLabel: language === 'japanese' ? 'Japanese' : language === 'russian' ? 'Russian' : 'Chinese',
        answerLabel: 'English',
        options,
        correct: cleanMeaning(v.meaning),
        optionReadings: null,
        big: true,
      }
    }
    const wordOptions = shuffle([v, ...wrong].map(w => ({ word: w.word, reading: w.reading })))
    return {
      prompt: cleanMeaning(v.meaning),
      promptReading: null,
      promptLabel: 'English',
      answerLabel: language === 'japanese' ? 'Japanese' : language === 'russian' ? 'Russian' : 'Chinese',
      options: wordOptions.map(o => o.word),
      correct: v.word,
      optionReadings: language === 'japanese'
        ? wordOptions.reduce((acc, o) => { acc[o.word] = o.reading; return acc }, {})
        : null,
      big: false,
    }
  })
}
