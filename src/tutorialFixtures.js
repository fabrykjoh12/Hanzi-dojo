// Everything the onboarding tutorial says and shows, as data.
//
// Static and signed-out safe by design: the tutorial runs before an account
// exists, so it cannot look anything up. The three words are real vocabulary
// rows — verified against the live table on 2026-08-10, including their clips —
// and their ids are carried here so a contract test can prove the tutorial is
// teaching words the product actually contains, not three strings someone typed.
//
// The audio paths are the public `audio` bucket, which needs no session. The
// generated Azure clips (tts_audio) are an upgrade the runner may warm if it
// likes; the tutorial must never depend on that lookup, or a learner on a bad
// connection gets a tutorial that does not work.
//
// No React, no CSS, no component decisions. What it looks like is Tutorial.jsx's
// business; what it says is here.

// Three first words, in the order they are taught. `state: 'new'` is what the
// real card marker reads, and it is the truth: these are new words.
export const TUTORIAL_CARDS = [
  {
    id: 'tutorial-nihao',
    vocabId: '7144c752-7385-4062-91e9-81e27fbeaa50',
    word: '你好',
    reading: 'nǐ hǎo',
    meaning: 'hello',
    audioPath: 'chinese/hsk_3/level_1/147_ni_hao.mp3',
    level: 1,
    state: 'new',
  },
  {
    id: 'tutorial-xiexie',
    vocabId: 'e77a8028-fa29-417d-b59c-0ad0d99118f5',
    word: '谢谢',
    reading: 'xièxie',
    meaning: 'thank you',
    audioPath: 'chinese/hsk_3/level_1/241_xiexie.mp3',
    level: 1,
    state: 'new',
  },
  {
    id: 'tutorial-zaijian',
    vocabId: '7d0a10ae-1b9b-4288-8c38-6f1d1f3dbe4f',
    word: '再见',
    reading: 'zàijiàn',
    meaning: 'goodbye',
    audioPath: 'chinese/hsk_3/level_1/272_zaijian.mp3',
    level: 1,
    state: 'new',
  },
]

// The scene — the frame around the whole tutorial (P12-1, Concept B).
//
// Shown TWICE, from this one object: once before the cards, unreadable, and
// once after them, readable. One source, two renderings, so the before and the
// after can never drift apart — the payoff only lands if the learner can see
// it is the exact same Chinese.
//
// The two lines are, between them, nothing but the three words the learner is
// about to meet (plus punctuation) — which is what makes "this time you can
// read it" literally true rather than a marketing claim. `known` names the
// tokens the after-rendering marks; the runner marks them, this file decides
// nothing about how. Deliberately not a story from the library and
// deliberately not run through the reader: this is two lines of Chinese, and
// building it out of the real story engine would make a 100-second tutorial
// depend on the shelf.
export const TUTORIAL_SCENE = {
  setting: 'Mei pushes open the door of a small tea shop.',
  lines: [
    {
      id: 'greeting',
      speaker: 'The shopkeeper',
      text: '你好！',
      translation: 'Hello!',
      known: ['你好'],
    },
    {
      id: 'leaving',
      speaker: 'Mei',
      text: '谢谢。再见！',
      translation: 'Thank you. Goodbye!',
      known: ['谢谢', '再见'],
    },
  ],
}

// The reading lesson (P12-6): one more line, one unfamiliar word.
//
// The scene's payoff worked because the learner could read ALL of it. This
// beat teaches the other promise — you don't have to know every word before
// reading, because inside a story an unknown word is one tap away. So the line
// contains exactly ONE word the tutorial did not teach, deliberately left
// untranslated on the page; tapping it opens the real reader's own lookup, fed
// by this fixture.
//
// `word` is a real vocabulary row, shaped like one — verified against the live
// table on 2026-08-12 — because it feeds the production lookup component, and
// the level chip, reading and meaning it shows must be exactly what the real
// reader would show for this word. The clip is the public bucket, so the
// sheet's play button works signed out.
export const TUTORIAL_LOOKUP = {
  setting: 'One more line — Mei looks outside.',
  line: '下雨。',
  word: {
    id: 'c537208f-0687-40f9-b6a9-493a77acc5d9',
    word: '下雨',
    reading: 'xià yǔ',
    meaning: 'to rain',
    level: 1,
    language: 'chinese',
    system: 'hsk_3',
    audioPath: 'chinese/hsk_3/level_1/227_xia_yu.mp3',
  },
}

// The schedule preview under the four grades, on cards 2 and 3 (P12-3).
//
// Card 1 teaches what the grades MEAN; from card 2 the row shows what a grade
// DOES, in the exact slot the real study screen uses — which is what makes
// "your grade decides when you see it again" demonstrated rather than
// asserted. Fixture values, deliberately: the real preview call is
// non-deterministic (the scheduler fuzzes the longer intervals so reviews
// spread out), and a tutorial must render the same on every device. The first
// three ARE the production values for a brand-new card, byte for byte, and the
// fourth sits inside the production fuzz band — a test pins both claims
// against the live preview, so a scheduler tuning change fails loudly here
// instead of quietly letting the tutorial lie.
export const TUTORIAL_INTERVALS = ['1 min', '6 min', '10 min', '7 days']

// Every line the tutorial says. Short enough to read at a glance, because a
// learner who is being taught by doing is not reading.
export const TUTORIAL_COPY = {
  welcome: {
    title: 'Learn Chinese through words and stories.',
    cta: 'Start',
  },
  // Coaching, by what it points at. Each line appears once and then never again
  // — see COACHING in tutorialScript.js for when.
  coach: {
    reveal: 'Tap to reveal',
    pronunciation: 'Tap to hear it',
    // The prompt itself is NOT here: it depends on whether the card is new or
    // a review, and gradePrompt.js owns that for the whole app. All three
    // tutorial cards are new, so the tutorial asks the new-card question.
    // Said after the first grade, on the next card, because it can only be
    // understood once you have actually pressed one of them.
    scheduled: 'Your grade decides when you see it again.',
  },
  // Before the cards: the learner registers "I can't quite read this", and
  // nothing else. No pinyin, no translation, no grammar, no product pitch —
  // any of those would spend the payoff before it is earned.
  sceneBefore: {
    line: 'You probably can’t read this yet. It takes three words.',
    cta: 'Learn them',
  },
  // The recap's tally line is derived from the card count where it renders
  // ("3 words practiced" — the runner owns the number so it can never drift
  // from CARD_COUNT). "practiced", never "learned": nothing here entered a
  // schedule; the three words are met again, properly, in the learner's real
  // first session.
  recap: {
    title: 'Session complete',
    cta: 'Continue',
  },
  unlock: {
    title: 'Story unlocked',
    line: 'Finishing a session opens the next chapter.',
    cta: 'Read it',
  },
  // After the cards: the same scene, readable. The line states the fact and
  // stops — the scene itself is the argument, and the old four-word loop
  // summary this replaces was the app explaining what the learner just did.
  sceneAfter: {
    line: 'The same scene — this time you can read it.',
    cta: 'Continue',
  },
  // The reading lesson. One coach line, spent once the word has been tapped —
  // no dictionary tour, no feature list. The account ask moves here, because
  // this is now the last thing the tutorial has to say.
  lookup: {
    coach: 'See a word you don’t know? Tap it.',
    cta: 'Create account',
  },
}
