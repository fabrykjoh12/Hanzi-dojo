// Reply options for an interactive chat turn: the correct reply (the beat's own
// content text) plus its distractors, in a deterministic seed-shuffle so a
// re-render never reshuffles mid-attempt. Pure — unit-tested.
//
// Stable shuffle: a small LCG seeded by `seed` drives a Fisher–Yates pass, so
// the order is fixed per (option-set, seed) and Math.random is never used.
function shuffleStable(arr, seed) {
  const out = arr.slice()
  let s = (seed * 2654435761) >>> 0 || 1
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) >>> 0
    const j = s % (i + 1)
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp
  }
  return out
}

export function buildReplyOptions(correctText, correctPinyin, distractors, seed) {
  const all = [
    { text: correctText, pinyin: correctPinyin || '', correct: true },
    ...(distractors || []).map(d => ({ text: d.text, pinyin: d.pinyin || '', correct: false })),
  ]
  const options = shuffleStable(all, seed)
  return { options, correctIndex: options.findIndex(o => o.correct) }
}
