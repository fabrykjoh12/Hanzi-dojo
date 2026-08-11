# P10 — App-wide visual system: audit and prioritised plan

**Status: audit APPROVED. P10-A is shipped; P10-B/C/D are not started.**

- audit written and approved at `86581af`
- **`263c71b`** — A1 Settings at 320, A2/A3 the feedback FAB, A7 the system label
- **`795de4d`** — A4 pinyin, A5 small accent text (plus three hardcoded
  light-mode colours found by its own assertions)
- owner decisions on the two questions this audit raised: **§15**

Everything from P10-B down is untouched and awaits its own approval.

Written 2026-08-11 on `claude/hanzi-dojo-continuation-e3vnbg` at `78cf09e` — the
commit approved on TestFlight build 35. P8 (bottom navigation) and P9
(onboarding) are complete and frozen; this is the next phase.

**The goal:** make Hanzi Dojo feel like one deliberately designed premium mobile
app on every screen. **This document does not redesign anything.** It measures
what is there, names what is inconsistent, and proposes an order of work.

---

## 0. Method, and what it can and cannot prove

Every number below was measured, not estimated.

**The instrument:** `tests/e2e/p10-visual-audit.spec.js` walks 30 learner-facing
screens and states at **320×568, 390×844 and 430×932**, in **light and dark**
(150 states), and for each one records — from computed style and layout boxes —
the type inventory, container radii and borders, button geometry, tap-target
sizes, icon sizes and stroke widths, gutters, contrast ratios, mounted
animations, backdrop-filters, heading outline, and whether content ends up under
the tab bar. It writes one JSON record per state plus a screenshot at 320 and
390. It is gated behind `P10_AUDIT=1` so it does not run in CI.

Reproduce with:

```bash
P10_AUDIT=1 P10_OUT=/tmp/p10 npx playwright test p10-visual-audit
```

**Four honest limits, so no finding here gets over-read:**

1. **Gradient backgrounds are invisible to the contrast probe.** It resolves
   `backgroundColor` only, so white text on the coral hero panel measures
   ≈1.03:1. Every hero-panel contrast reading is a **false positive** and has
   been discarded. Only flat-surface readings are cited.
2. **The E2E fixture is not production data.** No story cover art loads, several
   drills have no example sentences, and the mock track's `system` is `hsk`
   rather than `hsk_3`. Findings that depend on fixture data are labelled
   *fixture artifact* and separated from real defects.
3. **Chromium is not a phone.** `env(safe-area-inset-*)` is 0 here, so notch and
   home-indicator geometry is unverified, as are real touch latency, OLED black
   rendering and daylight legibility. Items needing a device say so.
4. **Aesthetic judgement is judgement.** Where a finding is taste rather than
   measurement it is marked *(judgement)*.

---

## 1. The strongest screens — the reference set

The design system should be extracted from these, not imported from elsewhere.

### 1.1 Study — the flashcard, front and revealed *(the single best screen)*

`Study.jsx` / `Flashcard.jsx` / `GradeRow.jsx`. What it does that nothing else
does:

- **One object, full bleed.** The card *is* the screen. No page title, no
  bordered container around a bordered container: 2 containers total, against
  Profile's 55.
- **Chrome earns its place.** Close, a segmented progress bar, three counts, an
  undo. Nothing decorative.
- **Type is a scale, not a list.** 6 styles on the front: hanzi, pinyin,
  meaning, one eyebrow, one hint, one grade label.
- **Colour means something.** The four grade colours map to four grades. They
  are the only place in the app where colour carries data honestly.
- **It reads the same at 320 and 430** — `studyLayout.js` locks a height and
  spends the difference on the character.

### 1.2 Home

One lit hero (`READY TO REVIEW / 17 cards waiting`), then flat panels in
descending importance: the story hand-off, the week, the level goal. It is the
clearest demonstration of the "one lit panel" rule in the product. Weak point:
~200px of dead space below the last panel at 390 (§6).

### 1.3 The bottom navigation

Frozen and out of scope, but it is now the app's best-argued surface and its
rules are the ones the rest of the app should adopt: sizes chosen against
measured optical weight, a single documented family, one emphasised object, and
a declared height that a test enforces.

### 1.4 Stories — the shelf hero and the % known badges

The featured hero carries title → blurb → level → action in one clear order, and
`% known` on a cover is the most product-specific, least generic component in the
app. It is the one place where the interface says something no competitor's does.

### 1.5 Session complete

Restrained, correctly ordered (result → tomorrow → the one recommended next
step → exit), and it resists the temptation to celebrate. Weak point: the CTA
truncates the story title mid-character.

**The five rules these screens follow that the weak ones do not:**

| # | Rule | Where it is broken |
|---|------|--------------------|
| R1 | One lit thing per screen; everything else flat | Profile (55 containers), Settings (33) |
| R2 | Containers only when they group something | Practice, Settings, Profile, Words |
| R3 | ≤6 type styles per screen | Profile 24, study-revealed 14, Home 12, Stories 12 |
| R4 | Colour carries data, never decoration | Words (blue/amber pills), sage green CTAs |
| R5 | The screen is the object, not a page about the object | Grammar, Writing, Known, Dictionary |

---

## 2. The weakest screens

Ranked by measured drift plus judgement.

