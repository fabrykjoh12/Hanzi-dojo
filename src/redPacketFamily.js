// The red packet's concept list, outside RedPacket.jsx for the same reason
// navGlyphFamily.js sits outside navGlyphs.jsx: a `.jsx` file may only export
// components (react-refresh, CLAUDE.md §3).
//
// Three concepts, and they differ in exactly one thing each — what is on the
// front of an otherwise identical packet. The silhouette, the lacquer, the
// lighting and the gold budget are shared, so a comparison is a comparison of
// the idea rather than of three drawings.

// D is not a fourth idea. It is the question the first three renders raise and
// cannot answer between them: B is the only one that says "your cards are in
// here", C is the only one that carries the product's own mark, and neither
// costs anything the other needs. So it is drawn rather than argued about.
export const PACKET_CONCEPTS = ['A', 'B', 'C', 'D']

export const PACKET_NOTES = {
  A: 'Lacquer Envelope — clean plane, one small foil seal on the flap edge.',
  B: 'Cards Peeking Out — the same packet with three card edges standing in its mouth.',
  C: 'Sealed Packet — closed, with the ensō pressed into it in foil.',
  D: 'B + C — the cards standing in the mouth, and the ensō on the body.',
}
