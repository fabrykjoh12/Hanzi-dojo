# Session handoff

**What is true as of 2026-08-11, branch
`claude/hanzi-dojo-continuation-e3vnbg`.** Development moved to that branch,
started from `29e2065` — the exact head of
`claude/hanzi-dojo-mobile-rebuild-c1nb3u`, which is now frozen as the historical
checkpoint for TestFlight build 34 and must not receive further commits. Read
`CLAUDE.md` first, then this. It says what the app is
now — not the history of how it got here (`git log` and `docs/CHANGELOG.md` have
that) and not ideas that were considered and dropped.

---

## Current product state

**P9 — the onboarding rebuild — is finished, shipped and device-approved.**
Do not redesign it. The sequence a brand-new learner walks:

1. **Landing** → *Begin training*. No questionnaire, no language picker.
2. **Tutorial** (`Tutorial.jsx`, driven by the pure state machine in
   `tutorialScript.js`): three real HSK 1 words — 你好, 谢谢, 再见 — on the
   **real** `Flashcard` and `GradeRow` components, with real audio. Coaching
   fades out across the three cards.
3. **Session complete → a chapter unlocks → a two-panel story** made only of the
   three words just learned, with the before/after payoff.
4. **Account creation.** Nothing before this point writes to the database, and a
   spec asserts that.
5. **One question**: new to Chinese / know some / know your HSK level.
6. Straight into the learner's real first session.

Roughly ninety seconds and twelve taps before the account. Progress is resumable
mid-tutorial; Settings → *Replay introduction* runs it again non-resumably. The
automatic Home coach-mark tour is suppressed for anyone who did the tutorial
(`maybeStartTour({ suppressed: isTutorialDone() })`); its four marks still exist
and their future is undecided.

**TestFlight: build 35 is the approved state** — commit `78cf09e`, version 1.0,
Delivery UUID `ddd7954e-3dd8-45c9-8cd1-db3b7c046719`, uploaded and reviewed on a
physical iPhone. Build 34 (`a60b916`) carried the P8 bar as first drawn and its
device review produced the Cards-emphasis pass; builds 31–33 covered the
onboarding work. **Anything newer than `78cf09e` has not been on a device.**

---

## Navigation architecture — FROZEN

`docs/NAV-MODEL.md` describes what exists. It shipped; the doc is a description,
not a plan. **Do not rewrite any of this to solve a presentation problem.**

- **Reducer-owned state.** `src/navStack.js` is pure: `{activeTab, stacks,
  overlay}`. Every navigation goes through it. `VIEW_CLASS` maps each of ~28
  screens to a class (`root` / `push` / `full` / `account` / `admin`) and an
  owning tab; the class fixes tab-bar visibility, back affordance, transition,
  Android Back and swipe-back eligibility.
- **Persistent tab roots.** Four — `home`, `study`, `stories`, `practice` —
  mounted once by `TabHost.jsx` and kept. Hidden roots use `<Activity
  mode="hidden">`: state and DOM survive, effects are torn down (which is what
  stops a hidden tab fetching, timing or speaking).
- **Per-tab stacks.** Each tab has its own independent stack. Pushed screens
  live in it; fullscreen flows are presented in an `overlay` that remembers its
  `originTab` so dismissing returns where the learner actually came from.
- **History ledger.** `src/navLedger.js` stores a snapshot per `navId`. The URL
  is a *projection* of state (`urlForState`), never a competing copy. A browser
  POP adopts the stored snapshot; a missing or stale one is rebuilt
  deterministically by `stackForPath(pathname)`.
- **Android Back** is a strict ladder (`androidBack`): close sheet → dismiss
  overlay → exit an immersive flow the screen itself reports → pop → go to the
  Home tab → exit the app.
- **Fullscreen Study and Reader.** `tabBarVisible` hides the bar for every
  `full`/`admin`/`account` screen, and for Study while a card is actually on
  screen — a state only `Study.jsx` can report, via `onSessionStateChange`.
  Tapping Cards therefore enters the session directly and the bar gets out of
  the way.
- **Reselect.** `tabReselect`: dismiss an overlay → **do nothing if a flashcard
  session is in progress** → reset the stack → scroll to top. Never mints a
  history entry. (One part of this is broken — see Known backlog.)
