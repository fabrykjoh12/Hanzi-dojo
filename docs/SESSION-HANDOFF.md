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

**TestFlight: build 34**, commit `a60b916`, version 1.0, uploaded successfully
(Delivery UUID `3ff64903-2a65-47e3-9f6d-07c9b783abeb`). It carried the P8
navigation prototype as first drawn; its device review is what produced the
Cards-emphasis pass below, so **build 34 no longer matches `main`-of-this-branch
and a new build is needed before the remaining questions can be answered.**
Builds 31–33 covered the onboarding work and the earlier P8 pass.

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

## Current P8 status

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

## Pending decisions

The prototype has **not** been finally approved on hardware. Two questions are
open, and the next build exists to answer them.

**1. The order — a straight A/B against build 34.** Build 34 shipped
`Practice · Home · Cards · Stories · More` and the far-left Practice did not
survive the device. The next build ships the alternative:

> Does `Home · Stories · Cards · Practice · More` feel more natural in the hand
> than what build 34 had?

What each arrangement is buying: the old one kept `Home → Cards → Stories`
contiguous in the middle — the daily loop, left to right — at the cost of
opening the row on a drawer. The new one starts where the eye starts and where
the app opens, puts the two things a learner does with the language either side
of centre, and demotes Practice to the right. **Judge them physically; do not
re-derive the loop argument and revert.** Cards is at index 2 in both, so the
comparison is only about what surrounds it.

If the new order also feels wrong, that is the signal to reopen the information
architecture rather than to try a third permutation.

**2. The Cards emphasis**, new in this pass:

> Does the eye immediately understand that Cards is the core action, while it
> still clearly belongs to the navigation bar?

And the specific risk it introduced: **at rest, Cards has a container and no
other tab does, and a box behind a tab is Android's convention for *selected*.**
That was reported on the first build of it and the resting container has already
been cut to 55% in response. It is now four signals apart from selection — the
selected glyph fills, its label goes bold, its container takes the accent and
gains an edge — but "meant to" is not the same as "does". If Cards can still be
mistaken for the selected tab, say so; the same one line goes lower again.

The full device checklist is `docs/MOBILE-DEVICE-QA.md` §B2, which now runs to
thirteen questions in priority order.

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

## Frozen scope while P8 is being resolved

Do not touch: the navigation engine (everything under "Navigation architecture"
above), onboarding/P9, Study and FSRS scheduling, the flashcard design, the
Practice screen's design (the Level Test row is done), the Stories screen and
reader, Home's layout, the caching layer, the shell architecture, animations
outside `MobileNav.jsx`, and the typography system.

P8's whole surface is three files — `MobileNav.jsx`, `NavIcons.jsx` and
`navEmphasis.js`. If a change to the bar needs a fourth, it is not a P8 change.

Standing repo-wide freeze: **the two non-Chinese language tracks.** See
CLAUDE.md §1 — never propose, plan, estimate, fix or mention them.

---

## Verification state

After the Cards-emphasis pass, all run locally and green:

- `npm run lint` — **0 errors**, 7 warnings (unchanged long-standing baseline)
- `npm test` — **3,790 unit tests across 178 files**, all passing
- `npm run build` — clean
- `npx playwright test` — **318 passing, 2 failing** (the two below)

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
| *(head)* | **The Cards-emphasis pass**: a container behind one glyph, the Cards card redrawn portrait with a masked occlusion, Practice and More quieted |
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
