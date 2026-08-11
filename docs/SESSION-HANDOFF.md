# Session handoff

**What is true as of 2026-08-11, branch `claude/hanzi-dojo-mobile-rebuild-c1nb3u`,
head `a60b916`.** Read `CLAUDE.md` first, then this. It says what the app is
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
(Delivery UUID `3ff64903-2a65-47e3-9f6d-07c9b783abeb`). It is the build carrying
the P8 navigation prototype and is the one awaiting the device verdict below.
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

**Prototype commit: `c7eb6c6`.** (`a60b916` on top of it is documentation only.)

**Physical tab order — approved: `Practice · Home · Cards · Stories · More`.**
Home remains the default/root destination: the app launches there, `/` resolves
there, and Android Back climbs there. Tab position is presentation, not routing,
and `src/navConfig.test.js` pins the two apart.

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

## Pending decision

The prototype has **not** been finally approved on hardware. Build 34 exists to
answer one question:

> Does `Practice · Home · Cards · Stories · More` feel natural with **Practice
> in the far-left position**?

The left column is where the eye starts a row and it now holds the quietest
destination. If it feels wrong on the device, **do not** switch to
`Home · Practice · Cards · Stories · More`. That separates Home from Cards and
breaks the contiguous `Home → Cards → Stories` middle loop, which is the whole
reason for the ordering. Report it and reopen the information architecture
instead.

The full device checklist is `docs/MOBILE-DEVICE-QA.md` §B2.

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

Standing repo-wide freeze: **the two non-Chinese language tracks.** See
CLAUDE.md §1 — never propose, plan, estimate, fix or mention them.

---

## Verification state

At `a60b916`, all run locally and green:

- `npm run lint` — **0 errors**, 7 warnings (unchanged long-standing baseline)
- `npm test` — **3,775 unit tests across 177 files**, all passing
- `npm run build` — clean
- `npx cap sync` — clean
- `npx playwright test` — **310 passing, 2 failing**

The two Playwright failures are `visual.spec.js` → *landing, mobile* and *trust
pages: privacy, desktop*. They are **sandbox-only font-loading artifacts**, not
regressions: the CI baseline workflow (`visual-baseline.yml`) has been run and
reports the baselines unchanged. **Never regenerate visual baselines locally** —
they are CI-owned.

---

## Recent important commits

Newest first, on `claude/hanzi-dojo-mobile-rebuild-c1nb3u`:

| Commit | What it is |
|---|---|
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