- **Scroll restoration.** Offsets are captured per stack entry and restored with
  `window.scrollTo`; the document is the scroller, not the tab pane.
- **Activity lifecycle.** Effects re-run on every tab show, by design. Screens
  must not fight it — `dataCache` is what makes re-running free (a fresh read
  does no network work; an invalidated one keeps the old value on screen while
  the new one loads).

---

## P8 — DONE, and frozen (2026-08-11)

**TestFlight build 35, commit `78cf09e`, passed physical-device review. The
bottom navigation is finished.** No further changes to it without a concrete
usability bug found in real use — not a preference, not a better idea, a bug.

The approved design, in full, so nothing has to be inferred from the history
below:

- order **`Home · Stories · Cards · Practice · More`**; Home is the default/root
  destination and Cards is physically centred at index 2
- Cards is the primary visual action: ~27.5px glyph, the other four ~21–22px
- five custom glyphs in `NavIcons.jsx`, Cards being the portrait
  overlapping-card pair with the masked occlusion
- inactive = outline; active = filled + accent + stronger label
- Cards carries a subtle resting container and a stronger accent-tinted one when
  selected
- no numeric Cards badge · no top active marker · no floating/FAB treatment
- nav height 58px
- the level test lives on Practice
- the navigation engine is untouched

Everything below this line is the record of how it got there. The numbers still
matter — they are the reference if the bar is ever measured again — but the
decisions are closed.

---

## How P8 was resolved

**Prototype commits: `c7eb6c6`, then the Cards-emphasis pass on top of it.**

The device review of build 34 accepted the direction and rejected one thing:
Cards still did not read as the primary action, and Practice competed with it.
That turned out to be measurable rather than a matter of taste. Rasterising each
glyph and summing its alpha — ink coverage, the thing "optical weight" actually
means — the bar at `c7eb6c6` read:

| | Practice | Cards | Stories | Home | More |
|---|---|---|---|---|---|
| `c7eb6c6` | **158** | 147 | 111 | 106 | 19 |
| now | 103 | **182** | 111 | 106 | 15 |

Practice was the heaviest object on the bar, ahead of the tab the product is
about, *despite* Cards being drawn 3px larger. Size was never going to fix it.

What the pass changed, and nothing else:

- **Cards has a container** — 42×34, radius 12, icon-only, inside the bar. A
  12% accent tint with a 26% accent hairline when selected; a barely-there
  neutral at rest. No float, no notch, no circle, no glow, no gradient.

  The resting one was a flat `--surface-2` for one build and read as a *second
  selected tab* — a filled box behind a tab is Android's "you are here". It is
  `color-mix(in srgb, var(--surface-2) 55%, transparent)` now: mixing with
  transparent mixes the ALPHA, so it lands at 55% of the step it used to make,
  in both themes, from one number. Measured as composite delta against the bar's
  own ground (the bar is translucent, so this is the only number that means
  anything): **11 → 6.1 of 255 at rest, against 19 when selected.** The selected
  container is 3.1× the resting one, and only the selected one has an edge.
- **Cards' glyph is 27.5px**; the other four are 21–22.
- **The glyph was redrawn**: two PORTRAIT cards, one behind the other, and the
  occlusion is done with an SVG mask instead of by hand. The old pair were
  landscape, nearly the same size as each other, and hand-authored around a gap
  that stroke width then closed up — which is why they read as two abstract
  rounded rectangles. The mask guarantees a 1.0-unit band of background between
  the two cards in both states, and outline/filled are now the same two rects.
- **Practice was quieted** — 21px, smaller tiles (6.0), a wider gap and a
  lighter 1.65 stroke. It is a drawer; it should not out-draw the daily action.
- **More went to 20px** with its dots pulled in slightly.
- **The bar is still 58px.** The container's height is paid for out of the
  column's own budget (`navEmphasis.js`: 3.5 + 34 + 2 + 13 + 3.5 = 56 inside
  57), and `navEmphasis.test.js` fails if that ever stops being true — the
  flashcard spends every pixel the bar does not.

The numbers all live in **`src/navEmphasis.js`**, with the measurements that
chose them. `MobileNav.jsx` has no hierarchy literals left in it.

