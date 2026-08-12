# P13 — Visual direction audit and design system

**Status: audit and direction only, revision 2. No CSS, no tokens, no
components implemented.** Written against
`claude/hanzi-dojo-continuation-e3vnbg` @ `6e41202`.

**Revision 2 (2026-08-12)** — the five HelloChinese screenshots arrived, so §1
is now an analysis of what is actually on screen rather than of my recollection.
And the brand direction is corrected: **Hanzi Dojo stays vermilion-led.** The
jade-primary proposal in revision 1 is withdrawn. What survives from revision 1
unchanged is the measured census (§2) and the structural findings, which are
approved: 60 type styles, 16 radii, 13 shadow declarations, 94 hardcoded hexes,
77 lucide icons against 5 custom, the `--text-faint` inversion, the misleading
`--hairline`, and the shared-component direction.

Every number in §2 was **measured**: a DOM census over eleven real screens at
390×844, counting computed type styles, radii, shadows, painted surfaces and
SVGs. Where something could not be measured, this document says so.

---

## 0 · Two honesty notes

**1. Our Stories renders show the fallback, not production.** The e2e fixture
sets `image_path: null` on every story, so the shelf in my captures is
`StoryCover`'s gradient placeholder. In the live database **204 of 204 published
Chinese stories have cover art**, and I verified the real art separately
(`public/story-covers/generated/`). This matters most in §13, where the Stories
plan depends on art that exists.

**2. Dark mode is audited from tokens, not from a render sweep.** My dark harness
set `data-theme` before the app read the profile's own theme, so the app
overrode it and the "dark" captures came back light. Dark findings below are read
from `src/index.css` and from the genuinely-dark captures made during P11/P12.
**A full dark sweep is a prerequisite for P14-0**, because §5 makes dark
mode carry real design weight rather than being an inversion.

---

## 1 · HelloChinese, from the screenshots

Five screens: Learn, Practice, Immerse (lessons), Stories, Me. All captured in
dark mode, which is itself informative — the app is clearly *designed* dark, not
merely inverted.

### 1.0 What is true across all five screens

These are the transferable principles, and they are more useful than any single
screen:

**A. Dark means near-black, and accents get *more* saturated, not less.** The
grounds are near-black (the Learn screen's is warm, with a plum cast; the others
are close to neutral `#0B0B0C`). Against that, accents run at full chroma —
magenta, gold, mint, purple. Nothing is greyed out to be polite. This is the
opposite of our dark mode, which lowers everything toward `#0F1115` greys.

**B. Surfaces are flat and uniform; icons carry all the colour and dimension.**
Every row on Practice is the same dark rounded rectangle. What distinguishes
"EarBuds" from "Native speaker videos" is a dimensional orange headphone versus a
dimensional purple video tile. **This is the single most important observation in
the whole audit**: it is why the app can have dozens of rounded surfaces and not
feel like "cards everywhere", and it is exactly inverted in our app, where the
surfaces do the work and 77 identical line glyphs sit on them.

**C. Section titles are large, heavy, white — and carry a faint coloured glow.**
"Specialized Courses", "Drills", "Your collections", "Statistics", "Skill
medals", "Continue reading", "Start here" are all ~22–24px, weight ~800, pure
white, with a small soft coloured halo at the left edge of the first glyph. It
gives a heading presence and hierarchy **without wrapping the section in a
container**. This is a real technique and we should take a restrained version.

**D. Locked and empty states are desaturated versions of the same shape.** The
future path nodes are grey spheres with the same gloss and the same glyph as the
active one. The unearned skill medals are grey silhouettes of medals. The empty
collections keep their icon but their *label* goes grey. State is legible without
reading a word, and it never changes the shape.

**E. Gold means reward, everywhere, without exception.** Coins, the premium
banner, the `0/5` lesson-progress pill, the lesson chevron button, the crown on a
locked drill, the `1 TOP` ribbon. One colour, one meaning, used often enough to
be a language.

**F. Exactly one loud object per screen.** The magenta path node. The two bright
course cards. The photographic hero. The green series panel. The gold premium
banner. Everything else on each screen is dark and quiet by comparison.

**G. Each destination owns a hue, and the nav's active state adopts it.** Learn is
purple, Practice gold, Stories blue, Immerse magenta, Me green. **This is the one
cross-cutting system I recommend we do NOT adopt wholesale** — see §1.6.

---

### 1.1 Learn / progression

**What is on screen.** A top utility row of dark pills (level book, iridescent
crown, gem counter `0`, coin counter `100`). A cartoon grandpa mascot. A plum
banner reading "Making new friends!" in bright magenta bold, with a small `1`
tab hanging beneath it like a bookmark. Then the path: one **active node** — a
saturated magenta sphere with a specular highlight arc top-left, a graduation-cap
glyph, sitting inside a concentric plum ring — and below it three **inactive
nodes**, identical in construction but grey. A thin dark curve connects them.

**Borrow:**
- **The active node's construction.** It is a sphere: base colour, a darker
  bottom-right, a bright specular arc top-left, and a ring around it that reads
  as a socket. That is four tones doing an enormous amount of work at ~90px, and
  the same construction reads fine at 32px. It is the model for our dimensional
  icon language (§10).
- **The concentric ring as "you are here."** The active node is not just
  brighter, it is *seated in something*. Cheap, and unmistakable.
- **The glow.** The active node has a soft magenta bloom on the ground around it.
  Used once per screen this is not decoration, it is a pointer.
- **Grey-of-the-same-shape for not-yet.** See 1.0-D.
- **Dark-mode contrast discipline.** Magenta on near-black is roughly 5:1; the
  grey nodes sit at roughly 2:1 against the ground and are *supposed* to.

**Do not copy:**
- **The mascot.** No character, no guide, no face. This is the single clearest
  line between "energetic and adult" and "childish", and our copy voice (calm,
  observational, no guilt) would fight a cartoon narrator.
- **The lesson path itself.** Nodes, a spine, a linear unlock order — that is a
  *product* structure and we do not have it. Our progression is FSRS stability
  and a level test. **PRODUCT CHANGE, out of scope.**
- **Coins, gems, the crown economy, the `0/1` bag.** Currencies. CLAUDE.md §1
  removed streaks and XP on purpose.
- **The magenta.** Their hue.
- **The bookmark-tab banner.** A nice detail, but it is a lesson-title device for
  a structure we do not have.

---

### 1.2 Practice

**What is on screen.** Three sections. "Specialized Courses" — two saturated
cards, magenta "Pronunciation" and green "Chinese Characters", each carrying a
large translucent character watermark (`ā`, `文`) and a soft organic blob shape.
"Drills" — dark uniform rows, each led by a dimensional coloured icon (orange
headphones, purple video tile), white label, gold crown on the premium one.
"Your collections" — same rows, gold star and green bell icons, but the labels
("Starred", "Words") are **grey** because the collections are empty, with a right-
aligned `0`.

**Borrow:**
- **Uniform rows + dimensional icons.** Our Practice already has exactly this
  structure (P11: one panel, rows, an icon, a title, an optional count). Swapping
  32 lucide strokes for dimensional icons would transform the screen without
  moving one row. **This is the highest-leverage single change in the app.**
- **The large translucent character watermark** inside a coloured card. We already
  do this on the Home hero (田 at 9% white) — but at 9% it is invisible. Theirs is
  at roughly 25–30% of the card colour and it *reads*. Ours should be stronger.
- **Empty state = grey label, icon retained, count shown.** Better than hiding the
  row or showing prose.
- **Two-tone icon construction.** The headphones are one orange plus one darker
  orange, and that is all. Not a 3D render.

