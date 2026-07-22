// One voice at a time.
//
// The app now has several things that can speak - a flashcard's word, its slow
// version, its example sentence, a story line, browser speech synthesis - and
// two of them playing at once is not just untidy, it makes the language
// unintelligible. This tiny registry is the single place that guarantees
// starting one sound stops whatever else was speaking.
//
// Deliberately module-level rather than React state: the elements outlive
// renders, and a component that unmounts mid-playback still has to be able to
// stop its own sound.

let current = null

// Call immediately before play(). Anything already speaking is stopped first.
export function claimPlayback(el) {
  if (current && current !== el) {
    try { current.pause() } catch { /* already detached */ }
  }
  cancelSpeech()
  current = el
  return el
}

// Browser speech synthesis is a separate audio channel from <audio>, so pausing
// an element does not silence it. Both have to be stopped together.
export function cancelSpeech() {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
  } catch { /* unsupported or blocked */ }
}

// Stop everything. Used on navigation away from a reader and when a lookup
// sheet opens over a playing story.
export function stopAllAudio() {
  if (current) {
    try { current.pause() } catch { /* already detached */ }
  }
  current = null
  cancelSpeech()
}

// Release a specific element (on unmount) without silencing whatever took over
// from it in the meantime.
export function releasePlayback(el) {
  if (current === el) {
    try { current.pause() } catch { /* already detached */ }
    current = null
  }
}

export function currentPlayback() {
  return current
}
