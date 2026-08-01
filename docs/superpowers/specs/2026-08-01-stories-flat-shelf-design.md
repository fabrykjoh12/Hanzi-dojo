# Stories page: one-page shelf (flat, level-sectioned) — design

Approved by owner 2026-08-01 (chat). Replaces the First Steps / Growing /
Fluent tier **tabs** with a single scrollable page. Tier logic itself is
untouched — it keeps gating unlocks invisibly.

## Decisions (owner)

1. **One card per series** — a multi-chapter season is one cover card with
   chapter progress ("3 / 6"); tapping resumes the next unread chapter.
   Standalone stories are normal cards.
2. **Level sections, % known inside** — a section per HSK level; within a
   section, most-readable first.
3. **Locked stories visible, calm** — dimmed card, small lock, "Learn N more
   words". Never hidden.

## Layout

1. Today's-story `HeroPanel` — unchanged (the screen's one lit panel).
2. Existing filter row (All / Unread / Read + format chips) — kept.
3. Sections ordered: **current level first**, then lower levels descending
   (closest first), then the **next level only** as a locked teaser at the end
   ("Unlocks when you pass the <level> test") — levels beyond the next stay
   over the horizon rather than rendering a wall of locks. Section header:
   level label + "N of M read".
4. Card grid per section (responsive, same card component for series and
   standalone).

## Card anatomy

- Cover art (16:9, existing `image_path` / designed fallback), title below.
- **% known pill** — readability of the *next unread chapter* (that's what
  you'd read), color mixed toward green as it rises.
- Format chip only when not a plain story (Manhua / Chat / Scene / Reply).
- Series: thin progress bar + "3 / 6". Finished: calm check.
- Locked: dimmed, lock icon, "Learn N more words" (from the existing tier
  thresholds). Not tappable into the reader.

## What goes away (presentation only)

Tier tabs, tier progress bar, tier copy on this page. `storyTiers.js` /
`storyShelf.js` tier maths stay as the unlock rule.

## Implementation shape

- New pure module `src/storyShelfFlat.js` (+ `.test.js`): groups published
  stories into units (series via `storyArcs.groupIntoArcs`, standalones),
  computes per-unit next-chapter, read counts, lock state (existing tier
  helpers), and sorts sections/units per the rules above. No React, no
  Supabase.
- `Stories.jsx` renders the sections; readability memoized per story id.
- `tests/e2e/stories-shelf.spec.js` rewritten to pin the new layout.
- Existing deep links, reader modes, daily story, and read-tracking unchanged.