**Do not copy:**
- **The two saturated course cards as a pattern.** Two big bright blocks side by
  side is a *catalogue* device. Our Practice hero already picks one
  recommendation, which is a better answer for us and device-approved.
- **The crown / premium gating.** We are free.
- **Their green.**
- **Their exact card compositions** — the blob shapes are a house mannerism.

---

### 1.3 Immerse / lessons

**What is on screen.** A text tab row (Lessons · Starred · Review) with a short
green underline under the active tab. Two dark filter chips with small colourful
dimensional icons. "Free lessons" with a green `MORE ›`. Lesson cards: a
**photograph** occupying the top ~55%, then a dark body with a white title, a gold
`0/5` pill and a gold circular chevron. Then a large photographic hero with big
white text over it. A purple promo banner overlays the bottom.

**Borrow:**
- **Imagery at real scale.** The photo is not a thumbnail; it is most of the card.
  We have 204 real painterly covers and we currently show them at 56px on Home and
  crop them 16:9→2:3 on the shelf. **This screen is the argument for giving our art
  room.**
- **The gold progress pill on the card.** Small, unmissable, one colour, states
  progress without a bar.
- **One circular affordance per card.** The gold chevron says "this is the tap"
  without a full-width button.
- **Text tabs with a short coloured underline** — cheaper and cleaner than our
  auth screen's full-width underlined tabs.

**Do not copy:**
- **Photography.** Stock photos of KFC and coffee cups are a content strategy, and
  ours is better: consistent commissioned illustration in one style. Photography
  would destroy that coherence.
- **The overlaying purple promo banner.** It covers content and it is an upsell.
- **`0/5` as a mechanic** — that is lesson-completion counting, which we do not have.

---

### 1.4 Stories

**What is on screen.** Home / My Space text tabs, a search icon, a Filter chip.
"Continue reading" — a horizontal row with a small square cover, a title, a green
dot + `HSK1` chip, and a blue layered badge on the thumbnail corner. "Start here" —
a **large dark-green panel** holding a whole series: big white title "Mysterious
School", an `HSK1` chip, a purple-and-gold `1 TOP` ribbon, a school-building
silhouette as the panel's own atmosphere, and inside it a horizontal row of
**portrait season covers** — bold two-colour posters (red/black, gold/black,
purple/black) with vertical Chinese titles.

**Borrow — this is the most valuable screenshot of the five:**
- **A tinted panel with its own atmosphere as the grouping device.** The series
  gets a dark-green ground and a building silhouette, so it reads as *a world*
  rather than as a section of a list. That is how to differentiate our four shelf
  sections without four more grey cards. It is also exactly what our existing
  `inkWash.js` machinery was built for.
- **Bold, high-contrast, limited-palette cover art, portrait-native.** Two colours
  and a silhouette. It reads at thumbnail size, it reads in a row, and each series
  owns a colour. Our art is more detailed and more beautiful, and it is 16:9 — so
  the *presentation* question (§11) is real, but the principle to take is: **a
  series should own a colour, and covers should be composed for the slot they
  live in.**
- **A per-series accent.** Season 1 red, Season 2 gold, Season 3 purple. Colour
  used as identity, not decoration.
- **The status chip** (green dot + `HSK1`) is small, quiet and consistent.

**Do not copy:**
- **The `1 TOP` ribbon.** Ranking/leaderboard signalling.
- **Their cover style.** Ours is a genuine differentiator; do not trade painterly
  illustration for graphic posters.
- **My Space / search / filter chrome** — more surface than our shelf needs, and
  the one-page shelf is device-approved.

---

### 1.5 Me / Profile

**What is on screen.** Bell and gear line icons top-right. A **blue gradient
header panel** with a mountain silhouette, a mint avatar with an Apple badge, the
name, a chevron, and three small stats with dimensional icons (calendar 519,
flower 4, lightning 151). A **gold "Upgrade to Premium" banner** with a black
crown, black text, a notched arrow right edge and a gold circular chevron.
"Statistics" — four dark bordered tiles in 2×2, each a big bold white numeral
(`496 XP`, `1.5 hours`) over a grey label. "Skill medals" with `VIEW ALL ›` and
grey silhouette placeholders.

**Borrow:**
- **The header panel as one dimensional object with illustration.** Gradient +
  silhouette + avatar + name, all in one bounded thing. Our Profile hero is a
  flat maroon rectangle; this is what it could be.
- **Big numerals over small grey labels.** Their stat tiles put the number first
  at ~26px/800 and the label at ~12px muted. Ours does this on the hero (`5 of 44
  words learned`) and should do it consistently.
- **Locked achievements as grey silhouettes of the real thing.** Legible, honest,
  and it does not use a padlock.
- **Line icons for utility chrome.** Their bell and gear are plain white line
  icons — dimensional treatment is spent on *identity*, not on settings. This is
  the evidence for our three-tier icon strategy (§10).

**Do not copy:**
- **XP, total time, skill medals, the premium banner.** Metrics-as-score and an
  upsell. Our Profile deliberately answers one question.
- **The 2×2 stat grid.** Four bordered boxes is the "dashboard" register the
  Profile redesign (P10-B) specifically removed.
- **Their blue.**

---

### 1.6 The one system I recommend against adopting

**Per-tab nav hues.** Their active nav colour changes with the destination —
purple, gold, blue, magenta, green. It is striking, and it works for them because
their five destinations are five different *products*.

For us it would cost the thing we are trying to build. Hanzi Dojo's identity is
vermilion; if the nav's active colour changes on every tab, the brand colour
stops being a constant and the app reads as five apps. **Recommendation: the nav's
active state is always vermilion.** Section accents (plum for Stories, blue for
Practice — §6) live in heading atmosphere and icon faces, *inside* the screen,
where they say "you are in the story world" without displacing the brand.

This is a genuine judgement call, and it is the one place I am arguing against
something the screenshots do well. If you want per-tab hues, that is a defensible
choice — but it should be made deliberately, not inherited.

---

## 2 · Hanzi Dojo, measured

### 2.1 The numbers

| | today | comment |
|---|---|---|
| Distinct **type styles** (size+weight+tracking+transform) across 11 screens | **60** | proposed system: 12 roles (§7) |
| Distinct **font sizes** | **26** (9.5 → 112px) | 9.5/10.5/11/11.5/12/12.5/13/13.5/14/14.5/15/16/16.5/17/18/19/20/21/22/24/26/30/34/40/76/112 |
| Distinct **font weights** | **10** | 400, 500, 550, 600, 650, 700, 750, 800, 820, 850 |
| Distinct **radii** on painted surfaces | **16** | 3, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26, 50, 999 |
| Distinct **shadow** declarations | **13** | tokens define 2 (`--shadow-1`, `--shadow-2`) |
| Distinct **hardcoded 6-digit hexes** in `src/` | **94** | tokens exist; the hexes are in addition to them |
| Distinct **lucide icons** imported | **77**, across **66 files** | |
| **Custom-drawn** icons in the whole app | **5** (`NavIcons.jsx`, bottom bar only) | |

Per-screen (390×844): type styles / distinct radii / painted surfaces / SVGs /
page height in viewports.

| screen | type | radii | surfaces | icons | height |
|---|---|---|---|---|---|
| Home | 14 | 5 | 13 | 4 | 1.00 vp |
| Study (card) | 5 | 4 | 5 | 2 | 1.00 vp |
| Stories | 11 | 6 | 36 | 19 | 2.88 vp |
| Practice | 12 | 4 | 16 | 33 | 1.74 vp |
| Profile | 8 | 4 | 14 | 11 | 1.41 vp |
| Words | 7 | 4 | 56 | 2 | 4.47 vp |
| Settings | 10 | 7 | 35 | 21 | 3.00 vp |
| Landing (web) | 20 | 10 | 21 | 13 | 2.89 vp |
| Tutorial welcome | 4 | 2 | 2 | 0 | 1.00 vp |
| Tutorial card | 12 | 5 | 9 | 1 | 1.00 vp |
| Auth | 7 | 4 | 7 | 3 | 1.00 vp |

