# P8 — Mobile bottom navigation: audit and three options

**Status: superseded by the device review. The bar that exists today is
`c7eb6c6`; the pending decision is in
[`docs/SESSION-HANDOFF.md`](SESSION-HANDOFF.md).**

Option A shipped first (three commits, 2026-08-11) and was then tested on an
iPhone, where the bar still read as busy and generic. The approved direction is
now closer to Option B: the bar is **Practice · Home · Cards · Stories · More**
with Cards in the physical centre, no waiting count, no top marker, and a
five-glyph icon family drawn for this app (`src/NavIcons.jsx`). What survives
from Option A is the level test's move to Practice and the corrected 58px nav
geometry.

The audit below is left exactly as written — against `574501d`, TestFlight
build 33 — because it is the record of what the bar was and why, and every
number in it was read from the code or measured in a real render. Two of its
judgements did not survive contact with a phone, and both are worth keeping
visible: it ranked centring Cards second on the grounds that the loop order
read left-to-right (it does not, once Cards is the thing you actually open the
app for), and it treated the waiting count as the bar's missing information (on
a device it made the bar read as a dashboard).

What was built, and the questions the next build exists to answer, are in
[`docs/MOBILE-DEVICE-QA.md`](MOBILE-DEVICE-QA.md) §B2.

---

## 1 · What the bar is today

### 1.1 Composition

`MobileNav.jsx` renders `MOBILE_PRIMARY` (`navConfig.js`) plus one hardcoded
"More" tab:

| Slot | Key | Label | Icon |
|---|---|---|---|
| 0 | `home` | Home | `Home` |
| 1 | `study` | **Cards** | `Layers` |
| 2 | `stories` | Stories | `BookOpen` |
| 3 | `practice` | Practice | `Target` |
| 4 | — | More | `MoreHorizontal` |

Five `flex: 1` columns. `columns = PRIMARY.length + 1` is already derived, so
adding or removing a primary tab needs no other change inside the component.

### 1.2 Measured geometry

Measured in a real Chromium render at the three widths in the brief (temporary
spec, removed after measuring):

| Width | Bar height | Tab width | Tab height |
|---|---|---|---|
| 320 | 57.75px | 64.00px | 56.75px |
| 390 | 57.75px | 78.00px | 56.75px |
| 430 | 57.75px | 86.00px | 56.75px |

Plus `padding-bottom: env(safe-area-inset-bottom)`.

**Finding: `MOBILE_NAV_HEIGHT = 62` over-reserves by 4.25px.** `App.jsx` pads
`main` with `calc(62px + env(safe-area-inset-bottom))` and `studyLayout.js`
subtracts the same 62 from the flashcard's available height. The bar is
57.75px. Every screen therefore leaves a 4px dead strip above the bar, and the
flashcard is 4px shorter than it needs to be on a 568px phone. `geometry.spec.js`
asserts `barTop` within ±8px, which is exactly wide enough to hide this.

### 1.3 Visual treatment

- Ground: `--surface-glass`, `backdrop-filter: blur(14px)`, `border-top: 1px
  solid var(--border)`, `z-index: 30`.
- Icon: lucide, 22px, stroke `1.85` → `2.2` when active; colour `--text-muted`
  → `ink(accentHex)`.
- Label: 10.5px, weight `500` → `700`, same two colours, `transition: color
  160ms`.
- Active marker: a 3px bar on the **top** edge, `42%` of its column wide
  (≈27px at 320, ≈36px at 430), sliding between columns in 300ms
  `cubic-bezier(0.22, 1, 0.36, 1)`, `opacity: 0` when no column is active.
- `.hd-tab.is-active .hd-tab-icon` lifts the icon 1px, 220ms, slight overshoot.
- `.hd-press` scales on `:active`. All of it is neutralised under
  `prefers-reduced-motion`.

**Finding: the active state is carried almost entirely by colour.** The one
positional cue — the 3px marker — sits on the top edge, 1px from the bar's own
`border-top`, which is the same weight and nearly the same place. On a device
the two read as one line. Whether the colour delta itself is sufficient is a
measurement, not a guess: `ink()` lifts the accent toward white in dark mode
while `--text-muted` is also light there, so the dark-mode delta is the one to
check — the same method P1 used.

### 1.4 Behaviour

Everything here is correct and should be preserved by any option:

- **Reselect** (`tabReselect`, `App.jsx:438`): dismiss an overlay → **do
  nothing if a flashcard session is in progress** → reset the stack → scroll to
  top. Never mints a history entry.
