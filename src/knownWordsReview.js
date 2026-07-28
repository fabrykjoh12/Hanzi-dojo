// Reviewing a pasted word list before any of it becomes a card.
//
// A paste is a claim about a whole deck, and nobody remembers a whole deck
// equally. A word that sat in an Anki file two years ago may be long gone, and
// seeding it as known would quietly rot — the app would believe something about
// the learner that isn't true. So the match lands here first: every matched word
// is shown, ticked by default, and only what is still ticked is seeded.
//
// Everything in this module is pure. The screen holds a `Set` of ticked ids and
// asks these helpers what to draw and what to send.
//
// Two guarantees the tests pin down:
//   • a word that already has a card is never offered and never returned, and
//   • an unticked word can never reach the seeding call, even if its id is
//     somehow still in the selection set.

// Above this many reviewable words the groups start collapsed (bar the first),
// so a 3,000-word paste doesn't render 3,000 rows before the learner can act.
export const AUTO_EXPAND_LIMIT = 80

// buildReviewGroups(vocab, matchedIds, cardedIds) → review
//
// `vocab` must be in curriculum (level, then frequency) order — the order the
// screen loaded it in — because `orderedIds` is what eventually gets spread over
// the coming days, and that spread has to stay frequency-first.
//
//   review.groups      [{ level, words }] ascending by level, words in vocab order
//   review.orderedIds  every reviewable id, vocab order, groups flattened
//   review.matched     how many words the paste matched at all
//   review.alreadyKnown how many of those already have a card (not offered)
//   review.total       how many are up for review (= orderedIds.length)
export function buildReviewGroups(vocab, matchedIds, cardedIds) {
  const matched = toSet(matchedIds)
  const carded = toSet(cardedIds)
  const groups = []
  const byLevel = new Map()
  const orderedIds = []
  let alreadyKnown = 0

  ;(vocab || []).forEach(v => {
    if (!v || !matched.has(v.id)) return
    if (carded.has(v.id)) { alreadyKnown += 1; return }
    orderedIds.push(v.id)
    let group = byLevel.get(v.level)
    if (!group) {
      group = { level: v.level, words: [] }
      byLevel.set(v.level, group)
      groups.push(group)
    }
    group.words.push(v)
  })

  groups.sort((a, b) => a.level - b.level)
  return {
    groups,
    orderedIds,
    matched: matched.size,
    alreadyKnown,
    total: orderedIds.length,
  }
}

// Everything ticked — the default, because the learner did claim the list.
export function selectAll(ids) {
  return toSet(ids)
}

export function toggleSelection(selection, id) {
  const next = toSet(selection)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// Tick (or untick) a batch — one level group, or the whole review.
export function setSelected(selection, ids, on) {
  const next = toSet(selection)
  ;(ids || []).forEach(id => { if (on) next.add(id); else next.delete(id) })
  return next
}

// What a group header needs to draw itself: the counts and whether its
// select-all should read as on, off or partial.
export function groupState(words, selection) {
  const list = words || []
  const sel = toSet(selection)
  let selected = 0
  list.forEach(v => { if (sel.has(v.id)) selected += 1 })
  return {
    total: list.length,
    selected,
    all: list.length > 0 && selected === list.length,
    none: selected === 0,
  }
}

// idsOf(words) → the ids, for the batch helpers above.
export function idsOf(words) {
  return (words || []).map(v => v.id)
}

// claimIdsFor(review, selection) → exactly what may be seeded.
//
// This is the one function the Confirm button is allowed to trust. It walks
// `orderedIds` — which already excludes anything carded — so a stale id in the
// selection set cannot smuggle a word in, and an unticked word cannot survive.
export function claimIdsFor(review, selection) {
  const sel = toSet(selection)
  return ((review && review.orderedIds) || []).filter(id => sel.has(id))
}

// Which level groups start open. Small reviews open whole; a big one opens its
// first level only, so the page stays responsive and the learner still lands on
// something to read rather than a wall of closed rows.
export function initialOpenLevels(groups, limit = AUTO_EXPAND_LIMIT) {
  const list = groups || []
  if (!list.length) return new Set()
  const total = list.reduce((n, g) => n + g.words.length, 0)
  if (total <= limit) return new Set(list.map(g => g.level))
  return new Set([list[0].level])
}

export function toggleLevelOpen(open, level) {
  const next = toSet(open)
  if (next.has(level)) next.delete(level)
  else next.add(level)
  return next
}

function toSet(value) {
  if (value instanceof Set) return new Set(value)
  return new Set(value || [])
}