**Read the Study row.** Five type styles, four radii, five surfaces, two icons —
and it is the best-looking screen in the app. That is not a coincidence, and it
is the argument for the whole of §7–§9.

### 2.2 Three token defects worth fixing in P14-0

1. **`--text-faint` is darker than `--text-muted` in light mode.** `#6B6B72`
   (107) vs `#71717A` (113). "Faint" should be lighter than "muted"; today the
   name lies, so a developer picking `--text-faint` for de-emphasis gets slightly
   *more* emphasis. Dark mode has the same inversion (`#8C929C` vs `#9AA0A8`).
2. **There is a fourth brand colour nobody declared: sage `#6E8466`.** It is
   hardcoded in 11 files — including `Study.jsx`, `SessionRecap.jsx`, `Landing.jsx`,
   `Feedback.jsx`, `ErrorBoundary.jsx` — as the colour of *primary buttons*. So
   the app's most important CTAs are sage while the app's identity accent is
   vermilion `#B83A24`. Two brand colours, one of them undeclared, is the root
   cause of the app feeling less "authored" than it is.
3. **`--hairline` is a white inset highlight, not a divider** (documented in
   CLAUDE.md §5, and it has already caused one real bug in P10-C3). It is a
   correct token with a misleading name. Rename in the new system.

### 2.3 Screen-by-screen verdict

Legend: **KEEP** · **RESTYLE** (structure right, presentation needs the new
system) · **REDESIGN VISUALLY** (structure stays, composition needs real work) ·
**DO NOT TOUCH**.

---

**Home** — **RESTYLE**

Strong: the composition is settled (one lit hero, one quiet supporting surface),
it fits in exactly 1.00 viewport, and the hierarchy is correct — `17 cards
waiting` at 40px is the biggest thing on the screen and it is the right thing.

Specifically weak:
- **The hero is a flat maroon rectangle with a barely-visible watermark.** The
  gradient (`heroGround`) runs 88%→70% accent over ~200px, which at this size is
  a ~7% luminance change — it reads as flat fill, so the most important object in
  the app has no dimension at all. The 田 watermark sits at 9% white and is
  invisible in the render at 1× (verify on a device before deleting it).
- **`Start reviewing` is a translucent white pill on maroon.** The primary action
  of the entire product is the *least* saturated element inside its own panel.
- **The story hand-off's cover slot shows a 24px lucide `BookOpen` in a pink
  square**, where in production it should be the story's real artwork. Even with
  art, a 56px slot at 2:3 is too small to read as art.
- **`Your week` is seven empty grey pills.** Seven identical light-grey rounded
  rectangles with single-letter labels, all empty for a new learner, is the most
  "generated" object on the screen. It communicates nothing when empty and it
  occupies a quarter of the supporting surface.
- **Progress toward HSK 3 is a 4px vermilion bar at ~11%.** Thin, one colour, no
  segmentation, no sense of the level as a journey.
- **The feedback FAB is a sage-green circle** — the only sage object on the
  screen, floating over the content, unrelated to everything else in the palette.

**Study / Cards** — **KEEP** (visual), **DO NOT TOUCH** (behaviour)

The card, the status band, the four-colour grade row and the height-locked
layout are the best-resolved visual system in the app: 5 type styles, 4 radii, no
overflow, and colour used strictly functionally. Restyle only to adopt the new
radius/shadow tokens and the new grade palette values; **do not re-compose it,
and do not reopen `Study.jsx`** (frozen).

**Session Complete** — **RESTYLE**

Structure is right (one card, tally, one recommended next). Weak: the
"Recommended next" button is a saturated vermilion block with a translucent
white icon tile inside it — a tint-on-accent nested box, which is exactly the
pattern P10 removed elsewhere. The two stat tiles are `--surface-2` boxes inside
a `--surface` card inside the page: three greys stacked. And this screen is the
app's one genuine celebration moment and currently has no dimensional or
illustrative element at all.

**Stories shelf** — **REDESIGN VISUALLY**

This is the biggest opportunity in the app, and the reason is §0.2: **the real
artwork is good and the shelf does not do it justice.**

- The real covers are warm, painterly, character-led Chinese illustration
  (verified: `public/story-covers/generated/*.webp`) — a genuine identity asset
  most competitors do not have.
- **They are 16:9 landscape, and `StoryPoster` renders a 2:3 portrait slot with
  `objectFit: cover`.** That discards roughly 55% of the image width. Art
  composed as a scene is being cropped to a bookmark. Either the slot changes
  aspect or the art is re-composed/re-cropped deliberately; today it is neither.
- 36 painted surfaces on one screen, 2.88 viewports tall, four sections that all
  look alike. Section headings (17px/800) and their sub-lines are the only thing
  separating "Top picks", "Manhua" and "Practice through stories".
- The fallback placeholder (pale accent gradient + one large lucide glyph)
  appears wherever art is missing and is what a reviewer will see if storage is
  slow. It should be a designed cover, not an icon on a wash.
- `% known` sits on the artwork over a scrim — **KEEP**, device-approved in P12.

**Series view / Story Reader** — **RESTYLE** (reader), **DO NOT TOUCH** (reader
mechanics)

The reader's typography is genuinely good and the anchored word popover is the
best-engineered component in the app (P12-6 reuses it for exactly that reason).
Weak: reader chrome is generic — a lucide back arrow, lucide settings gear, grey
progress. The reading surface itself should carry the app's paper/ink character
and currently carries none. **Do not touch** segmentation, tap-to-look-up,
audio, or the settings model.

**Practice** — **KEEP** (structure, P11, frozen), **RESTYLE** (icons only)

Structure is device-approved and frozen. But this screen has **33 SVGs, 32 of
them lucide strokes**, and it is where generic iconography is most visible: nine
drill rows and six tool rows each led by a 17–19px line glyph. Swapping in the
custom dimensional set (§8) transforms this screen without moving a single row.

**Profile** — **RESTYLE**

Structure is right (P10-B, frozen-ish). Weak: three stacked white cards with
identical treatment; the "Known-word map" is three thin grey/vermilion bars plus
a four-item colour legend, which is the one genuinely chart-like thing in the app
and looks like a debug readout; the destructive card is outlined in red and is
the most visually distinctive panel on the screen, which is backwards.

**Onboarding** — **KEEP** (frozen, P12 device-approved)

Do not touch. It will inherit tokens, type and icons in P14 like everything else,
but no composition changes. The one thing to carry forward: the tutorial has
**4 type styles on its welcome and 12 on a card** — it is already close to the
target scale.

**Auth** — **RESTYLE**

Weak: a `bg-login.webp` photographic-ish wash at 22–35% behind a plain white
card; two underlined text tabs; a `#B83A24` submit button; `Continue with
Google`/`Apple` as bordered white rows. It reads like a form, not like the front
door of a product with this much character.

**Bottom navigation** — **RESTYLE**

Today: 58px + safe-area, **full-bleed** (left/right/bottom 0), radius 0,
`--surface-glass` + `backdrop-filter: blur(14px)`, 1px top border. Cards has a
42×34 radius-12 shell. Custom 5-glyph family (`NavIcons.jsx`) — the one place we
already do custom icons, and it is the right instinct.
Weak: full-bleed + blur + hairline is the *iOS system* idiom, not a product
idiom; it welds the app to the bottom edge and gives the bar no identity. Active
state is colour + fill only. See §10.

