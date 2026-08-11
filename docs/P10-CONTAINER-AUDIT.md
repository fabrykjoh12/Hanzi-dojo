# P10-C — the container audit

*2026-08-11. Measured on the head of `claude/hanzi-dojo-continuation-e3vnbg`
(`419f02c`), at 390×844, dark and light, with the e2e mock account. Audit only —
nothing here is implemented except where it says so.*

The question this answers: **is the "AI-generated app" feeling real, and is it
fixable without making the app flatter, less usable or less distinctive?**

Short answer: it is real, it is not "too many cards", and the fix is mostly
*deleting small rounded surfaces inside the cards* plus *dissolving the wrappers
around sections that are not targets*. Two screens carry almost all of it, and
neither is Profile.

---

## How this was measured

A DOM census over each screen, counting every element that **draws itself as a
box**: border-radius ≥ 6px *and* a background, a border, or a shadow that
actually reads (alpha > 0.04). For each box: size, radius, nesting depth inside
other boxes, and its text. Split at 60×28px into **major** surfaces (panels,
tiles, covers, rows) and **small** ones (icon chips, badges, pills, day cells).

The probe cannot see React's `onClick`, so interactivity was read from the source,
not inferred. Story covers, drill tiles and the level-test row *are* tappable
even though a naive DOM check says otherwise.

## The census

| Screen | Major boxes | Small rounded | Nested major | Height |
|---|---|---|---|---|
| **Home** | **4** | 7 (week strip) | 1 (the CTA pill) | 1.00 vp |
| **Profile** (post P10-B) | **6** | 0 | 1 (Review-all button) | 1.92 vp |
| **Practice** | **12** | **16** (icon chips) | 1 | 1.93 vp |
| **Stories** | **20** | **25** (badges + % pills) | 1 | 2.89 vp |
| **Study** (card front) | **2** | 2 (audio buttons) | 1 (REVIEW pill) | 1.00 vp |

Totals per screen including small: Home 11, Profile 6, Practice 28, Stories 45,
Study 4.

**The finding is not the major count.** Home has four boxes in one viewport and
Profile six in two. It is:

1. **Small rounded surfaces inside the cards.** Practice draws 16, Stories 25.
   Sixteen of Practice's are a 34–44px tinted square with an icon in it, one per
   tile and one per tool row. Twenty-three of Stories' are pills: a "Manhua" or
   "Practice" badge and a "% known" capsule on every cover.
2. **Every section is a rectangle with a small-caps label.** On Home, three
   stacked panels of near-identical construction (r16–22, 1px border, same
   shadow, same 14px gap), each headed by an ALL-CAPS eyebrow: `READY TO REVIEW`,
   `THEN READ`, `YOUR WEEK`. The page reads as a stack of widgets rather than a
   screen with a hierarchy.
3. **Uniformity.** Almost every box in the app is radius 16–22 with a 1px
   `--border` and `var(--shadow-1)`. There is a hierarchy of *importance* (one
   lit hero, everything else flat) but almost none of *kind* — a tappable target,
   a group of text and a piece of artwork are all drawn the same way.

`navConfig.js` already records this exact lesson about labels, for the sidebar:
*"Five links do not need a taxonomy — the labels were inventing structure to look
organised, which is the exact thing that makes an interface feel generated."*
Home's eyebrows are doing the same thing one level up. Home's own code also shows
the previous step down this road: the week panel absorbed a second panel because
*"on a phone two separate panels of numbers made Home read as a dashboard"*.

---

## A/B/C/D classification

**A — necessary interactive surface** · **B — necessary grouping** ·
**C — decorative container** · **D — nested box-on-box**

### Home — 4 major, 7 small

| # | Container | Cat | Verdict |
|---|---|---|---|
| 1 | `HeroPanel` — today's queue, the whole block tappable | **A** | **Keep.** The one bounded surface that is the action. |
| 2 | `HeroAction` "Start reviewing" pill, inside the hero | **A** | **Keep.** Nested, but a button needs a bounded hit area. |
| 3 | `Panel` around "Then read" / "Today's story reward" | **C** | **Remove the panel.** The tap target is the `role="button"` row *inside* it; the panel is decoration around an interactive row. Anchor the row on the story's cover art instead. |
| 4 | `Panel` around "Your week" + "Toward HSK 3" | **C** | **Dissolve.** Its content is worth grouping; the rectangle is not what groups it. A heading and a hairline do the same job. |
| 5 | 7 day cells in the week strip (41×30, r8) | **A** | **Keep.** These are data marks, not chrome — the app's rhythm signature. |

