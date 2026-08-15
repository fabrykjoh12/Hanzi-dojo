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