**Sheets / modals** — **RESTYLE**

`WordLookupSheet` is well built (anchored popover with sheet fallback, focus
trap, portal). Radii disagree across the family: sheet `22px 22px 0 0`, popover
16px, More-sheet 12px rows. Grab handle is `--border`. Unify under §6.

**Loading / empty / error** — **REDESIGN VISUALLY**

The weakest category, and the least visible in review. Loading is an 88px white
rounded box with a lucide `BookOpenCheck` inside it. The bootstrap-failure screen
is a 32px 学 glyph in `Noto Sans SC`, two lines of text and a vermilion button.
Empty states are prose. None of these carry any of the app's character, and they
are exactly where a first-time user with a slow connection forms their first
impression.

---

---

## 3 · Hanzi Dojo's visual identity

**Vermilion ink × warm paper × dimensional learning objects.**

The redesign is the same Hanzi Dojo, more polished — not a rebrand. `#B83A24` (or
a refinement within a few percent of it) stays the brand anchor: it is in the app
icon, the wordmark, the hero, the card status band, and `languageTheme.js`'s
Chinese accent. Revision 1's jade proposal is **withdrawn**.

Personality, in priority order: **tactile · energetic · confident · dimensional ·
polished · coherent · adult.**

The five rules:

**1. Vermilion is the brand and the interface.** Primary actions, active
navigation, important progress and Chinese-learning emphasis are all vermilion.
There is no second "interactive" colour competing with it. The supporting hues
(gold, plum, blue, coral) have narrow, named jobs and never take a primary action.

