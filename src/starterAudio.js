import { playAudioEl } from './utils'
import { audioSrcFor } from './starterSentences'

// Speak text with the browser's zh-CN voice. Guarded — audio is an enhancement,
// never a gate, so any failure is swallowed.
export function speak(text) {
  try {
    const synth = window.speechSynthesis
    if (!synth || !text) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    synth.cancel()
    synth.speak(u)
  } catch { /* ignore */ }
}

// Play a starter word: try its pre-generated clip, fall back to speech synthesis.
// `el` must be a reused <audio> element (see playAudioEl's contract).
export function playStarterWord(el, sentenceId, wordIndex, hanzi) {
  if (!el) { speak(hanzi); return }
  playAudioEl(el, audioSrcFor(sentenceId, wordIndex), () => speak(hanzi))
}