| Rank | Screen | Type styles | Containers | Radii | Sub-44 targets | Headline problem |
|------|--------|------------:|-----------:|------:|---------------:|------------------|
| 1 | **Profile** | 24 | 55 | 7 | 117 | Reads as an analytics dashboard; the loudest object is a number |
| 2 | **Settings** | 11 | 33 | 6 | 16 | **Content clipped off-screen at 320px** (§4.1) |
| 3 | **Words** | 7 | 51 | 3 | 5 | 49 pills; pinyin at 2.95:1; two status colours borrowed from elsewhere |
| 4 | **Practice** | 9 | 12 | 3 | 0 | Six identical icon+heading+description cards; nothing to scan by |
| 5 | **The drill launch screens** (Writing, Known, Dictionary, Tones, Builder, FillBlank) | 3–8 | 2–12 | 2–3 | 0–2 | A web form, a paragraph, then half a screen of nothing |
| 6 | **YouTube** | 4 | 0 | 0 | 0 | Brand name as a title; a giant ▶ glyph as an empty state |

---

## 3. Visual-system drift — the measured inventory

This section is the core of the audit. All numbers are live-render counts across
the 150 states, cross-checked against source literals.

### 3.1 Surfaces — 17 container radii in one product

Rendered container radii, with use counts:

```
8(21) 9(20) 10(35) 11(15) 12(115) 13(75) 14(540) 15(50) 16(215) 18(115)
20(105) 22(25) 24(30) 26(10) 34(5) 50(5) 999(330)
```

Source literals agree: **21 distinct `borderRadius` values** in `src/`. `14`,
`16` and `999` carry most of the weight, so a three-step scale (plus pill) is
already latent in the code — it is simply not written down. `designTokens.js`
declares one radius (`flatPanel({ radius = 16 })`); 95 of 104 `.jsx` files never
call it.

**Borders are worse than radii.** Eight different accent-alpha border colours are
in use — `rgba(184,58,36,·)` at α = 0.094, 0.125, 0.15, 0.18, 0.19, 0.2, 0.25,
plus solid — i.e. seven near-identical values nobody can tell apart, each written
by hand. And they are **against the house rule**: CLAUDE.md §5 requires tints to
`color-mix` into the surface because an alpha hex "stays light in dark mode".

> **`accentHex + '<alpha>'` appears 139 times in `src/`.** This is the single
> largest source of dark-mode drift in the app, and it is a documented rule
> violation, not a matter of taste.

Nesting is mostly disciplined (max depth 2, on Profile/Settings/session-complete).
Blur is used **only** by the nav bar — good, and worth protecting (§10).

### 3.2 Spacing — three page gutters

Mode of the page column inset, per screen at 390:

| Gutter | Screens |
|--------|---------|
| **16px** | Home, Stories, Practice, Profile, Settings, Series, Words(also 17), Test, Grammar, Dictionary, Analyzer, Known, Languages, Writing, YouTube |
| **14px** | Study (front + revealed), Listen, Speak, Tones, Strokes, More sheet, Weak, Builder, FillBlank, session-complete |
| **17px** | Words' list rows (44 elements) |
| **24px** | Reader |

Source: `padding: '0 18px'` ×13, `'0 14px'` ×12, `'0 16px'` ×8. Two families is
defensible if it were deliberate — the immersive/full-screen flows at 14 and the
browsing screens at 16 — but nothing declares it, Words lands on 17 by accident,
and no module owns the number.

Vertical rhythm has no shared unit: section gaps measured at 10, 12, 14, 16, 18,
20, 22, 26 and 32px across screens.

### 3.3 Typography — 95 style pairs, 34 sizes, 11 weights

Rendered size/weight pairs across the app: **95 distinct**. Sizes:

```
9.5 10 10.5 11 11.5 12 12.5 13 13.5 14 14.5 15 15.5 16 17 18 19 20 21 22 23 24
25 26 28 29 32 34 38 40 44 48 54 76 112
```

Weights: `400 500 550 600 650 700 750 780 800 820 850`. Eleven weights, of which
`650`, `750`, `780`, `820` and `850` are custom values from the same face — they
are not visually distinguishable from their neighbours at 11–15px, which is where
most of them are used.

**Page titles have no rule.** Same product, same header position:

| Screen | Title size/weight |
|--------|------------------|
| Home "Today" | 19/700 |
| Settings "Settings" | 19/700 |
| Words "Your words" | 19/700 |
| Stories "Stories" | 20/700 |
| Grammar "How Chinese works" | 22/700 |
| Test "HSK 2 Test locked" | 26/800 |
| NotFound "This page wandered off" | 26/800 |
| **Languages "Your languages"** | **28/850** |
| Writing "Writing practice" | 28/800 |

Two conventions collided: `PageHeader` (19/700, used by 8 screens) and a
hero-title style (26–28/850, used by the full-screen flows). Nothing says which
applies where, so Languages — an account utility — currently has the largest
title in the app.

**Micro-labels:** `designTokens.MICRO` exists (10.5px/800/0.14em/uppercase) and is
imported by **7 files**, while **38 hand-rolled `textTransform: 'uppercase'`**
declarations exist elsewhere. Count of uppercase labels on one screen: Home 11,
More sheet 11, Practice 4, study-revealed 4.

**Tiny text:** 23 elements under 11.5px on Profile, 25 on Stories, 11 on Home.
10.5px/800 uppercase at 0.14em tracking is legible; 10.5px at weight 400 (which
occurs) is not, on a phone, outdoors.

### 3.4 Colour

