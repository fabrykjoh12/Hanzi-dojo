// Bubble layout for chat-format stories: assign each distinct speaker a stable
// side (first speaker left, second right, alternating after) and a color from a
// fixed palette. Narration lines (no speaker) render as centered system text and
// are not keyed here. Pure — unit-tested.
const PALETTE = ['#B83A24', '#2E6FB8', '#2F9E6D', '#C2680E', '#7C5CD0', '#B83A7A']

export function assignSpeakerSides(beats) {
  const map = {}
  let n = 0
  for (const b of beats || []) {
    if (!b.speaker || map[b.speaker]) continue
    map[b.speaker] = { side: n % 2 === 0 ? 'left' : 'right', color: PALETTE[n % PALETTE.length] }
    n += 1
  }
  return map
}