**2. Dimension comes primarily from objects. Important surfaces may also use
controlled gradients, glow, highlights and shadows when they reinforce
hierarchy.** *(Revised from revision 1's stricter rule.)* Dimensional treatment is
earned by: the Home hero · the active nav item · a selected learning state · a
progress or reward object · session completion · a story unlock · the app icon.
Ordinary grouping surfaces stay flat. The test: **does the dimension say something
about state, material or importance?** If it is there to look nice, it is
decoration and it comes out.

**3. Gradients are allowed where they carry material, lighting or state.**
Permitted: the Home hero's ground, the active nav icon's face, the app icon,
reward and mastery objects, a selected learning object, story unlock,
celebration. Banned: decorative gradients on ordinary panels, and anything that
reads as a generic purple-blue AI gradient. A gradient that could be a flat fill
without losing meaning should be a flat fill.

**4. Paper and lacquer, not glass.** Light grounds are warm paper; dark grounds
are a warm near-black with a red cast — the inside of a lacquer box, not a grey
dashboard. Blur/translucency survives in at most one place (see §11) and is never
decoration.

**5. One light source, top-left, always.** Every dimensional element — icons,
nodes, the app icon, reward marks — is lit identically. This is the cheapest way
to make a set of assets look like one set, and it is what the HelloChinese nodes
and icons do consistently.

**Colour hierarchy, stated once so it survives the whole of P14:**

> Vermilion is the brand. Gold is the reward. Plum is the story. Blue is the
> practice. Coral is the energy. Everything else is paper and ink.

---

## 4 · Colour system

Three candidate palettes, built from your starting values. All three read as a
red brand; they differ in how much chroma the *rest* of the app carries.

### 4.1 The shared vermilion family (identical in all three)

| role | light | dark | job |
|---|---|---|---|
| `primary` | **`#B83A24`** | **`#E4573A`** | brand, primary actions, active nav, key progress |
| `primary-bright` | `#D84B32` | `#F06A4C` | hover/emphasis, gradient top stop, icon top facet |
| `primary-pressed` | `#8F2D1D` | `#C0432C` | pressed |
| `primary-soft` | `#F7E8E3` | `rgba(228,87,58,0.15)` | selected ground, tint base |
| `burgundy` | `#5E2430` | `#3A1620` | deep ground, hero shadow, dark-mode surfaces |
| `coral` | `#E8664A` | `#FF7F63` | secondary energy, dimensional icon faces |

Dark-mode vermilion is **lifted and more saturated** (`#E4573A`), not darkened —
`#B83A24` on a near-black ground measures about 3.1:1 and fails AA for text;
`#E4573A` reaches roughly 5.4:1. This is what `ink()` already does today, and it
is why the red will look *richer* in dark mode rather than muddier.

### 4.2 Supporting hues (identical in all three)

| role | light | dark | job — and only this job |
|---|---|---|---|
| `gold` | `#C08A2E` | `#E3B24E` | reward, mastery, level unlock, celebration |
| `gold-bright` | `#D6A13A` | `#F5C868` | gold gradient top stop, reward highlight |
| `plum` | `#7651A8` | `#A585D8` | Stories: heading atmosphere, series accents, story icons |
| `blue` | `#4777B8` | `#6D9BE8` | Practice, Listening, utility learning |
| `success` | `#2F9E6D` | `#34D399` | correct, mastered (keep — 72 uses today) |
| `warning` | `#D97706` | `#F0A93B` | weak-word counts, attention |
| `error` | `#DC2626` | `#F87171` | destructive, failed (keep) |
| `locked` | `#A8A29E` | `#4A524E` | desaturated, not low-opacity |

Two deliberate constraints. **Plum never takes a primary action** — a Stories CTA
is still vermilion; plum is atmosphere and identity only, which is what stops the
Stories tab turning purple. **Blue is Practice's accent, not its buttons** —
same reasoning.

### 4.3 The three palettes differ only in neutrals and chroma budget

**Palette A — "Paper"** (closest to today; most conservative)

| | light | dark |
|---|---|---|
| `bg` | `#FAF8F5` | `#141011` |
| `surface` | `#FFFFFF` | `#1E1819` |
| `surface-2` | `#F4F0EB` | `#282021` |
| `border` | `#E6E0D8` | `#332A2B` |
| `text` | `#1A1614` | `#EFEAE6` |
| `text-secondary` | `#5E574F` | `#B6ADA6` |
| `text-muted` | `#867E74` | `#8E857E` |
| `text-faint` | `#ABA39A` | `#6B635E` |

Chroma budget: low. Supporting hues appear only as small marks and icon faces; no
tinted section grounds. *Pros:* least risk, most obviously "still Hanzi Dojo".
*Cons:* closest to the current app, so it delivers the least of the energy you
asked for.

**Palette B — "Lacquer" ← recommended**

| | light | dark |
|---|---|---|
| `bg` | `#FAF8F5` | **`#100D0E`** |
| `surface` | `#FFFFFF` | `#1A1517` |
| `surface-2` | `#F5F1EC` | `#241D20` |
| `surface-3` | `#EBE4DB` | `#2E2529` |
| `border` | `#E7E1D9` | `#352B2F` |
| `border-strong` | `#D2C9BE` | `#473A3F` |
| `text` | `#191513` | `#F2EDE9` |
| `text-secondary` | `#5C554D` | `#BBB2AB` |
| `text-muted` | `#847C72` | `#928982` |
| `text-faint` | `#A9A198` | `#6E655F` |

Chroma budget: medium-high. Dark ground is a **warm burgundy-black** (`#100D0E` —
red-leaning, not neutral, not blue), surfaces carry a red cast as they lift, and
section atmospheres are permitted (§6). Accents run at full chroma against it.
*Pros:* this is the palette that delivers HelloChinese's energy on our own hue;
the dark mode genuinely looks richer than the light mode, which is the stated
goal. *Cons:* the warm dark ground is a real change and needs a device round
before anything is built on it.

**Palette C — "Cinnabar"** (most restrained/premium)

Same neutrals as B, but the chroma budget is cut to vermilion + gold + burgundy
only. Plum and blue drop out entirely; Stories and Practice differentiate by
atmosphere *density* rather than hue. *Pros:* the most adult and the most
obviously authored; hardest to make look generic. *Cons:* Stories and Practice
lose their identity colours, and the app risks reading monochrome-red — which on a
long shelf becomes fatiguing.

**Recommendation: Palette B.** It keeps the red unmistakably in charge, gives
Stories and Practice a quiet identity, and its dark mode is the one that answers
"very dark ground, strong saturated accents". Note the fix to §2.2 defect 1 carries in
all three: `text-faint` is now genuinely lighter than `text-muted` in both
themes.

### 4.4 What replaces sage

Sage `#6E8466` is hardcoded in 11 files as the colour of primary buttons (§2.2 defect 2).
Every one of those becomes **`primary`** — vermilion. There is no sage in any
palette above, and no jade. `StoryCover`'s `accent || '#6E8466'` default becomes
the language accent.

---

## 5 · Dark mode direction

Dark mode is a designed surface, not an inversion. Four rules:

1. **The ground is warm and very dark.** `#100D0E` — a red-leaning near-black.
   Today's `#0F1115` is blue-leaning grey, which is what makes the current dark
   mode feel like a generic dashboard.
2. **Accents lift and gain chroma.** Vermilion `#B83A24` → `#E4573A`. Gold
   `#C08A2E` → `#E3B24E`. Plum `#7651A8` → `#A585D8`. Blue `#4777B8` → `#6D9BE8`.
   Nothing desaturates on the way into dark. The existing `ink()` /
   `pinyinInk()` / `--ink-lift-pct` machinery already implements exactly this
   and needs new values, not new logic.
3. **Surfaces lift with a red cast.** `#1A1517` → `#241D20` → `#2E2529`. A
   neutral-grey lift on a warm ground reads as dirty; a warm lift reads as
   lacquer.
4. **Type is warm off-white** (`#F2EDE9`), never pure white — pure white on
   near-black at body size is where eye strain in dark mode comes from.

**Explicitly not:** grey-on-grey; a mechanical inversion; a red that loses
saturation. The brand must look *richer* in dark mode than in light.

**Prerequisite:** the dark render sweep (§0 note 2). Every value above is a candidate
until it has been seen on a device.

---

## 6 · Section atmosphere — hierarchy without another container

The screenshots' coloured glow behind section headings (§1.0-C) is worth a
restrained version, because it solves a problem we have: our shelf has four
sections differentiated only by a 17px heading.

**The treatment.** A very soft radial wash behind the heading region — the
section's hue at **6–10% against the page ground**, roughly 240×120px, fading to
nothing, drawn with the existing `inkWash.js`. No border, no fill, no container.
The heading itself goes up to `title-section` weight 700 at 17–19px.

**Where it is allowed:** Stories sections (plum), Practice's *Look things up*
(blue), Session Complete's celebration (gold). **That is the whole list for P14.**

**Rules:** at most **one** atmospheric wash visible at a time per screen; it never
appears behind body text; it is not a substitute for spacing; and if it can be
removed without the hierarchy collapsing, it should be. This is the same "one lit
thing per screen" discipline P10 established, extended one notch.

**Do not** apply it to every section — that is how a technique becomes a texture.

---

## 7 · Typography system

**Today: 60 distinct styles, 26 sizes, 10 weights. Proposed: 12 roles, 9 sizes,
4 weights.**

One family (Inter) for UI, the existing CJK face for Chinese. Four weights only:
**400 / 600 / 700 / 800**. The current 500/550/650/750/820/850 are all rounding
noise that no one can see and everyone has to maintain.

| role | size / weight / tracking | use |
|---|---|---|
| `display` | 40 / 800 / −0.02em | the one number a screen is about (`17 cards waiting`) |
| `title-screen` | 26 / 800 / −0.02em | screen title (`Today`, `Stories`) |
| `title-section` | 17 / 700 / −0.01em | section heading |
| `title-card` | 15 / 700 | row/card title |
| `body` | 15 / 400 / 1.55 | prose |
| `body-secondary` | 13.5 / 400 / 1.5 | supporting prose |
| `label` | 13 / 600 | button and control labels |
| `caption` | 12 / 400 | metadata |
| `eyebrow` | 10.5 / 800 / 0.14em / caps | keep exactly as `MICRO` is today — it works |
| `numeric` | inherits size / 700 / tabular | any figure in a column |
| `hanzi-display` | 76 / 400 | the study card's character (keep) |
| `hanzi-inline` | 30 / 400 | story/scene lines |
| `pinyin` | 16 / 600 | reading, in `pinyinInk()` |
| `definition` | 15 / 400 | English meaning |

That is 14 rows for 12 roles (hanzi and pinyin are content, not UI scale). Nine
distinct sizes: 10.5, 12, 13, 13.5, 15, 17, 26, 30/40, 76.

**COMPONENT REFACTOR.** These must live in one module (`type.js`, spread into
style objects) or they will not be adopted — 60 styles is what happens when the
scale lives in prose.

---

## 8 · Shape, surface and elevation

### Radius — 4 values plus pill (today: 16)

| token | value | applies to |
|---|---|---|
| `r-sm` | 8px | chips, badges, small tints, inline marks |
| `r-ctl` | 12px | buttons, inputs, controls, icon shells |
| `r-card` | 18px | cards, rows-as-objects, sheets' top corners |
| `r-hero` | 26px | hero panel, study card, modal cards |
| `r-pill` | 999px | pills, avatars, progress tracks |

The study card is already 26 and the grade buttons 16 — the new `r-hero`/`r-ctl`
pair keeps that relationship while removing 3, 9, 10, 11, 13, 14, 15, 20, 22, 50.

### Surface levels — 4, each with one job

| level | background | border | shadow | when |
|---|---|---|---|---|
| `page` | `bg` | — | — | the ground. Default. Most content should sit here |
| `grouped` | `surface-2` | — | — | a run of related rows sharing one ground; no border |
| `raised` | `surface` | `border` | `shadow-1` | **one conceptual object that is tappable as a whole** |
| `floating` | `surface` | `border` | `shadow-2` | sheets, popovers, the nav bar, modals |

Plus exactly one `hero` treatment per screen (accent ground + tinted shadow),
which is the existing P10 rule and stays.

**The rule, restated so it survives:** *if the whole object is meaningfully
tappable, or represents one conceptual thing, a bounded surface is fine.
Otherwise use spacing, a heading and a hairline.* Two shadows total; 13 today.

---

## 9 · Buttons and controls

| control | height | radius | type | rest | pressed | disabled | dark |
|---|---|---|---|---|---|---|---|
| **primary** | 52 | `r-ctl` | `label` 15/700 | `primary` fill, cream text, `shadow-1` | `primary-pressed`, scale .985, shadow removed | `surface-3` bg, `text-faint`, no shadow | `primary` (lifted), text `#100D0E` |
| **secondary** | 52 | `r-ctl` | 15/600 | `surface` + `border-strong` | `surface-2` | as above | `surface-2` + `border-strong` |
| **ghost** | 44 | `r-ctl` | 14/600 | transparent, `primary` text | `primary-soft` ground | `text-faint` | `primary` text |
| **destructive** | 52 | `r-ctl` | 15/700 | transparent, `error` text, `error` border | `error` at 8% ground | — | `error` lifted |
| **icon button** | 44×44 | `r-pill` | — | `text-muted` glyph | `surface-2` ground | 40% opacity | same |
| **chip (selectable)** | 36 | `r-pill` | 13/600 | `surface` + `border` | — | — | `surface-2` + `border` |
| chip **selected** | 36 | `r-pill` | 13/700 | `primary-soft` + `primary` border, `primary` text | — | — | `primary-soft` + `primary` |
| **segmented** | 40 | `r-ctl` (track `r-ctl`, thumb `r-sm`) | 13/600 | track `surface-2`, thumb `surface` + `shadow-1` | — | — | track `surface-2`, thumb `surface-3` |
| **list row** | 54 min | 0 (inside a `grouped`/`raised` container) | title `title-card`, sub `caption` | `borderTop: 1px border` except first | `surface-2` | `text-faint` | same |

Every interactive target ≥44px in at least one axis and ≥44 in both where it is
the primary action — which the app already satisfies everywhere measured.

**COMPONENT REFACTOR** — these want to be real components (`Button`,
`Chip`, `Row`), which the repo currently does not have; today each screen
re-declares them inline. This is the single highest-leverage refactor in P14 and
it is what makes screens 5–10 cheap. All five ship in **P14-1**, before any
screen work, and `Button` replaces every sage CTA in the same commit.

---

## 10 · Icon strategy — three tiers

The gap is real (77 lucide against 5 custom) and §1.0-B is the reason it matters.
But replacing all 77 is the wrong target, and the screenshots agree: their own
bell and gear are plain white line icons. **Dimensional treatment is spent on
identity, not on chrome.**

### Tier 1 — identity icons: custom dimensional artwork (14)

These are the icons a learner would recognise out of context. Home · Cards ·
Stories · Practice · Profile · Weak words · Listening · Writing · Grammar ·
Tones · Stroke order · Level test · Story unlock · Session complete / reward.

**Art direction:**
- **Silhouette first.** Recognisable as one solid shape at 24px before any tone
  is added. If three tones are needed for legibility, the silhouette is wrong.
- **2–4 tones**: a base, a shadow (base darkened ~18%), a highlight (base
  lightened ~22%), optionally one accent. The HelloChinese headphones are two
  tones; the path node is four. That is the range.
- **One light source, top-left.** Highlight on the top-left facet, shadow
  bottom-right, and — like their path node — a small specular arc where the form
  is curved.
- **Subtle depth, slightly tactile.** A soft contact shadow only where the object
  sits on something. No photorealism, no bevels, no glass, no generic 3D render.
- **Rounded geometry**, 1.8–2.5px corner radii at 24px, following
  `NavIcons.jsx`'s existing family rules — that file is already the style guide.
- **Two states:** `inactive` single-tone `text-muted`; `active` full dimensional.
  Dimension marks *the current thing*; a dimensional icon in every row is noise.
- **Designed at 32px, verified at 24 and 20.** What dies at 20px gets simplified,
  not shrunk.
- **Colour comes from the palette's named jobs**: Cards/Home vermilion, Stories
  plum, Practice/Listening blue, reward/unlock gold, weak words warning.

**Concepts** (art direction only; no assets, and the symbol choices are not final):

| icon | concept |
|---|---|
| Home | A tiled roof over an open doorway — a dojo gate, not a house. Roof is the silhouette. |
| Cards | Two stacked cards, slight tilt, front card carrying one brush stroke. Extends the existing `NavIcons` idea with a face and tones. |
| Stories | An open book whose right page holds a tiny painted scene — two colour fields, no detail. |
| Practice | A rack of drill tiles (the P8 decision: a grid, not a bullseye) with volume. |
| Profile | A seal stamp (印章) — a rounded block with a carved face. Far more distinctive than a person glyph. |
| Listening | A bell with one sound arc, not a speaker cone — avoids the mute ambiguity. |
| Writing | A brush at an angle over a paper edge, one wet stroke below. |
| Grammar | Two joined blocks with a connector — structure, literally. Not a book (that is Stories). |
| Tones | Four brush marks in the four tone contours, the third emphasised. Instantly Chinese; nobody else owns this. |
| Stroke order | A 一→十 form with one ghost stroke and a small arrow. |
| Weak words | A card with a worn corner and a small amber mark. The object shows wear; not a warning triangle. |
| Level test | A sealed scroll with a gold band. Broken band = passed. |
| Story unlock | A padlock whose body is a book spine, opening, plus one gold spark. |
| Session complete | A stacked-cards form with a gold ring closing around it. The one celebration mark. |

### Tier 2 — functional UI icons: clean line icons

Back, close, search, settings, chevrons, more, play/pause, plus/minus, check.
These stay **line icons at one consistent weight**. A learner needs to understand
these instantly; they do not need to remember them. Either keep lucide here or
draw a small matched line family later — not a P14 decision.

### Tier 3 — minor utilities: keep lucide

Everything else (~50 glyphs): admin screens, dev tooling, one-off affordances,
DojoHQ. No custom art, no migration. If a Tier 3 icon later turns out to carry
identity, it gets promoted to Tier 1 deliberately.

**The rule:** *custom icons where people remember the icon; functional icons where
people just need to understand the control.*

**Format:** hand-authored SVG, one file per icon, in a new `src/icons/`, following
`NavIcons.jsx`'s conventions (24×24 viewBox, optical centring, `currentColor` for
single-tone, explicit tones for active). **COMPONENT REFACTOR** to introduce;
**VISUAL ONLY** per swap. Ship in complete families per surface — all five nav
glyphs, then all Practice glyphs — never one at a time.