- **Haptics**: `tapFeedback()` fires only when the tab actually changes, and
  never for `logout`. Opening the More sheet bypasses `go()`, so it produces no
  haptic — which matches `haptics.js`'s own stated rule ("opening a sheet: no").
- **Safe area**: handled on the bar and on `main`.
- **Transitions**: tab switch is opacity `0.62 → 1` over 150ms with *no*
  translation, by design (NAV-MODEL §5.4) — tabs are peers and sliding them
  would claim an order they do not have.
- **A11y**: `nav aria-label="Primary"`, `aria-current="page"` on the active
  tab, `aria-expanded` + `aria-haspopup="dialog"` on More. The sheet is a real
  `role="dialog"` `aria-modal="true"` with a focus trap, Escape, Android-Back
  via `pushSheet`, and focus restored to the More button on close.
- **Hiding** (`tabBarVisible`): hidden for every `full`, `admin` and `account`
  class, and for Study while a card is actually on screen.

One small blemish: the More tab carries `aria-current="page"` whenever the
active view is anything inside the sheet, while also being `aria-haspopup`. It
is doing two jobs — menu opener and section indicator.

### 1.5 What each tab is actually for

This is the part the brief asks not to take on trust from the labels.

| Tab | Owned destinations (Chinese) | What it really is |
|---|---|---|
| Home | **0** | A coach. One hero (today's queue + goal + start button), the story hand-off, the week. Surfaces exactly one action. |
| Cards | **1** (`weak`) | Not a place — a **verb**. Its root goes straight into a card, so tapping it hides the tab bar. |
| Stories | **2** (`series` push, `reader` full) | A library. Two real destinations behind it. |
| Practice | **15** (7 pushed, 8 fullscreen) | A **drawer**: 9 drills + 6 reference tools. |
| More | 5 learner rows (+2 admin) | The other **drawer**: Test, Profile, Language, Settings, Log out. |

**This table is the whole diagnosis.** The bar presents five peers, but they are
a coach, a verb, a library, a drawer, and a second drawer. Nothing in the bar
distinguishes the action a learner performs 20–100 times a day from the drawer
that holds Log out. That is what "too flat" is, precisely.

### 1.6 Two IA defects found on the way

1. **The level test is reachable only through More.** `test` is owned by the
   Practice tab (`VIEW_CLASS`), the desktop sidebar gives it a top-level rail
   slot, and no screen in the app navigates to it — `buildPracticePlan` does not
   list it among the drills or the tools. So on a phone the gate on
   progression, the thing that requires 100%, lives in the same drawer as
   Log out. This is worth fixing whichever option is chosen.
2. **The waiting count already exists and mobile does not get it.** `Sidebar.jsx:190`
   computes `newCount + learnCount + dueCount`, shows it on Flashcards only,
   hides it at zero ("0 is a nag"), and draws it as plain accent tabular digits
   — deliberately *not* a filled pill, because the rail already has one coloured
   object. `MobileNav` is not passed `counts` at all. Mobile parity is one prop
   and one span, using a rule the product already decided once.

---

## 2 · Thumb ergonomics, tied to this product

The bar is at the bottom, which is right and not in question: during a session
the learner's hand is *already* at the bottom, because that is where `GradeRow`
is. So the question is not reachability, it is **which target is easiest**, and
whether the bar competes with the grade buttons.

- **320×568.** Five 64px columns. Comfortable horizontally; 56.75px tall is
  well over the 44px minimum. The real constraint here is that the bar costs
  ~10% of the screen and `studyLayout` starts dropping the flashcard's prompt
  line on this device. **Anything that makes the bar taller is paid for by the
  flashcard.** That single fact disqualifies a raised centre button.
- **390×844.** 78px columns. No pressure in either direction.
- **430×932.** 86px columns. A right thumb's easiest column is the middle one
  (index 2 — currently Stories); the hardest is index 0 (Home). This is a real
  effect but a weak argument on its own: the difference between column 1 and
  column 2 on a 430 phone is a few millimetres, whereas the difference between
  "Cards looks like the action" and "Cards looks like Settings' neighbour" is
  the entire question.

---

## 3 · Visual hierarchy: the house answer

The app's own rule is **one lit panel per screen** (`designTokens.js`).
The bar's honest analogue is **one lit tab** — not raised, not floating, not a
circle, not a gradient: *lit*. The accent at full ink weight with the count
beside it, against four muted peers. That is the same rule every other screen
already obeys, which is exactly why it will read as authored rather than as a
pattern pasted on from another app.

Explicitly ruled out, per the brief and per the measurements above: a floating
centre circle (costs bar height the 320 flashcard cannot pay, and reads as a
compose button, which Cards is not), gradients, glow, oversized badges,
cartoon gamification, a pill behind every label, and animation on every tap.

---

## 4 · The three options

### Option A — One lit tab

**What changes.** Nothing structural. Same five tabs, same order, same widths,
same height.

1. **Cards carries the waiting count.** Same number as the Home hero and the
   desktop sidebar, same rule (hidden at zero), same treatment (plain accent
   tabular digits at the icon's top-right; no fill, no ring, no pill). The
   tab's `aria-label` becomes "Cards, N waiting", mirroring the sidebar.
2. **The active state gets a real positional cue.** The marker widens from 42%
   to ~60% of its column so it reads as a section indicator rather than a dash,
   and stops competing with the bar's own 1px top border. Active/inactive
   contrast is *measured* in both themes and raised to a stated minimum rather
   than eyeballed.
3. **The level test leaves More** and gets a real home on the Practice screen
   (a gate row, gated on `TEST_UNLOCK_MASTERY_PCT` against `counts.masteredPct`,
   which Practice already receives).

**Why this and not more.** The bar's problem is not its shape or its order —
those are already right, and the order already reads as the daily loop. Its
problem is that it carries no information and gives the day's action the same
weight as the drawer. (1) fixes the information, (2) fixes the weight, (3)
fixes the one genuine IA defect. Everything else stays where a device test
found no fault.

**Engine risk: none.** Presentation plus one prop. No change to `navStack.js`,
`navShell.js`, `TABS`, `VIEW_CLASS`, the ledger or the URL projection.

**Cost:** ~1 new pure module, 2 files touched in `src/`, plus Practice.
**Reversibility:** total — every part is independently revertable.

---

### Option B — Cards centred

**What changes.** Reorder `MOBILE_PRIMARY` to **Home · Stories · Cards ·
Practice · More**, putting Cards in column 2 — the physical centre of a
five-column bar and the easiest reach for either thumb. Cards keeps exactly
the same size and shape as its neighbours (no raise, no circle, no gradient)
but is the only tab drawn in the accent *at rest*, and carries the count from
Option A.

**Why it might be right.** It makes the primary action structurally, not just
stylistically, primary — the position itself says it, so the treatment can stay
quieter than in A. It costs nothing in bar height.

**Why it probably is not.** The bar's left-to-right order currently *is* the
daily loop from CLAUDE.md §1: Home → Cards → Stories → Practice. Centring Cards
requires putting Stories in front of it, which states the loop backwards —
read first, then review. A five-column bar has exactly one centre and Home
occupies index 0 by right, so there is no arrangement that both centres Cards
and preserves the loop.

**Engine risk: none** (an array reorder). But it changes muscle memory for every
existing tester, which is a real cost for an app already on TestFlight.

**Cost:** one array + A's badge work. **Reversibility:** total.

---

### Option C — Four tabs

**What changes.** Practice leaves the bar. It becomes `Home · Cards · Stories ·
More` (4 columns of 80 / 97.5 / 107.5px), with Practice moved into
`MOBILE_MORE` and surfaced as a row on Home.

**Why it might be right.** It removes the drawer-next-to-a-drawer problem
directly: the bar would then hold the daily loop plus one drawer, and each
remaining slot would be a genuinely different kind of thing.

**Why it is not.** Two reasons, and the first is decisive.

1. **It moves the flatness, it does not remove it.** With Practice inside More,
   the More tab lights up for Practice, Test, Profile, Language and Settings —
   i.e. for most of the app's surface. More becomes the real fifth section
   under a different name, and the bar is no more legible than before.
   (Mechanically it does work — `activeColumn` would be `-1` and the marker
   would hide while you are *inside* Practice, so Practice **must** be added to
   `MOBILE_MORE` for the bar to light at all. That is a workaround, not a
   design.)
2. **It buries the only two things besides the queue that can say "N waiting".**
   Weak words and Grammar review both carry live counts (`practicePlan.js`), and
   the Practice hero already promotes whichever one is non-empty. Putting them
   two taps deeper reduces the discoverability of the app's only other
   attention signal.

The brief says not to remove Practice for symmetry. This option does not remove
it for symmetry — it removes it for the drawer argument — but the drawer
argument does not survive contact with what actually happens to More.

**Engine risk: low-but-real.** No shell rewrite, but it is the only option that
changes which views are reachable from the bar, and it needs `MOBILE_MORE` and
the `moreActive` logic to absorb a whole tab root.

**Cost:** navConfig + Home + More + a re-test of every deep link into Practice.
**Reversibility:** good, but testers will have re-learned the bar twice.

---

## 5 · Ranking

Ten criteria, drawn from the brief:

| | A | B | C |
|---|---|---|---|
| Makes the daily loop legible | ✓ | ✗ (states it backwards) | ~ |
| Makes the primary action unmistakable | ✓ | ✓✓ | ~ |
| Surfaces what is waiting | ✓ | ✓ | ✗ (buries weak/grammar) |
| Thumb cost | neutral | best | neutral |
| Respects the avoid-list | ✓ | ✓ | ✓ |
| Engine risk (§11) | none | none | low-but-real |
| Accessibility | improves (labels carry counts) | same as A | same as A |
| Test / QA cost | small | small | largest |
| Reversibility | total | total | good |
| Verifiable on a device | ✓ | ✓ | ✓ |

**1st — Option A.** It is the only one that addresses the actual diagnosis (the
bar carries no information and no weighting) without trading away something the
product already has right. Every part is independently justifiable,
independently testable and independently revertable, and it is a pure
configuration/presentation change.

**2nd — Option B.** Strongest single idea in the set — position is a louder
statement than styling — but it buys that by contradicting the loop order the
bar currently encodes correctly, and by resetting muscle memory mid-TestFlight.
If device testing after A shows Cards still does not read as primary, B is the
next move, and A's work carries over unchanged.

**3rd — Option C.** Solves a real problem in the abstract and reintroduces it in
practice. Recommend not doing it.

---

## 6 · Wireframes (text)

Today, 390pt:

```
┌──────────────────────────────────────────────────────┐
│ ▁▁▁▁▁▁                                               │  ← 3px marker, 42% wide,
│  ⌂        ▤         ▦         ◎         ⋯            │    on the top edge, next
│ Home     Cards    Stories   Practice   More          │    to the 1px border
└──────────────────────────────────────────────────────┘
```

Option A:

```
┌──────────────────────────────────────────────────────┐
│ ▁▁▁▁▁▁▁▁▁                                            │  ← 60% wide
│           ▤²⁴                                        │
│  ⌂        ▤        ▦         ◎         ⋯             │
│ Home     Cards   Stories   Practice   More           │
└──────────────────────────────────────────────────────┘
                └─ accent digits, no pill, absent at zero
```

Option B:

```
┌──────────────────────────────────────────────────────┐
│                     ▁▁▁▁▁▁▁▁▁                        │
│  ⌂        ▦         ▤²⁴       ◎         ⋯            │
│ Home    Stories    Cards    Practice   More          │
└──────────────────────────────────────────────────────┘
                       └─ accent at rest, not only when active
```

---

## 7 · Implementation plan for Option A

Three commits, each shippable on its own.

**Commit 1 — the count.**
- `src/navBadges.js` (new, pure): `tabBadge(counts)` → `{ study: n|null }`,
  `badgeLabel(label, n)`. One definition, shared by `Sidebar` and `MobileNav`,
  so the two can never disagree; `Sidebar`'s inline `badgeFor` is replaced by it.
- `src/MobileNav.jsx`: accept `counts`, render the digit at the icon's
  top-right, extend `aria-label`.
- `src/App.jsx`: pass `counts` (already in scope) to `MobileNav`.
- `src/navBadges.test.js`: zero → nothing; the three counts sum; a failed load
  shows nothing rather than a false zero; the label is what a screen reader says.

**Commit 2 — the active state.**
- Widen the marker to ~60%; measure the active/inactive contrast in both themes
  with a Playwright spec (the P1 method) and raise it to a stated minimum.
- Reconcile `MOBILE_NAV_HEIGHT` with the measured bar height, or record why the
  4.25px stays; tighten `geometry.spec.js`'s ±8px tolerance so it cannot drift
  again.

**Commit 3 — the level test.**
- `src/practicePlan.js`: the level test becomes a real entry on the Practice
  screen, gated on `TEST_UNLOCK_MASTERY_PCT` vs `counts.masteredPct`, with the
  locked state saying plainly what opens it.
- Remove `test` from `MOBILE_MORE` once it has a home.

**Tests, in the same commits:** `navBadges.test.js`; an e2e pinning the bar at
320/390/430 — no badge at zero, badge equals the Home hero's number, every tab
still ≥44px, bar height unchanged, `aria-label` carries the count, Test
reachable from Practice and absent from More.

**Docs:** `docs/MOBILE-DEVICE-QA.md` gains a badge/active-state row;
`ROADMAP.md` gets its entry when the work ships, not before.

**Not in scope**, per the freeze: the navigation engine, transitions, the
outgoing layer, iOS swipe-back, typography, Study, Stories, caching.