**No nested cards on Home.** That part is already clean.

### Profile — 6 major (frozen; candidates only)

| # | Container | Cat | Verdict |
|---|---|---|---|
| 1 | Hero progress panel | **A/B** | **Keep.** One lit panel per screen. |
| 2 | "Needs attention" | **B** | Keep for now. The boundary does separate five word rows from the bars below. |
| 3 | "Known-word map" | **C** | Candidate. Heading + sentence + 3 labelled bars + legend needs no box; the bars carry their own edges. |
| 4 | "Account" rows | **B/C** | Candidate. A heading plus hairline rows would group it as well. |
| 5 | "Reset and delete" rows | **B — keep** | The one box on Profile whose boundary is *meaning*: it fences the destructive actions off from ordinary settings, and its danger border says so. |
| 6 | "Review all N weak words" | **A** | Keep. |

Dissolving 3 and 4 would take Profile to three surfaces without losing a word.
**Not proposed now** — P10-B is device-approved and frozen.

### Practice — 12 major, 16 small (informs the redesign, not done now)

| # | Container | Cat | Verdict |
|---|---|---|---|
| 1 | Hero "Start here" | **A** | Keep. |
| 2 | `LevelTestRow` | **A** | Keep the row (tappable). |
| 3 | 8 × `DrillTile` (173×136) | **A** | Keep bounded — each is a target. |
| 4 | "Look things up" panel wrapping 7 `ToolRow`s | **B** | Keep. One panel, seven hairline rows: already the right pattern. |
| 5 | 8 tile icon chips (36px, tinted, bordered) | **D** | **Remove the chip, keep the icon.** |
| 6 | 7 tool-row icon chips (34px) | **D** | Same. |
| 7 | Hero icon square (44px, `rgba(255,255,255,.13)` + border) | **D** | Same. |

Every drill tile is *tinted square + icon + title + one-line description*, eight
times in a grid. That is the single most template-looking pattern in the app, and
it is the same shape the Profile audit called out and B4 removed.

### Stories — 20 major, 25 small

| # | Container | Cat | Verdict |
|---|---|---|---|
| 1 | Featured hero | **A** | Keep. |
| 2 | 16 story covers | **A** | **Keep, emphatically.** This is where a bounded surface is *correct*: it is artwork with a title. |
| 3 | 4 filter chips | **A** | Keep — controls. |
| 4 | 12 "Manhua"/"Practice" type badges (r999, on covers) | **D** | Show only where the format actually differs from the default. |
| 5 | 11 "% known" pills (r999, on covers) | **D** | Plain text under the title. |

### Study — 2 major, 2 small

| # | Container | Cat | Verdict |
|---|---|---|---|
| 1 | The flashcard | **A** | Keep. It *is* the content. |
| 2 | "REVIEW" state pill | **B** | Keep. One, not twelve. |
| 3 | 2 audio buttons | **A** | Keep. |

**Study is the model for the rest of the app**: one bounded surface that is the
thing itself, and nothing else on the screen.

---

## Home, before → after

Current — 3 stacked panels, 11 rounded surfaces, one viewport:

```
Today                            HSK 2 · Tuesday
┌───────────────────────────────────────┐
│ READY TO REVIEW                    中 │   ← lit, tappable
│ 10  cards waiting · ~7 min            │
│ Daily goal: 0 of 10 new cards         │
│ [ Start reviewing → ]                 │
└───────────────────────────────────────┘
┌───────────────────────────────────────┐
│ THEN READ                             │   ← flat panel around
│ 晚上八点，外面在下雨。             →  │     a tappable row
│ 《末班车》 · you know 0% of it        │
└───────────────────────────────────────┘
┌───────────────────────────────────────┐
│ YOUR WEEK           No sessions yet   │   ← flat panel around
│ ▢ ▢ ▢ ▢ ▢ ▢ ▣                         │     two widgets and
│ W T F S S M T                         │     three numbers
│ ─────────────────────────────────     │
│ Toward HSK 3            0 of 44 words │
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁          │
│      Nothing due tomorrow             │
└───────────────────────────────────────┘
```

Proposed — one box, and the screen as the surface:

