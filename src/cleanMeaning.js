// Tidy a vocabulary `meaning` string for display. The AI-generated glosses are
// often messy ("Good morning., Good afternoon., Hello.") — this normalises the
// separators, strips stray trailing periods, removes duplicate senses, and caps
// the list so popups/cards stay readable. It is DISPLAY-ONLY (never used for
// answer matching) and cannot fix a gloss that is simply wrong.
export function cleanMeaning(raw) {
  if (!raw) return ''
  // Normalise the various separators to a single comma (no regex — OXC parser).
  let s = String(raw)
  s = s.split('、').join(',').split('；').join(',').split(';').join(',').split('/').join(',')

  const seen = new Set()
  const out = []
  for (let part of s.split(',')) {
    part = part.trim()
    while (part.endsWith('.') || part.endsWith(' ') || part.endsWith('。')) {
      part = part.slice(0, -1).trim()
    }
    if (!part) continue
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(part)
  }
  return out.slice(0, 4).join(', ')
}