**Physical tab order — now `Home · Stories · Cards · Practice · More`.** Second
arrangement, and the one being judged on hardware. The first was
`Practice · Home · Cards · Stories · More`, which kept the daily loop contiguous
in the middle (Home → Cards → Stories) and paid for it by starting the row on
the quietest destination in the bar; the device review asked for the
alternative. Home first, Stories beside Cards, Practice demoted rightward.

**Cards stays at index 2 in both.** That is the fixed point, and
`navConfig.test.js` says so in as many words.

Home remains the default/root destination: the app launches there, `/` resolves
there, and Android Back climbs there. That it is ALSO the first column now is a
coincidence, not a connection — tab position is presentation, not routing, and
`src/navConfig.test.js` pins the two apart deliberately.

Prototype decisions, all approved:

- Cards physically centred, index 2 of five equal columns
- five custom icons in `src/NavIcons.jsx` — one family, 24×24 viewBox, shared
  stroke weight, corner-radius philosophy and filled-variant rule
- Practice = 2×2 modules (the bullseye is gone) · Home = house with a doorway ·
  Cards = two overlapping flashcards, the back one smaller · Stories = open
  book · More = horizontal dots
- Cards icon 25px, the other four 22px; all centred on one shared line
- outline inactive / filled active
- active state = filled glyph + accent + stronger label
- **no top active marker**
- **no Cards count in `MobileNav`** — the waiting number stays on Home and on
  the desktop `Sidebar` (`navBadges.js` is the single definition)
- no floating centre button, no icon container, no added animation
- nav height 58px (`src/navMetrics.js`, the one authoritative value)
- Level Test moved out of the More sheet and onto Practice
- **no navigation-engine changes**

---

## How the two open questions were answered

Both were answered on a phone, on build 35, and both are closed.

**1. The order.** Build 34 shipped `Practice · Home · Cards · Stories · More`,
which kept `Home → Cards → Stories` contiguous in the middle — the daily loop,
left to right — and paid for it by opening the row on the quietest destination in
the bar. The far-left Practice did not survive the device. Build 35 shipped the
alternative, `Home · Stories · Cards · Practice · More`, and **that is the one
that was approved.** The loop argument is on the record and lost; do not
re-derive it.

**2. The Cards emphasis.** Approved. The resting container was cut to 55% of its
first strength between builds 34 and 35 precisely because it read as a second
selected tab, and at 6.1 of 255 against 19 it no longer does.

---

## The current phase: P10 — app-wide visual system

P8 and P9 are closed. The active work is **P10: making every screen look like one
deliberately designed app**. It began with an audit rather than a redesign —
[`docs/P10-VISUAL-AUDIT.md`](P10-VISUAL-AUDIT.md), approved at `86581af` — and
its release blockers (P10-A) have shipped:

- **`263c71b`** — Settings was clipped 55px off the right edge at 320px; the
  feedback button rendered above a modal sheet and offset itself from a stale
  72px; an unrecognised curriculum enum printed itself into screen headers.
- **`795de4d`** — pinyin measured 2.62–2.95:1 in dark mode and small accent text
  2.8–3.5:1, both below AA. Two named treatments (`pinyinInk`, `inkStrong`) now
  exist and are 0% in light, so the light theme is byte-identical.

**Nothing from P10-B, C or D has been started**, and two owner decisions are
recorded for when it is: Profile's achievement wall is to be **removed** (not
replaced with any other badge/streak/XP mechanic), and sage green gets exactly
one semantic role — positive/successful/completed, behind one token — or is
removed. Coral is the one primary-action colour. See the audit's §15.

---

## Known backlog

Full list in `docs/BACKLOG.md`. Three found recently and deliberately left:

1. **Re-tapping the active tab does not scroll to the top.** `useNavigation.js`
   restores scroll with `window.scrollTo` (line 62) but `reselect`'s
   `scroll-top` branch calls `el.scrollTo()` on the `[data-tab-root]` element
   (line 163), which has no `overflow` and is not the scroller. The call is a
   no-op, so the behaviour NAV-MODEL §5.1 describes has never worked on mobile.
   One line. Left alone because reselect semantics were frozen for P8.
