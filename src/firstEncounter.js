// The first encounter: one flashcard, one micro-story, before any account.
// Rendered by FlashcardIntro.jsx and MicroStory.jsx; the surrounding flow
// lives in Landing.jsx.
//
// This is the product's core loop in miniature — discover a word, understand
// it, meet it in a story, use it yourself — and every piece of it is real:
// the audio ids point at the same Azure neural clips the flashcards play
// (verified against the vocabulary table), the story is completable by a
// person who has never seen Chinese, and the wrong answers are real words
// they will meet in week one, each with a gentle explanation instead of a
// buzzer.

export const FLASHCARD = {
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  meaning: 'Hello',
  vocabId: '7144c752-7385-4062-91e9-81e27fbeaa50',
  // Legacy bucket path — the fallback when the tts_audio lookup has not
  // landed (offline, slow network). Speech synthesis is the fallback's
  // fallback, in starterAudio.speak.
  audioPath: 'chinese/hsk_3/level_1/147_ni_hao.mp3',
  breakdown: [
    { hanzi: '你', gloss: 'you' },
    { hanzi: '好', gloss: 'good' },
  ],
}

// The tea-shop scene. Three beats; the reply choices are all genuine HSK 1
// words with genuine Azure clips, so "listen before you choose" works on
// every option, not just the right one.
export const STORY = {
  panels: [
    { id: 'arrive', narration: 'Mei pushes open the door of a small tea shop. She has never been here before.' },
    { id: 'greet', speaker: 'The shopkeeper', line: '你好！', vocabId: FLASHCARD.vocabId },
    { id: 'reply', prompt: 'What should Mei say?' },
  ],
  replies: [
    {
      hanzi: '谢谢', pinyin: 'xièxie', meaning: 'thank you',
      vocabId: 'e77a8028-fa29-417d-b59c-0ad0d99118f5',
      note: '谢谢 means “thank you” — kind, but nobody has given Mei anything yet. Try another.',
    },
    {
      hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello',
      vocabId: FLASHCARD.vocabId,
      correct: true,
    },
    {
      hanzi: '再见', pinyin: 'zàijiàn', meaning: 'goodbye',
      vocabId: '7d0a10ae-1b9b-4288-8c38-6f1d1f3dbe4f',
      note: '再见 means “goodbye” — Mei only just walked in. Try another.',
    },
  ],
  // After the right choice: the scene resolves, in her voice.
  resolution: {
    speaker: 'Mei', line: '你好。',
    narration: 'The shopkeeper nods, already reaching for the good tea.',
  },
}

// Every vocabulary id the encounter can speak — warmed in one lookup.
export function encounterVocabIds() {
  return Array.from(new Set([FLASHCARD.vocabId, ...STORY.replies.map(r => r.vocabId)]))
}

export function isRightReply(reply) {
  return Boolean(reply && reply.correct)
}

// The gentle line shown for a miss. Never scolds; always says what the word
// DOES mean, because the visitor came away knowing one more word either way.
export function replyNote(reply) {
  return (reply && reply.note) || null
}

// Completion copy, per the owner's spec — deliberately does NOT claim
// mastery. One encounter is one encounter; the SRS decides what "learned"
// means later.
export const ENCOUNTER_DONE = {
  title: 'You understood your first Chinese story',
  discovered: 'First expression discovered: 你好',
  line: 'Hanzi Dojo helps you discover new words and then experience them inside meaningful stories.',
  cta: 'Build my training path',
}
