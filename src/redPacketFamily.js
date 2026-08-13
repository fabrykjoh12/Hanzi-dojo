// The red packet's directions, outside RedPacket.jsx for the same reason
// navGlyphFamily.js sits outside navGlyphs.jsx: a `.jsx` file may only export
// components (react-refresh, CLAUDE.md §3).
//
// Round 3. Two directions rather than five alternatives, because the review's
// note was that the object needed depth, not more options. Both are the same
// 2.5D construction — the turn, the side plane, the cavity, the occluding lip —
// and they differ in how much of the day's cards the resting object shows, and
// therefore in what the packet is FOR on the screen.

export const PACKET_DIRECTIONS = ['D1', 'D2']

export const PACKET_NOTES = {
  D1: 'Premium lacquer packet — closed, material-led. Card tops just clear the lip; the mark is a blind deboss.',
  D2: 'Open card packet — built around the gesture. Two cards stand well proud with their words showing; a small foil mark.',
}

// The three mark treatments the brief asks to see, as an axis of its own so the
// choice is not entangled with the choice of direction.
export const PACKET_MARKS = ['deboss', 'foil', 'none']

// Where the packet sits in the Cards step. The question is whether the object
// and the action read as one thing or as a decoration next to a button.
export const PACKET_PLACEMENTS = ['beside', 'below', 'anchor']

export const PLACEMENT_NOTES = {
  beside: 'Beside the count — the approved composition, packet top-right.',
  below: 'Beneath the count — packet and action on one line, as a single unit.',
  anchor: 'Anchoring the guide — the packet starts the Cards → Story → Practice rail.',
}
