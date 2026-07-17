// Scene-format helpers. A scene story's content lines start with a single emoji
// "illustration" (e.g. "🌧️ 今天下雨。"). splitScene pulls that leading emoji off
// so it can be rendered big and separate, and stripped before tokenization so it
// never counts as vocabulary. Pure — unit-tested.
//
// "Leading emoji" = the first grapheme cluster, if it contains an Extended
// Pictographic codepoint. Grapheme segmentation (Intl.Segmenter) keeps ZWJ
// sequences (👨‍👩‍👧), skin-tone modifiers (👋🏽) and variation selectors (🌧️) as
// one unit. Regional-indicator flags and digit keycaps are not treated as scene
// emoji (not needed for authored content).
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function splitScene(line) {
  if (!line) return { emoji: '', text: line || '' }
  const first = graphemes.segment(line)[Symbol.iterator]().next().value
  const g = first ? first.segment : ''
  if (g && /\p{Extended_Pictographic}/u.test(g)) {
    return { emoji: g, text: line.slice(g.length).replace(/^\s/, '') }
  }
  return { emoji: '', text: line }
}

export function stripSceneEmoji(content) {
  return (content || '').split('\n').map(l => splitScene(l).text).join('\n')
}
