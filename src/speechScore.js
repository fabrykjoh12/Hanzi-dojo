// Pure comparison of a speech-recognition transcript to a target word/phrase.
// Kept separate from the Speaking component so the matching rules are unit-tested
// without a browser or a microphone.

// Strip spaces, punctuation, and case so "你好。" ≈ "你好" ≈ "  你 好 ". Keeps the
// script characters (CJK / kana / cyrillic / latin letters) that carry meaning.
export function normalizeForSpeech(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/[.,!?;:'"()[\]{}<>~`^*_\-—–…·、，。！？；：「」『』（）〈〉《》""'']/g, '')
    .trim()
}

// Does the recognized transcript match ANY of the accepted target forms? A
// recognizer often returns a short phrase around the word (or drops a particle),
// so a containment match in either direction counts — but only when the target
// is non-trivial (avoids a 1-char target matching everything).
export function speechMatches(transcript, targets) {
  const t = normalizeForSpeech(transcript)
  if (!t) return false
  const forms = (Array.isArray(targets) ? targets : [targets])
    .map(normalizeForSpeech)
    .filter(Boolean)
  return forms.some(g => {
    if (t === g) return true
    if (g.length >= 2 && t.includes(g)) return true
    if (t.length >= 2 && g.includes(t)) return true
    return false
  })
}