- **A second brand colour exists and is undeclared.** Sage green `#6E8466` is
  redefined by hand in **8 files** (`Feedback`, `FinishOverlay`, `ErrorBoundary`,
  `Landing`, `ReaderLaunch`, `SessionRecap`, `StoryCover`, `Study`, plus
  `Dashboard`'s `#4F6047`). It is not in `index.css`, not in `languageTheme.js`,
  and not in `designTokens.js`.
- **The primary button has two colours.** The same action label, three screens:
  Stories "Start reading" = coral; Series "Start story" = coral; **Reader "Start
  reading" = sage green.** NotFound's primary and the empty-state "Exit" buttons
  are also sage. There is no rule distinguishing them *(judgement: this is the
  most visible single inconsistency in the app)*.
- **Status colours borrow other tracks' identities.** Words' "Learned" pill is
  `#3E63DD` blue and "Learning" is amber `#D97706`; the SRS "Easy" grade is the
  same blue. So blue means both *a word state* and *an SRS grade*, on screens one
  tap apart.
- **Hardcoded neutrals.** `#fff` ×116, `#FFFFFF` ×14, `#000` ×5, plus
  `rgba(24,24,27,0.05…0.18)` ×~60 for shadows and hairlines. Some `#fff` is
  legitimate (white on accent, per §5 of CLAUDE.md); the `rgba(24,24,27,·)`
  shadows are light-mode values shipping into dark mode.

### 3.5 Buttons

- **15 distinct button radii** rendered: `0 3 9 10 12 13 14 15 16 18 22 26 34 50 999`.
- **Heights cluster at 38, 40, 44, 46, 52** for real controls — three of those
  are below the 44px minimum, and the 38/40 pair is used for the most-tapped
  secondary controls in the app (filter chips, segmented options).
- Icon placement is inconsistent: `Play` before the label on Reader, `ArrowRight`
  after it on Home/Practice, `ArrowLeft` before "Back home"/"Exit", chevron-right
  at the far edge on list rows.
- The **"icon in a tinted rounded square"** motif appears on Practice, Settings,
  Profile achievements, SessionRecap and the immersive reader — five surfaces,
  one generic device *(judgement: §5.1)*.

### 3.6 Icons

- **133 distinct lucide icons** imported across `src/`.
- **16 rendered sizes**: 11, 15, 16, 17, 18, 19, 20, 21, 22, 26, 28, 30, 34, 40, 44.
- **12 stroke widths**: 1, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2, 2.1, 2.2, 2.3–3.
  Lucide's default 2 is the most common (78 uses), the nav family is 1.65–1.9,
  and 2.4 appears 38 times — three weights of "the same" icon system.
- One emoji-as-icon survives: the 🇨🇳 flag on the Languages card, against
  CLAUDE.md §2 ("never emoji-as-icon").

**Do not replace the library.** 133 icons is a lot of surface to redraw for
little return, and the nav proved custom glyphs are expensive. The finding is
about *sizes and weights*, which is a two-constant fix.

### 3.7 Motion

Genuinely good, and the smallest section here. Only **two keyframes are ever
mounted** in a settled state (`hd-flip-in` on the card, `hd-rise-in` on Home),
staggered `animationDelay` appears in just 3 files, and everything is
neutralised under `prefers-reduced-motion`.

Two blemishes: `transition: 'all 180ms ease'` ×5 (animates every property,
including layout ones), and timing units are mixed — `140ms`, `160ms`, `180ms`,
`220ms`, `.25s`, `0.2s`, `.4s`.

---

## 4. "Website in an app" remnants

Each with the specific reason it reads as web.

### 4.1 🔴 Settings' rows are clipped off the right edge at 320px

**The worst finding in the audit.** Measured: every Settings row's content column
has its right edge at **x = 375 on a 320px viewport**. Titles and descriptions are
cut mid-word ("Choose a light or dark theme for the", "Flip lets you reveal the
answer and grade your"). `overflowX` is 0, so nothing scrolls and no test caught
it — an ancestor is simply hiding 55px of every row.

**Cause:** `Card` in `Settings.jsx:444` is a flex row of a fixed 44px icon + 16px
gap + `padding: '22px 24px'`, and its text column contains a `Segmented` control
declared `display: 'inline-flex'` with `padding: '0 16px'` per option and no wrap.
The segmented control's min-content width (≈274px) becomes the column's floor, so
at 320 the column cannot shrink to fit. It is a desktop row layout that has never
been asked to be narrow.

### 4.2 Six different back controls

| Treatment | Screens |
|---|---|
| `AppBar` arrow, 44px, `aria-label="Back"` | Words, Profile, Settings, Languages, Dictionary, Analyzer, Known, Speaking, Test, Writing (10) |
| Bare arrow, no AppBar | Reader |
| "← All stories" pill | Series |
| "← Exit" pill | Listen, Builder, FillBlank, Tones |
| "← Home" pill | Grammar |
| "Back" as plain text | YouTube |

`AppBar.jsx` is a real, correct component — 44px hit area, `back`/`close` kinds,
sticky, labelled. Six screens bypass it, and "← All stories" is literally a
breadcrumb.

### 4.3 Explanatory paragraphs where an app would show the thing

Long-paragraph counts: Grammar opens with a **5-line** essay on Chinese grammar
before any interface. Settings has a 2-line intro plus a 2–3 line description
*per row*. Practice's hero spends 3 lines explaining what listening practice is.
Known has a 3-line paragraph above a raw `<textarea>`. Every drill launch screen
has a subtitle explaining the drill.

An app tells you what to tap; a web page explains itself first.

### 4.4 A raw textarea and a paste-a-list flow

Known Words asks the learner to paste an Anki or Pleco export into a
`<textarea>` with a placeholder. That is a data-import form, on a phone.

### 4.5 A horizontally scrolling rail with a cut-off item

Stories' "Top picks for you" rail leaves the third poster sliced through its
`% known` badge at 390 — the web convention of "there is more, drag it" without
the affordance a native carousel would give.

### 4.6 A configuration form as the entrance to practice

Writing opens on "Round size" (a 2×2 grid of 10/15/20/30) and "Question type"
(three radio-ish rows) before a single word is practised. Reader opens on a
"READING STYLE" Paged/Scroll segmented control.

### 4.7 The meta line exposes the schema

Screen headers render `getSystemLabel(system) · levelLabel`, producing
**"HSK 3.0 · HSK 2 · 44 words"** in production — the curriculum system, the
level, and a count, in a 10.5px uppercase row, on Words, Profile, Practice,
Stories, Listen and YouTube. It says the same thing twice and exposes an internal
distinction learners have no use for.

*(In the fixture it renders lowercase `hsk · HSK 2`, because `getSystemLabel`
returns its raw argument for unknown systems — **fixture artifact**, but the
unsafe fallback is real: an unrecognised `system` value prints straight into the
UI.)*

### 4.8 Dead space below the fold

Study-paused, Tones, Builder, FillBlank, Dictionary, Known, YouTube and NotFound
all place a small centred block at the top and leave 300–500px of empty ground
above the tab bar. On a web page that is whitespace; on a phone it reads as a
screen that failed to load.

---

## 5. Generic / template-looking UI

Strict, with the concrete visual reason each time.

### 5.1 The icon-in-a-tinted-rounded-square card, five times over

Practice's six drills, Settings' rows, Profile's eleven achievements,
SessionRecap's next-step card and the immersive reader all use: a 38–44px rounded
square filled with `accent + '10'`, a lucide icon at 1.85 stroke inside it, a
bold title, and a one-to-three-line description.

Why it reads as generated: **the container carries no information.** Every tile
has the same tint, the same radius and the same weight, so the eye cannot use
shape or colour to tell "Weak words" from "Speaking" — it has to read all six
labels. This is the default composition of every dashboard template on the
internet, and it is currently the most-repeated pattern in the app.

### 5.2 Practice is a 2×N card grid

Six equal cards below one hero, each icon+heading+description. Nothing is bigger,
nothing is dimmer, nothing is grouped. The one piece of real hierarchy — the
level test — is a *different* component (a locked row), which is right, and it
proves the grid could differentiate and does not.

### 5.3 Profile's achievements are gamification the product deliberately removed

Eleven badge cards ("First Words", "Building Up", "Century", "Sticking", "Deep
Roots", "Locked In"), 1/11 unlocked, greyed until earned, with conditions
underneath. Visually they are the definition of a template achievement grid.

More importantly: **CLAUDE.md §1 says streaks and XP were removed because they
cut against the calm promise.** A locked badge wall is the same mechanic wearing
a different coat. This is a product decision to take, not a styling one — it is
raised here because it is the largest single block on the app's third-most-visited
screen.

### 5.4 Profile's 115-cell activity heatmap

A GitHub contribution graph: 115 tappable 16×16 cells, each with an `aria-label`
("Sun, Apr 19 — no cards"), 3px radius, and a month row that pushes 11px past the
viewport at 320. It is a developer-tool visual, and it is 115 of the screen's 117
sub-44px tap targets.

### 5.5 Forty-nine pills on one screen

Words renders 49 status pills (`radius: 999`) — one per word — plus five filter
chips, also pills. Two pill scales, one screen, and the row's meaning is carried
by a colour the learner has to learn.

### 5.6 A floating action button, off-palette, over a modal

`Feedback.jsx` renders a fixed sage-green circle at `zIndex: 45`, bottom
`calc(72px + safe-area)`. Three problems, all measured:

1. It is a **FAB** — the exact treatment P8 rejected for Cards, now present on
   every screen anyway, in a colour that appears nowhere else in the layout.
2. **It renders above the More sheet** (`zIndex: 41`), i.e. above a modal dialog.
   Visible in `shots/more-sheet.390.dark.png`.
3. Its offset is a hardcoded `72px` while the nav is 58 (`navMetrics.js`) — a
   stale constant from before the P8 geometry fix.

### 5.7 A one-item menu

Tones opens on "Which drill?" with exactly one option below it.

### 5.8 A giant ▶ as an empty state

YouTube's empty state is an outsized play triangle over "No videos yet" — it
reads as a broken video player rather than as an intentional state.

### 5.9 Three framings of one gate

Test (locked) says "Master 90% of this level's words to unlock the test", then
"2 / 44" in 34px coral, then "Unlocks at 40 mastered words". Three numbers for
one rule. And the loudest control on the screen is a full-width coral **"Back
home"** — the primary treatment given to leaving.

---

## 6. Information density

| Screen | Verdict | Evidence |
|--------|---------|----------|
| Study front / revealed | **Appropriate** | 2 and 8 containers; 1.0 viewport |
| Home | **Appropriate**, sparse at the foot | 10 containers, 1.0 viewport, ~200px dead below the last panel |
| **Practice** | **Too dense in the middle, flat throughout** | 1.93 viewports, 168 elements, 12 containers — but 6 of them are the same card (§5.2). The problem is not the amount, it is that no two items differ |
| Stories | Appropriate | 2.89 viewports; the rail and the sections carry it |
| **Profile** | **Too dense** | **4.48 viewports, 452 elements, 55 containers, 24 type styles.** The most complex screen in the app is an account page |
| Settings | Too dense | 2.93 viewports, 33 containers for 8 preferences |
| Words | Appropriate for a list | 4.47 viewports but one repeating row |
| Series, Languages, Listen, Writing, session-complete | Appropriate | 1.0–1.3 viewports |
| Study-paused, Tones, Builder, FillBlank, Known, Dictionary, YouTube, NotFound | **Too sparse** | 1.0 viewport, 10–24 elements, 300–500px empty |

**On Practice specifically** (the screen the brief singled out): the hierarchy is
hero → locked test row → "MORE DRILLS" → six identical cards. Scanning fails at
the six cards, not before. The fix direction is differentiation (size, grouping,
or a list instead of a grid) — not fewer drills, and not this audit's job.

---

## 7. Design tokens — what already works, and what bypasses it

**What functions as a design system today:**

| Asset | Quality | Adoption |
|---|---|---|
| `index.css` semantic tokens (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--shadow-1/2`, `--hairline`) | **Good** — complete, themed, dark values properly re-declared | Wide, and mostly correct |
| `languageTheme.js` + `ink()` | **Good** — the accent-as-ink rule is real and tested | Used, but `ink()` is skipped in many small-text cases (§9) |
| `designTokens.js` (`MICRO`, `NUM`, `heroGround`, `heroShadow`, `flatPanel`, `ON_HERO`) | **Good, and under-used** | `panels.jsx` + 7 files |
| `panels.jsx` (`HeroPanel`, `Panel`, `PageHeader`, `Readout`, `Eyebrow`, `HeroAction`) | **Good** — this is the system | **9 of 104 `.jsx` files** |
| `AppBar.jsx` | **Good** — correct hit area, both kinds | 11 screens; 6 bypass it |
| `navMetrics.js` / `navEmphasis.js` | **Excellent** — declared, tested, documented | The nav only |
| `studyLayout.js` | **Excellent** — density bands, locked height | Study only |

**What is missing, and is the reason drift keeps happening:** there is no token
for **radius**, **spacing**, **type scale**, **button style**, or **the sage
green**. Those five gaps account for almost every number in §3.

**Where screens bypass the system:** 95 files style panels by hand; 38 hand-rolled
uppercase labels; 139 hand-built accent tints; 8 hand-declared sage greens; 21
radius literals; 34 font sizes.

**Deliberately not proposed here:** a broad token refactor. The right move is to
*declare* the five missing scales, adopt them screen-by-screen as each screen is
touched, and let the old literals die where they are. A sweeping find-and-replace
across 104 files is exactly the kind of change that cannot be reviewed.

---

## 8. Accessibility

Separating real defects from preference.

### 8.1 Real defects

1. **Pinyin fails AA in dark mode, everywhere it appears.** Measured 2.62:1
   (Profile, 12px/600), 2.95:1 (Words 13px/600; study-revealed 21px/650; Speak
   16px/600). Pinyin is the most-read secondary text in a Chinese learning app.
2. **Accent-coloured small text fails AA in dark mode, systemically.** 2.8–3.3:1
   across ≥12 screens: "Recommended next" (2.95), "Replay" (2.83), "Join our
   Discord" (2.83), "Active" (2.82), "Mixed" (2.83), "Paged" (2.95), "Language
   tracks" (3.3), "Listening" (3.3), "Tone practice" (3.3), "Check this list"
   (2.95), "Log out" (3.49). One cause: `ink()`'s dark-mode lift (`30%` toward
   white) is not enough at ≤15px.
3. **Test's headline number "2 / 44" is 2.95:1** at 34px/850 — below even the 3:1
   large-text bar, and it is the screen's whole point.
4. **Light-mode grade buttons**: "Hard" 3.51:1, interval labels 4.05–4.13:1.
5. **Words' status pills**: "Learning" 2.93:1, "New" 4.38:1.
6. **Settings' segmented labels** 4.4:1 — marginal, and they are choices.
7. **Sub-44px controls that matter**: filter chips 38px (Words ×5, Dictionary ×2),
   segmented options 38–40px (Settings ×7, Reader ×2, Writing), the Settings
   toggle 50×28, Profile's 115 heatmap cells 16×16.
8. **Writing's round-size options (10/15/20/30) render at low contrast**, so the
   available choices read as disabled.
9. **Three unlabelled interactive elements** on Settings, one on Profile — no
   text, no `aria-label`.
10. **Heading outline is flat.** Every screen has exactly one `h1` and no `h2`+:
    Profile's 452 elements, 55 containers and ~8 sections are a single heading
    level, so a screen-reader user gets no structure to navigate.
11. **Colour-only meaning**: Words' status is carried by pill colour + a word;
    Home's week strip and Profile's heatmap by fill alone.

### 8.2 Not defects (preference, or correct as-is)

- The hero panels' white-on-coral is fine; the 1.03:1 readings are the probe's
  gradient blind spot.
- Home's 112px `中` watermark at 1.0–1.25:1 is decorative by design.
- 10.5px/800 uppercase micro-labels at 0.14em are legible; they are a house
  convention, not a defect. (10.5px at weight 400 is a different matter.)
- Reduced motion is correctly honoured throughout — no finding.

---

## 9. Performance implications

The app is currently **cheap to render**, and that must survive P10.

- **Backdrop blur is used exactly once** (the nav bar). Do not add more: blur is
  the most expensive effect in a WKWebView and the one most likely to cost frames
  on an older iPhone. Any proposal involving frosted panels should be rejected.
- **Mounted animations: 2 keyframes** in a settled state. Staggered entrances
  exist in 3 files only. Keep it.
- **`transition: 'all 180ms ease'` ×5** — animates layout properties. Cheap fix,
  real jank risk.
- **Images**: story covers are the only large assets; the reader header reserves a
  ~300px block with no fallback treatment when a cover is missing (a real robustness
  gap, visible in the fixture).
- **Profile mounts 452 elements** including 115 interactive heatmap cells. That is
  the one screen where a visual simplification would also be a performance win.
- Any recommendation below that would add blur, large images, many mounted
  effects, or layout-animating transitions is flagged in its row.

---

## 10. The prioritised P10 backlog

Risk = chance of breaking something. Scope = Tiny (<1h) / Small (a few hours) /
Medium (a day) / Large (multi-day). **Device** = needs physical validation.

### P10-A — Release blockers — ✅ ALL SHIPPED

Things that make the app look broken or unfinished. **Done in commits
`263c71b` (A1/A2/A3/A7) and `795de4d` (A4/A5)**, verified at 320/390/430 in both
themes. Two owner decisions were taken alongside them and are recorded in §15.

| # | Screen/component | Problem | Evidence | Recommended change | Risk | Scope | Device |
|---|---|---|---|---|---|---|---|
| A1 | `Settings.jsx` `Card` + `Segmented` | Row content clipped 55px off-screen at 320 | measured right edge 375 vs vw 320; text cut mid-word | Let `Segmented` wrap (or scroll) below ~360px; reduce option padding at that width | Low | Small | ✓ | ✅
| A2 | `Feedback.jsx` | FAB renders above the More sheet modal | FAB z 45 vs sheet z 41; visible in `shots/more-sheet.390.dark.png` | Raise the sheet above the FAB, or hide the FAB while any sheet/overlay is open | Low | Tiny | — | ✅
| A3 | `Feedback.jsx` | FAB offset hardcoded 72px; nav is 58 | `bottom: calc(72px + …)` vs `MOBILE_NAV_HEIGHT` | Derive from `navMetrics` | Low | Tiny | — | ✅
| A4 | Pinyin, all screens | Fails AA in dark (2.62–2.95:1) | §8.1.1 | Lift pinyin's dark-mode colour to ≥4.5:1 (one shared token, not per screen) | Low | Small | ✓ | ✅
| A5 | Accent small text, ≥12 screens | Fails AA in dark (2.8–3.3:1) | §8.1.2 | Raise `--ink-lift-pct` for small text, or a second `inkStrong()` for ≤15px | Medium | Small | ✓ | ✅
| A6 | `Test.jsx` | Three framings of one gate; primary button is "Back home" | §5.9 | One sentence, one number; demote "Back home" to secondary | Low | Small | — | ⏳ not started (not a defect — deferred with B)
| A7 | `utils.js getSystemLabel` | Unknown `system` prints raw DB value into the UI | fixture renders `hsk` | Fall back to `''`/the level label alone | Low | Tiny | — | ✅

### P10-B — High-impact polish

Materially raises perceived quality.

| # | Screen/component | Problem | Evidence | Recommended change | Risk | Scope | Device |
|---|---|---|---|---|---|---|---|
| B1 | Primary buttons, app-wide | Two primary colours; "Start reading" is coral on one screen and sage on the next | §3.4 | Declare one primary (coral). Sage becomes a *token* with a stated job or goes | Low | Small | ✓ |
| B2 | `Profile.jsx` | Reads as a dashboard: 55 containers, 24 type styles, 4.5 viewports | §2, §6 | Collapse to: identity, two numbers, the week, one link out. Achievements decision → B3 | Medium | Medium | ✓ |
| B3 | Profile achievements | Badge wall contradicts the no-gamification promise (CLAUDE.md §1) | §5.3 | **Owner decision**: keep, soften, or remove. Not a styling call | Low | Small | — |
| B4 | Profile heatmap | 115 tappable 16px cells; a dev-tool visual | §5.4 | Make it presentational with one summary label, or drop to a 7-day strip like Home's | Low | Small | — |
| B5 | `Practice.jsx` | Six identical cards; nothing to scan by | §5.2, §6 | Differentiate: one recommended drill, the rest a compact list | Medium | Medium | ✓ |
| B6 | Back controls | Six treatments | §4.2 | Adopt `AppBar` on Reader, Series, Listen, Grammar, YouTube, Builder, FillBlank, Tones | Low | Small | — |
| B7 | Page titles | 19→28px with no rule | §3.3 | Two declared roles: page title (19/700) and flow title (26/800). Assign each screen | Low | Small | — |
| B8 | `Words.jsx` | 49 pills; status by colour alone | §5.5, §8.1.11 | Status as text weight/position, not a pill per row | Low | Small | — |
| B9 | Empty/sparse screens | 300–500px of dead ground | §4.8 | Centre the block in the available height; give each a next action | Low | Small | — |
| B10 | `YouTube.jsx` | Brand name as title; ▶ empty state | §5.8 | Rename to the learner-facing feature; replace the glyph | Low | Tiny | — |
| B11 | Explanatory paragraphs | Grammar 5 lines, Settings per-row, Practice hero | §4.3 | Cut to one line each; move the rest behind the thing it describes | Low | Small | — |
| B12 | `Languages.jsx` | 🇨🇳 emoji-as-icon (CLAUDE.md §2) | §3.6 | Replace with the drawn language mark already in `languageTheme` | Low | Tiny | — |

### P10-C — Consistency cleanup (reduces future drift)

| # | Component | Problem | Evidence | Recommended change | Risk | Scope | Device |
|---|---|---|---|---|---|---|---|
| C1 | New `radii` token | 17 rendered radii, 21 literals | §3.1 | Declare 4 steps (10/14/20/pill) + adopt as screens are touched | Low | Small | — |
| C2 | New `space` token | 3 gutters, 9 section gaps | §3.2 | Declare the gutter pair (14 immersive / 16 browsing) and a 4px-based rhythm | Low | Small | — |
| C3 | New `type` scale | 95 pairs, 34 sizes, 11 weights | §3.3 | Declare ~8 roles; forbid new weights between 600 and 850 | Low | Medium | — |
| C4 | `accentHex + 'NN'` → `color-mix` | 139 rule violations; the main dark-mode drift | §3.1 | A `tint(accent, pct)` helper; migrate per screen, never in one sweep | Medium | Medium | ✓ |
| C5 | Sage green | 8 hand-declared copies | §3.4 | One token, or delete it in favour of the accent | Low | Small | — |
| C6 | Button component | 15 radii, heights 38–52, mixed icon sides | §3.5 | One `Button` with primary/secondary/quiet + a 44px floor | Medium | Medium | ✓ |
| C7 | Icon constants | 16 sizes, 12 stroke widths | §3.6 | Two constants (`ICON`, `ICON_SM`) + one stroke; do **not** replace lucide | Low | Small | — |
| C8 | Heading levels | Every screen is one `h1`, no `h2` | §8.1.10 | Real `h2`s on the sectioned screens | Low | Small | — |
| C9 | `rgba(24,24,27,·)` shadows | Light-mode values in dark mode | §3.4 | Use `--shadow-1/2` | Low | Small | — |
| C10 | `transition: all` ×5 | Animates layout properties | §3.7 | Name the properties | Low | Tiny | — |

### P10-D — Optional refinements

| # | Item | Note | Risk | Scope |
|---|---|---|---|---|
| D1 | Stories rail cut-off item | Snap points or a peek affordance | Low | Small |
| D2 | Reader cover fallback | ~300px block with no missing-image treatment | Low | Small |
| D3 | Known Words textarea | A phone-native import flow | Medium | Medium |
| D4 | Tones one-item menu | Skip the chooser until there are two | Low | Tiny |
| D5 | Writing/Reader config-first entry | Sensible defaults, settings behind the drill | Medium | Medium |
| D6 | Meta line "HSK 3.0 · HSK 2" | Say the level once | Low | Tiny |
| D7 | Home's foot | ~200px dead space at 390 | Low | Small |
| D8 | Session-complete CTA truncation | Story title cut mid-character | Low | Tiny |
| D9 | Timing units | 140/160/180/220ms + `.2s`/`.25s`/`.4s` | Low | Tiny |
| D10 | Micro-label audit | 38 hand-rolled uppercase → `MICRO` | Low | Small |

---

## 11. The top ten, ranked by product-quality return

Ranked on visibility × frequency × first impression × professionalism ×
usability, then discounted by risk. Not by ease.

| # | Change | Why it ranks here |
|---|--------|-------------------|
| **1** | **A1 — fix Settings' 320px clipping** | The only finding where the app is measurably *broken*. Text cut mid-word on a supported phone size reads as unfinished, and 320 is in the device-QA matrix |
| **2** | **A4 + A5 — pinyin and accent small text to AA in dark** | Affects the most-read text in the product, on every screen, for every learner using dark mode. One shared fix, and it is legibility, not taste |
| **3** | **B1 — one primary button colour** | Two colours for "Start reading" one tap apart is the most visible single inconsistency; a learner cannot learn what green means because it means nothing |
| **4** | **B2 + B4 — Profile stops being a dashboard** | Third-most-visited screen, 4.5 viewports, 452 elements, 24 type styles, 117 sub-44 targets. The largest gap between any screen and Study |
| **5** | **A2 + A3 — the FAB stops floating over modals** | A button rendering above a modal dialog is a defect, not polish; and it is the one element P8 explicitly rejected, present on every screen |
| **6** | **B5 — Practice gains hierarchy** | The drawer of everything the app can do; six identical cards make its breadth look like a template rather than a product |
| **7** | **B7 + B6 — one title rule, one back control** | Two small rules that touch nearly every screen; the cheapest possible "one product" signal |
| **8** | **C1 + C2 + C3 — declare radius, spacing and type** | Nothing else on this list stays fixed without them. Ranked below the visible items because it is invisible on its own |
| **9** | **B9 + B11 — kill the dead ground and the paragraphs** | Eight screens currently look like they failed to load; the copy cuts are the fastest way to stop reading as a web page |
| **10** | **B3 — the achievements decision** | Ranked last of the ten because it is the owner's call, not an implementation, but it is on the list because it contradicts a stated product promise in shipping code |

Deliberately *not* in the top ten: C4 (the 139 alpha tints) — highest total
volume, but it is a per-screen migration whose benefit only shows up as other
work lands; and C6 (the button component), which should follow B1's decision
rather than lead it.

---

## 12. Proposed implementation sequence

Small, revertable, individually verifiable commits. Each one ends with lint +
unit + Playwright green and a before/after render at 320/390 in both themes.

| Commit | Content | Why here | Verify |
|---|---|---|---|
| **1. The three broken things** | A1, A2, A3, A7 | Defects, not design. Nothing else should ship before them | 320 render; `more-sheet` z-order; a spec that fails if any row's box exceeds the viewport |
| **2. Legibility** | A4, A5 | One shared colour decision, app-wide, no layout change | A contrast spec over the audit's screen list, asserting ≥4.5:1 on flat surfaces |
| **3. Declare the scales** | C1, C2, C3, C5, C7 | Tokens only — no screen changes yet, so it is reviewable on its own | Unit tests on the token modules; zero visual diff expected |
| **4. One primary button** | B1, then C6 | Needs commit 3's tokens; unblocks every later screen | Visual diff on Reader, NotFound, the empty states |
| **5. One header, one title** | B6, B7, C8 | Touches many screens shallowly; best done before the deep screen work | AppBar adoption spec; heading-outline spec |
| **6. Profile** | B2, B4, (B3 if decided) | The biggest single-screen win; isolated | Before/after; element count should fall by >50% |
| **7. Practice** | B5 | Independent of Profile | Before/after at 3 widths |
| **8. Words + Stories polish** | B8, D1, D8 | Lower risk, high frequency | Visual diff |
| **9. Empty states and copy** | B9, B10, B11, B12, D4, D7 | Many tiny edits, one theme | Before/after on the eight sparse screens |
| **10. Drift cleanup** | C4, C9, C10, D6, D9, D10 | Last, per screen already touched | No visual diff expected; spec that new `accentHex + 'NN'` cannot be added |

**Commits 1 and 2 should ship before the next TestFlight build.** Everything from
3 onward can go out in a later build.

---

## 13. What must be fixed before the next TestFlight build — ✅ DONE

**Shipped in `263c71b` + `795de4d`.** Measured outcomes:

| Item | Before | After |
|---|---|---|
| A1 Settings at 320 | content column right edge **375px** on a 320 viewport, text cut mid-word | every meaningful rect inside the viewport at 320/390/430, both themes; segmented options ≥44px |
| A2 FAB vs the More sheet | rendered at z-45 **above** the z-41 dialog | not rendered while any sheet is open; a spec asserts nothing fixed outranks the dialog |
| A3 FAB offset | hardcoded `72px` | `MOBILE_NAV_HEIGHT + 14`, asserted at three widths |
| A4 pinyin, dark | 2.62–2.95:1 | **5.1–6.0:1** |
| A5 small accent text, dark | 2.82–3.49:1 | **≥4.5:1**, or muted where the accent was decoration |
| A7 unknown system | prints the raw enum (`hsk · HSK 2`) | `''` + a `metaLine()` composer; no dangling separators |

Three hardcoded light-mode colours found by the new assertions and fixed in
passing (all byte-identical in light, all previously wrong in dark): the More
sheet's "Log out" 3.49:1, Profile's five destructive labels 2.84–3.49:1, and
Words' "New" pill 3.22:1.

### Still below AA, deliberately deferred — with numbers

Printed by `tests/e2e/contrast-legibility.spec.js` on every run:

- status colours: "Learned" blue **3.02:1**, "Learning"/"missed N×" amber
  **2.57–4.02:1**, "Review weak words" **3.05:1** → B8 + a palette decision
- grade colours: "Hard" **3.51:1**, "Good" **4.4:1** (light) → Study's design
- `--text-muted` in light on `--surface-2`: **4.4:1** vs 4.5 — the token's own
  2% miss, on achievement titles, "REVIEW", interval hints, recap stats
- `--danger` in light on `--danger-bg`: **4.41:1** — pre-existing; dark was the
  failing side and is fixed

The last two are one global token change each, with app-wide reach and a device
round of their own.

---

## 13b. The original list, for the record

- **A1** — Settings clipped at 320 (broken)
- **A2, A3** — the FAB above modals, and its stale offset
- **A4, A5** — pinyin and accent small text to AA in dark mode
- **A7** — the raw `system` fallback

Rationale: these are the four things a tester can *catch you out on*. Everything
else is quality, and quality can iterate across builds.

## 14. What can wait until after release

- All of P10-C except C5 (the sage token, which B1 needs)
- B2/B4/B5 (Profile, Practice) — high value, but they are redesigns and each
  wants its own device round
- B3 — an owner product decision with no deadline
- All of P10-D
- Any icon work beyond C7's two constants

---

## Appendix — where the evidence lives

- **Probe:** `tests/e2e/p10-visual-audit.spec.js` (gated on `P10_AUDIT=1`)
- **Records:** `<P10_OUT>/<screen>.<width>.<theme>.json` — 150 files
- **Screenshots:** `<P10_OUT>/shots/` — 120 files at 320 and 390, both themes
- **Not committed:** the JSON and PNGs are regenerable in ~4 minutes and would
  add ~40MB to the repo. Re-run the probe rather than trusting a stale copy.


---

## 15. Owner decisions taken (2026-08-11)

Both were asked for by this audit and are now settled. **Neither is implemented
yet** — they are constraints on the work when it happens.

### Profile achievements — REMOVE

When the Profile redesign happens (B2), the achievement/badge wall goes. It is
not to be replaced by streaks, XP, trophies, another badge grid, or locked
achievement cards. Hanzi Dojo communicates real learning progress, not
gamification pressure.

What may remain: words learned, words mastered, current HSK level, recent
activity.

### Sage green — ONE semantic role, or gone

**Coral is the one primary-action colour.** Sage green is not a second brand or
CTA colour. If it survives at all it has exactly one declared role —
**positive / successful / completed** — behind one token.

It must not be used for: "Start reading", primary navigation, primary CTAs,
arbitrary empty-state buttons, or generic emphasis.

At B1/C5, migrate the inappropriate uses to coral or to semantic neutrals. **If
there are too few legitimate semantic-success uses to justify the colour, remove
it rather than inventing a role for it.** The audit found 8 hand-declared copies
and no legitimate success semantics among them — the Reader's "Start reading",
NotFound's CTA, the empty-state "Exit" buttons and the feedback FAB are all
primary or navigational, so the likely outcome is removal.