The Higgsfield pipeline is the wrong tool here: these are 24px vector UI marks,
not raster illustration.

---

## 11 · Bottom navigation — three concepts

The screenshots settle the direction: **every one of the five uses an inset,
rounded, near-solid tray with labels always visible** — never a full-bleed glass
bar. Their tray sits ~10px in from each edge, has a ~22–26px radius, uses a
surface a step lighter than the page, and carries only modest elevation.

Today ours is the opposite: 58px + safe-area, full-bleed, radius 0,
`--surface-glass` + `blur(14px)`, 1px hairline top. **Destinations and navigation
architecture do not change in any concept** — `navConfig.js`, `navStack.js`,
`TabHost.jsx`, per-tab stacks, Android Back and scroll restoration are all
untouched. **VISUAL ONLY.**

**Concept A — floating tray, five equals.**
Height 60 (safe-area below the tray, not inside it). Inset 12px. Radius 24. Solid
`surface`, no blur, `shadow-2`, 1px `border` in dark. All five destinations
structurally identical. Active: dimensional vermilion icon + vermilion label
(13/700) + a soft vermilion bloom on the tray behind the icon. Inactive:
single-tone `text-muted` glyph + `text-faint` label.
*Pros:* cleanest, most systematic, closest to the screenshots' actual geometry.
*Cons:* loses the P8 device-approved emphasis on Cards.

**Concept B — subtle inset tray.**
Height 58. Inset 8px. Radius 18. `surface` at 96% with a 1px border, minimal
shadow. Active: filled vermilion icon + vermilion label. No bloom, no
dimensional treatment.
*Pros:* most native-feeling, lowest risk, smallest change. *Cons:* it is close
enough to today's bar that it delivers little of the polish; the icons would be
doing all the work alone.