```
Today                            HSK 2 · Tuesday

┌───────────────────────────────────────┐
│ READY TO REVIEW                    中 │   ← the ONLY box on
│ 10  cards waiting · ~7 min            │     the screen
│ Daily goal: 0 of 10 new cards         │
│ [ Start reviewing → ]                 │
└───────────────────────────────────────┘

▛▀▀▀▜   晚上八点，外面在下雨。       →     ← cover art is the
▌    ▐   《末班车》 · you know 0%            anchor; the whole
▙▄▄▄▟   Then read                           row is the target
────────────────────────────────────────    (hairline above only)

Your week                    No sessions yet   ← an h2, not an
▢ ▢ ▢ ▢ ▢ ▢ ▣                                    ALL-CAPS eyebrow
W T F S S M T

Toward HSK 3                     0 of 44 words
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁

Nothing due tomorrow · ~6/day this week
```

What changes, precisely:

- The two flat panels lose their box. Nothing else about them changes.
- The story hand-off gains the cover image it already has on Stories, and the
  whole row becomes the tap target instead of a row inside a panel.
- One hairline above the hand-off, one gap before "Your week". Separation comes
  from 28–32px of space and a single 1px rule, not from four borders.
- The eyebrows on the two flat sections become real headings (`h2`, sentence
  case). The hero keeps its eyebrow — inside the lit block it is a label on an
  object, not a taxonomy over the page.
- Nothing is removed. Same numbers, same week strip, same progress bar, same
  forecast line, same destinations.

Result: **1 major box, 1 CTA pill, 1 cover, 7 day cells** — and the hero becomes
unmistakably the only card on the screen, which is what the "one lit panel" rule
was always trying to buy.

---

## Risks and trade-offs

1. **Home gets shorter and may read as empty.** It already fits one viewport at
   390. Removing three borders and ~40px of padding leaves whitespace the design
   has to *use*, not just have. This is the real risk, and it is a judgement call
   that needs a device.
2. **Panels are what currently separate content from the page.** `--surface` on
   `--bg` is a small step in light mode and a larger one in dark. Dissolve the
   panel and the separation must come from the hairline and the spacing — so this
   needs `--hairline` to be visible in both themes at 1px, which is worth
   measuring before committing.
3. **The lit-hero rule depends on contrast with flat panels.** Fewer flat panels
   makes the hero *more* dominant. Probably the point; but on Practice, where the
   hero sits above eight tiles, removing the tiles' chips is safe while removing
   the tiles is not.
4. **`Panel` is shared.** Nine files import from `panels.jsx` and six render
   `<Panel>`. This must be done per screen at the call site, never by changing
   `Panel` itself — that would silently restyle Profile, which is frozen.
5. **Losing a target's boundary costs usability.** A tappable row without a box
   is fine *if* it has a press state; `hd-press` already exists and the hand-off
   row already uses it. Any un-boxed target keeps that class.
6. **Do not trade boxes for gradients.** The temptation, once the boxes go, is
   to reach for a wash or a glow to fill the space. The only new visual weight
   proposed here is *the story's own artwork*, which is real content.

---

## Recommendation

**Yes — but in this order, and not as one sweep.**

1. **Delete the nested chips and pills** (Practice's 16 icon squares, Stories'
   23 badges/pills). Highest texture win, no layout risk, no target changes,
   nothing moves. This alone removes 39 rounded surfaces from two screens.
2. **Dissolve Home's two flat panels** and give the hand-off its cover art. One
   screen, reversible, and the one the user looks at first every day.
3. **Let the Practice redesign inherit the rule** rather than repeating the
   card grid: bounded surfaces for targets, hairline rows for lists, headings and
   space for sections.
4. **Leave Profile alone** until it has had a while on a device. Items 3 and 4 in
   its table are the follow-up, and "Reset and delete" keeps its box for good.

What NOT to do: strip the flashcard, the story covers, the drill tiles or the
lit hero. Those four are the app's distinctiveness, and every one of them is a
target or a piece of artwork. The problem was never the cards — it was the
rectangles that had nothing to hold.

---

## C0 – C2 — what was implemented (2026-08-11)

Approved, and done in three commits. Everything below is measured at 320 / 390 /
430, light and dark, with the e2e mock account.

### C0 · `6b634b6` — the language entry

`MOBILE_MORE` handed every learner a "Language" row into a screen offering to
"start a new language". It is staff-only now, via `moreItemsFor(isAdmin)` in
`navConfig.js`; the desktop rail's seal is a button for staff and a plain label
for everyone else. **The `/languages` route stays open deliberately** — anyone
already on a paused track keeps it, and closing the exit would strand them.