2. **The study shell reserves a tab bar that is not there.** While a card is on
   screen the bar is hidden but `MOBILE_SHELL_HEIGHT` still subtracts its
   height, so the bottom 58px of the most-repeated screen in the app is empty.
   Fixing it means `studyLayout` taking bar visibility as an input and
   re-checking the density bands.
3. `npm run build` emits the HQ page as the app's `index.html` under some
   conditions — long-standing, recorded, not yet diagnosed.

---

## Frozen scope under P10

P10 is a visual pass, not an architecture pass. **Superficial styling fixes to
the screens below are in scope when a P10 finding specifically calls for one; the
architecture underneath is not, and no rewrites.**

Frozen outright — approved and shipped, do not reopen:

- **P8, the bottom navigation** (see the top of this file). Its whole surface is
  `MobileNav.jsx`, `NavIcons.jsx` and `navEmphasis.js`.
- **P9, onboarding** — `Tutorial.jsx`, `tutorialScript.js`, the first-run logic.
- the navigation engine: `navStack.js`, `navLedger.js`, `useNavigation.js`,
  `TabHost.jsx`, Android Back, the navigation motion architecture.
- Study scheduling and FSRS: `srs.js`, `mastery.js`, the grading flow.
- the Stories routing architecture (three real destinations, per-tab stacks).
- the caching layer: `dataCache.js`, `cacheEvents.js`, `homeData.js`.
- the offline infrastructure: `syncQueue.js`, `prefetch.js`, `audioCache.js`.

Standing repo-wide freeze: **the two non-Chinese language tracks.** See
CLAUDE.md §1 — never propose, plan, estimate, fix or mention them.

---

## Verification state

After the Cards-emphasis pass, all run locally and green:

- `npm run lint` — **0 errors**, 7 warnings (unchanged long-standing baseline)
- `npm test` — **3,819 unit tests across 179 files**, all passing
- `npm run build` — clean
- `npx playwright test` — **368 passing, 2 failing** (the two below)
- `npm run cap:sync` — clean

The visual baseline `stories-shelf-mobile` contains the bar and was re-compared
rather than re-recorded: the icon changes are well inside the 2% diff ratio, so
it still passes. Nothing was regenerated locally.

The two Playwright failures are `visual.spec.js` → *landing, mobile* and *trust
pages: privacy, desktop*. They are **sandbox-only font-loading artifacts**, not
regressions: the CI baseline workflow (`visual-baseline.yml`) has been run and
reports the baselines unchanged. **Never regenerate visual baselines locally** —
they are CI-owned.

---

## Recent important commits

Newest first. Everything from `29e2065` down was written on
`claude/hanzi-dojo-mobile-rebuild-c1nb3u`; work continues on
`claude/hanzi-dojo-continuation-e3vnbg`, which starts from that commit:

| Commit | What it is |
|---|---|
| `78cf09e` | **Build 35 — the approved bar**: the order becomes `Home · Stories · Cards · Practice · More`, and the resting Cards container drops to 55% |
| `280dd26` | **The Cards-emphasis pass**: a container behind one glyph, the Cards card redrawn portrait with a masked occlusion, Practice and More quieted |
| `29e2065` | The session handoff, and three docs that had gone stale |
| `a60b916` | Docs brought in line with the shipped bar |
| `c7eb6c6` | **The P8 prototype**: Cards centred, five custom icons, badge and marker removed |
| `b2e644f` | Level Test moved from the More sheet onto Practice |
| `baf4bc9` | Selected-tab visibility + the 58px nav-height correction (`navMetrics.js`) |
| `6799149` | The Cards waiting count — **since removed from the bar**, `navBadges.js` survives for Home and the rail |
| `fa1a254` | The P8 bottom-nav audit and its three options |
| `574501d` | **New/review grade wording** — a first-time word is asked "How familiar was this word?", a seen word "How well did you remember it?" (`gradePrompt.js`, copy only, no scheduling change) |
| `0242c05` | **Onboarding complete**: resume, replay, tour cleanup |
| `7f3fd49` | The onboarding maze replaced by the tutorial |
| `d9f8cca` | `Tutorial.jsx` — the Mini First Session on the real card |
| `b5cbb11` | `tutorialScript.js` — the tutorial as a pure state machine |
| `a746198` | `Flashcard` and `GradeRow` extracted from `Study.jsx`, no behaviour change |

No pull request has been opened for this branch.