**Concept C — Hanzi Dojo tray, Cards slightly favoured. ← recommended.**
Height 62 (safe-area below). Inset 10px. Radius 22. Solid `surface`, `shadow-2`,
1px `border` in both themes so the tray reads as an object resting on the page.
Four tabs at even weight. **Cards keeps a quiet advantage:** the existing 42×34
shell stays, restyled as a soft vermilion `primary-soft` rounded rectangle that
fills with a vermilion gradient (`primary-bright` → `primary`) plus one 1px inner
top highlight when active — *and nothing else*. **No mechanical key**: no deep
bevel, no travel, no double shadow, no hardware metaphor. Cards' icon runs one
step larger (27.5px, as today). Active tab: dimensional icon + vermilion label +
a very soft bloom. Inactive: single-tone glyph + `text-faint` label. Labels always
on, all five.
*Why this one:* it takes the screenshots' tray geometry, keeps the P8
device-approved decision that Cards is the primary destination and expresses it
*visually* rather than structurally, and it is the treatment the new dimensional
icons will look best in. It is also the smallest change that gives the bar an
identity.
*Risk:* an inset tray leaves a strip of page visible below it, and that strip must
look intentional on every screen — which means the page ground has to be
deliberate at the very bottom. Worth checking at 320px, where 2×10px of inset is
real width.

*(Revision note: revision 1's Concept C described Cards as a "pressable key" with
a top facet. That is dialled back per instruction — favoured, not hardware.)*

---

## 12 · App icon direction

### Current state, audited

`ios/App/App/Assets.xcassets/AppIcon.appiconset/` contains **one image**
(`AppIcon-512@2x.png`, 1024²) and its `Contents.json` declares **no `appearances`
entries** — so dark and tinted are derived by iOS rather than authored. The mark
is a vermilion brush ensō on a `#FAFAF8` near-white ground.

**Why it reads flatter and weaker than its neighbours:**
1. **It is genuinely flat** — one vermilion, no gradient, no highlight, no
   shadow, no dimensional construction. Every icon beside it on a home screen has
   at least an implied light source.
2. **The ground is near-white**, so on most wallpapers it reads as a bright empty
   square with a small mark in it, rather than as an object.
3. **It is a thin ring, and rings lose their content at size.** The interior is
   ~45% of the tile and empty. At 40px the brush texture — the bristle streaks,
   the speckles at 10–11 o'clock — is entirely gone, and what remains is "an
   orange-red circle".
4. **No authored dark appearance.** With a light ground, iOS's derivation either
   keeps the bright square (jarring on a dark home screen) or treats it in a way
   nobody chose. Tinted is worse: tinting maps luminance to a monochrome ramp,
   and a thin vermilion ring on near-white becomes a faint outline on grey.

### Requirements for the new icon (direction, not a symbol)

The symbol decision is deferred to a separate icon-concept phase — `学`, an ensō,
a seal, a dojo gate and anything else stay on the table. What is decided now:

- **Vermilion/red remains dominant.** The red equity is not traded away.
- **Strong silhouette** — one shape, readable at 40px.
- **More filled visual mass than the current ring.** The interior earns its space.
- **Dimensional depth** with **top-left lighting** and a **restrained**
  highlight/shadow — one specular pass, one contact shadow. Not a 3D render.
- **No detail that dies at 40px.** Brush texture, fine streaks and speckles are
  out at icon scale.
- **Supporting colours:** burgundy (`#5E2430`) for depth, cream (`#FAF8F5`) for
  the counter-form, gold (`#C08A2E`) for one small accent, possibly a small plum
  note. **Never rainbow** — three colours plus the ground is the ceiling.
- **The ground is dark and warm** (`#100D0E`–`#1A1517`), not near-white. The
  ground is most of what makes an icon read as an object.

One observation to carry into the concept phase, offered as an input rather than
an argument for any particular mark: the ensō (円相) is **Japanese Zen**
iconography, and the product is exclusively HSK Chinese with the Japanese track
frozen. That is worth weighing when the symbol is chosen — but the circular
gesture and the vermilion are genuine equity, and a concept that keeps both while
adding Chinese specificity is entirely possible.

### The four iOS appearances — all authored, none derived

| appearance | plan |
|---|---|
| **Default** | Full colour, dimensional, on a warm dark ground. |
| **Dark** | The same red brand, presented darker — ground deepened toward `#0C0A0B`, vermilion **lifted** to `#E4573A` so the mark holds against a dark wallpaper. **Dark does NOT mean "make the logo black."** |
| **Tinted** | Authored greyscale with deliberate luminance separation — mark ~85% white, ground dark. iOS applies the user's tint to *our* ramp, so the ramp must be designed. |
| **Clear** | Silhouette only: one flat form, no interior detail, no texture. This is the icon that proves the silhouette rule in §10. |

Also needed for the store release: Play's adaptive icon requires a separate
foreground/background pair. The current `maskable-512.png` is a single flattened
image and will be cropped by any mask shape.

**Parallel task, blocking nothing. Do not implement yet.**

---

## 13 · Screen transformation plan

Re-evaluated against the vermilion-led system. Structure is frozen everywhere
noted; these are presentation changes.

