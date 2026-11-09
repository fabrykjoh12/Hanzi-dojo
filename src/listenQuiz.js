// Which words a listening exercise may ask about, and the quiz built from them.
//
// A listening question plays a word and asks which one it was, so a word the
// app cannot play is not a hard question — it is an unanswerable one. That is
// what Listen used to build: it kept every word whose `audio_path` was
// non-null, and from HSK 3 up most of those paths named files that were never
// written (FAB-64), so the quiz played silence and marked the learner wrong.
//
// Playability is decided by the caller's `urlOf(word)`, not by reading
// `audio_path` here. A word can be playable through a generated clip
// (`tts_audio`, which is where new recordings land) with no `audio_path` at
// all, and a non-null path is only as good as the file behind it — so the one
// question worth asking is "what URL would this play?", and `flashcardAudio`
// already answers it the way the flashcards do.

export const LISTEN_QUESTION_COUNT = 12

// Three distractors plus the answer. Below this the screen says the level has
// too little audio instead of showing a question it cannot fill.
export const LISTEN_MIN_PLAYABLE = 4

export function playableWords(pool, urlOf) {
  return (pool || []).filter(v => !!urlOf(v))
}

// Each question carries the URL it was chosen for, so the screen plays exactly
// what made the word eligible rather than re-deriving it from the row.
//
// Distractors come from the whole pool, playable or not: they are read, never
// heard, so a silent word is a perfectly good wrong answer.
export function buildListenQuestions(pool, urlOf, shuffle, { count = LISTEN_QUESTION_COUNT } = {}) {
  const words = pool || []
  const playable = playableWords(words, urlOf)
  if (playable.length < LISTEN_MIN_PLAYABLE) return []
  return shuffle(playable).slice(0, count).map(correct => ({
    correct,
    audioUrl: urlOf(correct),
    options: shuffle([correct, ...shuffle(words.filter(v => v.id !== correct.id)).slice(0, 3)]),
  }))
}
