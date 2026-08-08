// The pre-signup wow moment: three taps that prove Chinese is guessable.
// Rendered by CharacterTaste.jsx.
//
// Named tasteSteps rather than characterTaste on purpose. macOS has a
// case-insensitive filesystem and the resolver tries .js before .jsx, so a
// `characterTaste.js` beside `CharacterTaste.jsx` makes `import './CharacterTaste'`
// resolve to THIS file on a Mac and to the component on Linux. That broke the
// iOS build while every Linux CI check stayed green (see the guard in
// moduleNames.test.js).
//
// It replaces a "tap each word to hear it" exercise, which had two problems.
// It was busywork — tapping to reveal a gloss teaches nothing and demands no
// thought — and it leaned on audio, which is silent on most phones and, at
// this quality, actively off-putting. Nothing here needs sound.
//
// What it teaches instead is the single idea that sells the whole method:
// characters are pictures, and words are those pictures combined. Someone who
// has never seen Chinese can guess 山 from its shape, guess 火 from its shape,
// and then — the actual payoff — work out 火山 without being told. That is a
// real inference, made by them, in under a minute. "I could learn this" is the
// feeling; a gloss reveal cannot produce it.
//
// The order matters: two easy pictographs to build the pattern, then the
// compound that pays it off. Wrong answers cost nothing — this is a party
// trick, not a test — so a miss just shows the answer and moves on.

export const TASTE_STEPS = [
  {
    id: 'shan',
    hanzi: '山',
    pinyin: 'shān',
    question: 'This is a picture of something. What?',
    options: ['A river', 'A mountain', 'A tree'],
    answer: 1,
    reveal: 'Three peaks, one taller in the middle. People have written it this way for three thousand years — and you just read it.',
  },
  {
    id: 'huo',
    hanzi: '火',
    pinyin: 'huǒ',
    question: 'Same idea. What is this one?',
    options: ['Fire', 'Rain', 'A door'],
    answer: 0,
    reveal: 'A blaze with sparks flying off either side. Two characters in.',
  },
  {
    id: 'huoshan',
    hanzi: '火山',
    pinyin: 'huǒshān',
    question: 'Now put them together. 火 + 山 is…',
    options: ['A campfire', 'A sunset', 'A volcano'],
    answer: 2,
    reveal: 'Fire mountain — volcano. That is how most Chinese words work: characters you already know, stuck together. 火车 is fire vehicle, a train. 火锅 is fire pot, hotpot.',
  },
]

export function stepAt(index) {
  return TASTE_STEPS[index] || null
}

export function isCorrect(step, choice) {
  return Boolean(step) && choice === step.answer
}

export function isLastStep(index) {
  return index >= TASTE_STEPS.length - 1
}

// Everything the visitor met, for the post-signup welcome line. The compound
// is deliberately excluded: 火山 is not on the HSK 1 list they are about to
// start, and promising a word the app will not then teach is a small lie.
export function tastedCharacters() {
  return TASTE_STEPS.filter(s => s.hanzi.length === 1).map(s => s.hanzi)
}

// Progress copy under the question. Plain, and never congratulatory before
// there is anything to congratulate.
export function progressLabel(index) {
  return (index + 1) + ' of ' + TASTE_STEPS.length
}