| screen | before | after |
|---|---|---|
| **Home** | Correct hierarchy, fits 1.00 vp. Hero is a flat maroon rectangle (88%→70% gradient over 200px ≈ 7% luminance change, so it reads flat); primary CTA is a *translucent white* pill — the least saturated thing inside its own panel; 田 watermark invisible at 9%; story cover at 56px showing a lucide glyph; `Your week` is seven empty grey pills; progress is a 4px bar; a sage FAB unrelated to anything. | **Structure kept.** Hero gets real depth: a vermilion gradient (`primary-bright`→`primary`) with a burgundy-shadowed lower edge and the 田 watermark raised to a strength that actually reads. The CTA becomes a **solid cream-on-vermilion** or high-contrast pill so the primary action is the most confident object on the screen. Week days become small ink tiles that look like marks on paper, with studied days in vermilion. Progress becomes a taller segmented track with the level as a destination. Story hand-off shows **real cover art at 2–3× today's size**. FAB adopts `primary`. |
| **Study** | The visual benchmark: 5 type styles, 4 radii, 5 surfaces, 2 icons, colour strictly functional. | **Composition frozen.** Token adoption only: radii to the new scale, grade palette refined within its existing four-colour logic, shared typography, and *extremely* restrained dimensional polish (at most a single soft inner highlight on the card edge). No new objects. `Study.jsx` is not reopened. |
| **Session Complete** | Correct structure. Three greys stacked (tile inside card inside page); the "Recommended next" CTA is a vermilion block with a translucent white icon tile nested inside it — the exact pattern P10 removed elsewhere; no celebration element at all. | One of the app's two celebration moments. A **dimensional reward object** (Tier 1 `session complete` mark) in **vermilion + gold**, one gold atmospheric wash behind it, the tally as typography on the card rather than boxes-in-boxes, and **one** obvious next action. Gold appears here and means exactly what it means everywhere else. |
| **Stories** | Real painterly art — the app's strongest identity asset — cropped 16:9→2:3 (~55% of width discarded). 36 painted surfaces, 2.88 vp, four sections separated only by a 17px heading. Fallback is a lucide glyph on a wash. | **Structure kept, and the art becomes the personality.** Each shelf section gets a **restrained plum atmospheric wash** behind its heading (§6) instead of another container. Covers get room. **Red stays the brand**: CTAs, `% known`, active states are vermilion; plum is atmosphere and per-series accent only. Designed fallback covers replace the icon-on-wash. `% known` on the artwork stays exactly as device-approved. |
| **Reader** | Good typography; generic chrome (lucide back arrow, gear, grey progress). | Paper ground, ink chrome, Tier 2 line icons at one weight, vermilion progress. Mechanics — segmentation, tap-to-look-up, audio, settings — untouched. |
| **Practice** | P11 structure device-approved and frozen. **33 SVGs, 32 lucide strokes** — the screen where generic iconography is most visible. | **Nothing moves.** Custom Tier 1 drill icons do the work, with **selective blue** on the *Look things up* family (heading atmosphere + muted icon faces) so the two row families separate by more than weight. Counts stay typography, in `warning`. |
| **Profile** | P10-B structure approved. Three near-identical white cards; the known-word map is thin bars plus a four-item legend and reads like a debug readout; the destructive card is outlined red and is the most distinctive panel on the screen. | **Structure kept, not a dashboard.** The hero becomes one dimensional object (vermilion gradient + a drawn atmospheric mark, in the register of the screenshots' header panel). The known-word map becomes one deliberate ink-and-vermilion readout with the legend integrated. Destructive de-emphasised to a quiet row; the confirmation carries the weight. No new metrics, no stat grid. |
| **Onboarding** | Frozen, device-approved. Already near the target type scale (4 styles on the welcome, 12 on a card). | **Inherits only.** Tokens, type, Tier 1/2 icons. No composition change. Verified after the sweep, not redesigned. |
| **Auth** | A photographic wash at 22–35% behind a plain white card; two underlined text tabs; a `#B83A24` submit; provider rows as bordered white boxes. | **Red-led front door.** Warm ground (paper in light, lacquer in dark), one raised card, a **segmented control** instead of underlined tabs, vermilion primary, provider rows as proper secondary buttons, and one **dimensional brand asset** — the new app-icon mark at real size — instead of a flat logo on a photo. |
| **Loading / empty / error** | The weakest category and the least reviewed. Loading is an 88px white box with a lucide glyph; bootstrap failure is a 32px 学 and a button; empty states are prose. | Cheap once the system exists: the brand mark at rest for loading, Tier 1 objects for empty states, and warm grounds throughout. This is where a first-time user on a slow connection forms an impression. |

---

## 14 · Revised P14 implementation sequence

Per instruction, with the device gate moved earlier — judge the new language on a
phone after navigation, before it goes app-wide.

| step | scope | notes |
|---|---|---|
| **P14-0** | **Tokens** — colour (Palette B), typography, radii, elevation | Fix the `--text-faint` inversion; rename `--hairline` to what it is (an inset top highlight); **replace sage primary buttons with vermilion `primary`** — not jade. Prerequisite: the dark render sweep (§0 note 2). No visual change ships alone. |
| **P14-1** | **Shared controls** — `Button`, `IconButton`, `Row`, `Chip`, `Segmented` | No screen redesign. The repo has no button component today; every screen re-declares one inline, which is why this must precede everything that consumes it. |
| **P14-2** | **Typography / radius / elevation normalisation** | Mechanical sweep across all screens. **Device QA after this.** Expect it to touch frozen screens — see §16 risk 1. |
| **P14-3** | **First custom icon family: the five navigation icons only** | Home, Cards, Stories, Practice, More. Get five right before drawing fifteen. |
| **P14-4** | **Bottom navigation** (Concept C) | **Then cut TestFlight.** This is the gate: the new visual language gets judged on a real phone before it is applied everywhere. |
| **P14-5+** | Only after nav device QA: Home → Study token adoption → Session Complete → Stories → Practice → Profile → Auth → loading/empty/error → onboarding inheritance → motion/haptics | Practice needs its Tier 1 drill icons drawn, which can run during P14-5/6. |
| **parallel** | **App icon** | Concept phase first (3–5 concepts), then the four authored appearances. Blocks nothing. |

**Baseline warning:** the committed screenshots in
`tests/e2e/visual.spec.js-snapshots` go stale at P14-2, P14-4, and each of Home /
Stories / Profile. Every one needs a `visual-baseline.yml` dispatch after it lands
(`docs/RELEASE-CHECKLIST.md` §1); baselines are CI-owned and must never be
regenerated locally.

---

## 15 · Product vs. visual, marked

**VISUAL ONLY** — the palette, dark-mode grounds, type scale, radii, elevation,
section atmosphere, Tier 1/2 icon swaps, nav tray treatment, app icon, hero depth,
week tiles, progress rendering, reader chrome, auth composition,
loading/empty/error art.

**COMPONENT REFACTOR** — the token modules, `type.js`, the five shared controls,
`src/icons/`, extracting inline button styles. Behaviour-preserving; each ships
with its own spec.

**PRODUCT CHANGE — backlog, explicitly not P13/P14:**
- A lesson path / node progression (§1.1). Ours is FSRS stability plus a level test.
- Currencies, XP, streaks, coins, gems, crowns, a reward economy.
- Mascots or a character guide.
- New tabs, new destinations, new Story structure, new Practice structure.
- Premium gating, leaderboards, rankings.
- **The story-cover aspect decision.** Re-cropping or re-generating 204 covers, or
  changing the poster aspect, changes what the shelf *is*. Its own decision, and
  possibly a content run.
- Making the known-word map a real chart with more data.

---

## 16 · Risks

1. **A token sweep touches every frozen screen.** Home, Stories, Practice,
   Profile and onboarding are all device-approved. P14-0/2 *will* change how they
   look. The freeze has to be read as "no composition changes", with a device pass
   after P14-2 — otherwise the sweep is untestable and the freeze is unenforceable.
2. **The warm dark ground is the biggest single visual change in the plan.**
   `#100D0E` versus today's `#0F1115` is small on paper and total in effect, and
   dark mode has not been swept (§0 note 2). It deserves its own device round before
   anything is built on top of it.
3. **Tier 1 is still 14 custom icons, two states each, verified at three sizes.**
   That is the most likely place P14 stalls half-migrated, which looks worse than
   either the before or the after. The P14-3 "five nav icons first" gate exists
   precisely to find out how long one family actually takes.
4. **Dimension is the rule most likely to be over-applied.** "Important surfaces
   may also use gradients and glow" is a licence, and licences spread. The §3-2
   test — *does the dimension say something about state, material or
   importance?* — has to be applied at review time, every time.
5. **Section atmosphere can become texture.** One wash per screen, three approved
   locations (§6). If it appears on every heading it stops being hierarchy.
6. **Plum and blue could drift into taking actions.** The moment a Stories button
   is plum, the brand stops being red. Worth an explicit lint-level convention:
   only `primary` may be a button fill.
7. **Stale baselines** at five points in §14 — each a place where a red Playwright
   run means nothing and a real regression could hide.
8. **Scope creep from "polish" into "features"** — what §15 exists to prevent.
   Re-read it at the start of every P14 commit.

---

## 17 · What must explicitly NOT change

- **Navigation architecture** — `navStack.js`, `navLedger.js`, `TabHost.jsx`,
  per-tab stacks, deep-link seeding, Android Back, scroll restoration. Visual only,
  on the tray itself. Destinations unchanged.
- **Onboarding** — the P12 flow, all fourteen states, the sandbox, the reading-
  lesson gate, Skip, the funnel events. Inherits tokens; composition frozen.
- **Study behaviour** — the queue, FSRS, grading, undo, the session mix, the
  first-run cap. `Study.jsx` is not reopened; its composition is the benchmark.
- **Home structure** — hero plus one supporting surface (P10-C3, device-approved).
  Treatment changes; structure does not.
- **Stories structure** — the one-page shelf, its sections, series units, and
  `% known` on the artwork.
- **Practice structure** — the P11 hero, drill list, quiet level-test row, tools;
  the uneven hints; counts as typography.
- **Profile structure** — one progress panel, the weak-word list, the control rows.
- **The frozen non-Chinese tracks** — untouched.
- **CLAUDE.md §5–§7** — semantic tokens for neutrals, `color-mix` tints, `ink()`
  for accent-as-text, one lit panel per screen, inline style objects, no Tailwind
  utilities, no TypeScript, and every Supabase safety rule.
- **No streaks, no XP, no currencies, no guilt.** The visual language gets more
  energetic; the product's promise does not change.
