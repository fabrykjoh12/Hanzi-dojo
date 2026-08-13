// The red packet's concept list, outside RedPacket.jsx for the same reason
// navGlyphFamily.js sits outside navGlyphs.jsx: a `.jsx` file may only export
// components (react-refresh, CLAUDE.md §3).
//
// Round 2. Three directions, one shared object: the same silhouette, the same
// two planes, the same rim light, the same foil seal. What differs is the
// CONSTRUCTION — whether the packet is folded shut, printed flat, or open with
// the day's cards standing in it — so a comparison is a comparison of the idea
// rather than of three different drawings.

export const PACKET_CONCEPTS = ['A', 'B', 'C']

export const PACKET_NOTES = {
  A: 'Premium lacquer envelope — flap folded over the front, straight fold, seal below it.',
  B: 'Minimal stamped packet — one uninterrupted plane, the seal doing all the work.',
  C: 'Cards-peeking packet — no front flap; two staggered cards standing in the mouth.',
}