### C1 · `8468bfb` — 39 decorative surfaces

| | before | after |
|---|---|---|
| **Practice** | 28 (12 major + **16** small) | **12** (12 major + **0** small) |
| **Stories** | 45 (20 major + **25** small) | **22** (20 major + 2 small) |

Practice lost all sixteen tinted icon squares — eight on the drill tiles, seven
on the tool rows, one on the hero, one on the level-test row — and kept every
tile boundary, every target and its 2-up grid. The icons grew (22px on tiles,
18–19px on rows) and stayed intentional in colour.

Stories lost the twelve format capsules and the eleven "% known" capsules from
the artwork. The format moved into the meta row *and only when it is not the
usual prose* (`distinctiveFormatLabel`, new and pure — `formatLabel` was printing
"Story" on every prose card). "% known" is a line of full-strength text under the
title: folded into the meta row instead, it pushed "Manhua" past the ellipsis on
a 148px card. What stays on the cover is only what artwork cannot say — the read
check, the progress sliver, the lock.

Targets: Practice 16, none under 44px. Stories 20, with four filter chips at 38px
tall **that were 38px before this change** — noted, untouched, since making them
44 moves the shelf.

### C2 · `5c69ea2` — Home

| | before | after |
|---|---|---|
| Major **panels** | 4 | **1** |
| Total rounded surfaces | 11 | 10 |
| Height at 390 / 430 | 1.00 vp | **1.00 vp** |
| Height at 320 | 1.20 vp | 1.26 vp |
| Headings | `H1:Today` | `H1:Today`, `H2:Then read`, `H2:Your week` |
| Targets under 44px | 0 | 0 |

The one panel left is the HeroPanel, untouched. The story hand-off is a row
anchored on the story's own 2:3 cover — no background, border, radius or shadow
of its own, whole row tappable, `hd-press` intact, Enter/Space working. "Your
week" is an open section: heading, strip, hairline, "Toward HSK 3", bar, forecast
line, every number it had.

Two data marks had to be re-mixed. The week cells and the progress track were
`color-mix(… var(--surface-2))` — a *panel* colour that sits 6/255 from the page
ground, so on an open page the bar was invisible at 0%. Both are 10% of
`var(--text)` over the page now: a 22–23/255 step in light and dark, from one
recipe.

### The defect C2 found

`homeStory.js` selected `cover_url` from `stories`. **That column does not exist**
— the live schema fails `select id, cover_url from stories` with 42703. PostgREST
answers an unknown column with a 400, supabase-js reports it in `error` and leaves
`data` null, and the function's own `stories.length === 0` guard returned null. So
**Home's story hand-off had never rendered in production** for a learner without
an active series.

Nothing could have caught it: the unit suite never touches Supabase and the e2e
mock answers any select with its own rows. `DAILY_STORY_COLUMNS` is exported and
pinned against the real column list in `homeStory.columns.test.js`; every other
`stories` select in `src/` was audited and this was the only phantom.

### Still open, by choice

- **Profile stays as P10-B shipped it.** Items 3 and 4 in its table (Known-word
  map, Account rows) remain candidates; "Reset and delete" keeps its box for good.
- **Practice's information architecture is untouched** — C1 only deleted
  decoration. The redesign inherits the rule.
- **Stories' four 38px filter chips.**

---

## Build-38 device correction (2026-08-11)

Build 38 took C0–C2 to a phone. Two findings, and a standing rule change:

1. **Stories: the "% known" text line under every title was worse than the pill
   it replaced.** Three stacked caption lines per poster made the shelf noisy.
   Corrected: the share is back **on the artwork** — compact white text over a
   quiet bottom scrim, clipped by the cover's corners. Not the old floating
   capsule, and the caption is back to two lines (title + one meta line). The
   format stays in the meta line, only when it is not prose.
2. **Home is cleaner in theory but reads as unfinished on the device.** Not
   corrected yet — three composition options were put to the owner (mostly-open
   improved · hero + one unified secondary surface · two purpose-specific
   cards). The old three-equal-panels layout is not coming back either way.

**The rule change: surface counts are diagnostic, never the goal.** The census
in this document found the problem; it does not define success. A screen with
two excellent surfaces beats a screen with one surface and poor structure.
Judge hierarchy, density, rhythm, grouping and whether the screen looks
intentionally composed on a phone.
