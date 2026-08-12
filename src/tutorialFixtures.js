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
  recap: {
    title: 'Session complete',
    // "practiced", never "learned": nothing here entered a schedule. The three
    // words are met again, properly, in the learner's real first session.
    line: '3 words practiced',
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
    cta: 'Create account',
  },
}
