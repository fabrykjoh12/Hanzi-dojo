# P13 — Visual direction audit and design system

**Status: audit and direction only. No CSS, no tokens, no components implemented.**
Written against `claude/hanzi-dojo-continuation-e3vnbg` @ `3dfd036` (the state that
passed P12 device QA).

Every number in §2 was **measured**, not eyeballed: a DOM census ran over eleven
real screens at 390×844 and counted computed type styles, radii, shadows,
painted surfaces and SVGs. Where I could not measure something, this document
says so rather than guessing.

---

## 0 · Three honesty notes, before anything else

**1. The HelloChinese screenshots did not arrive.** Your message describes five
screenshots (Learn, Practice, Stories, Lessons, Profile); no images came through
with it. §1 is therefore written from my own knowledge of HelloChinese as a
shipped product, and it is pitched at the level of *principle* — which is what
you asked it to be used for. **It is not an analysis of your screenshots, and I
have not seen them.** §1 ends with the specific questions the screenshots would
settle; re-send them and I will correct that section against what is actually on
screen. Nothing in §3–§14 depends on it: those rest on the measured audit of our
own app.

**2. Our Stories renders show the fallback, not production.** The e2e fixture
sets `image_path: null` on every story, so the shelf in my captures is
`StoryCover`'s designed gradient placeholder. In the live database **204 of 204
published Chinese stories have cover art**. I verified the real art separately
(`public/story-covers/generated/`) and it is good — see §2.4. This is the same
class of blindness that hid the `cover_url` bug in P12: the mock answers any
select with its own rows.

**3. Dark mode is audited from tokens, not from a fresh render sweep.** My dark
harness set `data-theme` before the app read the profile's own theme, so the app
overrode it and the "dark" captures came back light. Dark-mode findings below are
read from `src/index.css`'s dark block and from the genuinely-dark captures made
during P11/P12 (Practice, tutorial). A full dark sweep is worth doing before
P14 implementation starts.

---

## 1 · HelloChinese's visual system, at the level of principle

*(Written from knowledge of the app, NOT from your screenshots — see §0.1.)*

**What makes it feel polished is not decoration. It is that every surface has a
job, and the app never uses two devices to do one job.** Four principles carry
most of it:

**1.1 One loud thing per screen, and it is always the action.** The primary
action is the largest, most saturated, most dimensional object in view, and
nothing else on the screen competes for that register. Secondary things are
smaller, flatter and quieter *by system*, not by accident.

**1.2 Colour is functional, and it is allowed to be strong.** A saturated green
means *go / progress / correct*. Gold means *reward*. Grey means *locked*. The
palette is small and each colour is spent on one meaning, so a green button reads
as an instruction rather than as branding. Locked/inactive states are genuinely
desaturated, not just lower-opacity versions of the active state — which is why
"available" and "not yet" are legible at a glance.

**1.3 The icons are objects, not glyphs.** This is the single biggest gap
between that app and ours. Its icons read as small dimensional *things* — a
couple of tones, a soft top-light, a subtle bottom shadow, a simple silhouette
that survives at 24px. They are drawn for the product; they are not a general-
purpose line set. Because the icons carry personality, the surfaces underneath
them can stay calm. **Ours is the inverse: generic line icons, so the surfaces
have to work harder, and that is what makes a screen full of cards feel
generated.**

**1.4 Rounded surfaces everywhere, yet no "cards everywhere" feeling.** The
resolution is that its rounded surfaces are almost always *one tappable object*
— a lesson node, a unit, a story, a button. Rounded boxes are not used to group
unrelated readouts; grouping is done with spacing, a heading and a divider. So
the eye reads "here are twelve things I can tap", not "here are twelve panels".
That is the same rule P10 arrived at independently in our own app, and it is
worth stating as the shared principle it is: **a bounded surface is a promise
that the whole thing is one object.**

**Bottom navigation:** a compact bar, inset from the screen edges, high corner
radius, solid (not glassy), sitting on its own shadow so it reads as floating
above the page rather than welded to the bottom edge. Active tab = filled
dimensional icon + brand colour + label; inactive = flat monochrome + muted
label. Labels always present.

**Progress and gamification:** a vertical path of nodes is the spine of the
learn screen — current node emphasised and dimensional, completed nodes filled,
future nodes flat and grey. It works because progress has a *place*, an obvious
"you are here", and one visible next step. The mechanics (currencies, streak
pressure) are not what we want; the visual principles are: **one unmistakable
next action, state legible without reading, progress that occupies real estate
proportional to its importance.**

**Illustration:** warm, character-led, consistent palette, used at real size —
not as a small decorative afterthought. Personality comes from artwork, which
frees the UI chrome to be restrained.

### What the screenshots would settle

Re-send them and I will pin down: exact bar height and horizontal inset; whether
the bar is solid or translucent; the corner radius family; the exact greens
(primary / pressed / soft); how many type sizes appear on one screen; how locked
nodes are desaturated (opacity vs. grey fill); whether icon shadows are cast on
the surface or baked into the glyph; and how much is above the fold on the Learn
screen.

---

## 2 · Hanzi Dojo, measured

### 2.1 The numbers

| | today | comment |
|---|---|---|
| Distinct **type styles** (size+weight+tracking+transform) across 11 screens | **60** | proposed system: 12 roles (§5) |
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
is the argument for the whole of §5–§7.

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

## 3 · Hanzi Dojo's own visual identity

**The concept: ink, jade and paper — a training hall, not a game show.**

Chinese learning has two visual traditions worth borrowing from and one to
avoid. Borrow: **ink on paper** (brush, stroke, the physicality of writing) and
**jade** (深 depth, cool green, something valuable that takes work to get). Avoid:
the cartoon-mascot register, which is what makes the category feel like it is for
children.

Five words, in priority order: **tactile, confident, warm, dimensional, adult.**

What that means concretely, as rules:

1. **Ink is the content; jade is the interface.** Chinese characters, story art
   and brush marks are warm and ink-like. Buttons, progress, nav and success are
   jade. The learner should be able to tell "this is the language" from "this is
   the app" without reading.
2. **Dimension comes from objects, not from surfaces.** Icons, the app icon and
   celebration marks get real dimensional treatment (2–4 tones, one light
   source). Panels stay flat. This is the inverse of the current app and it is
   what fixes "grey cards everywhere" without deleting any cards.
3. **Paper, not glass.** Grounds are warm off-white and deep ink; no
   glassmorphism beyond the one nav treatment we choose; no blurred translucency
   as decoration.
4. **One light source, top-left, always.** Every dimensional element is lit the
   same way. This is the cheapest possible way to make a set of assets look like
   a set.
5. **Colour means something or it is not there.** No decorative gradients. The
   hero's ground and the story art are the only places large colour fields live.

**The vermilion question, stated plainly.** `#B83A24` is currently the *Chinese
language accent* in `languageTheme.js`, and it is load-bearing in code
(`accentHex`, `heroGround`, `ink()`, the card status band). Making jade the
primary brand colour is therefore an architectural decision, not a palette
swap. My recommendation: **keep both, with separated jobs** — jade becomes the
interactive/brand colour, vermilion stays the Chinese-content colour (the
wordmark, the app icon, hanzi marks, the story accent, the card status band).
That preserves the ensō heritage and the per-language architecture, gives the app
the jade identity you want, and — usefully — jade and vermilion are a genuinely
Chinese pairing rather than an arbitrary one. It also means §4's `primary` is a
*new* token rather than a redefinition of `--chinese-accent`, which is far safer.

---

## 4 · Colour system

Jade with a blue lean, deliberately away from both HelloChinese's grass green and
Duolingo's `#58CC02`. All values are candidates for a device round, not final.

### Light mode

| role | hex | use |
|---|---|---|
| `primary` | **`#0E7A63`** | primary buttons, nav active, progress fill, focus |
| `primary-pressed` | `#0A6252` | pressed/held |
| `primary-soft` | `#E4F2ED` | selected chip ground, soft fill, tint base |
| `primary-ink` | `#0B5F4E` | jade used as text on light |
| `secondary` | `#1F2A37` | high-contrast neutral button (the "premium pill") |
| `content-ink` (vermilion) | `#B83A24` | wordmark, hanzi marks, card status band |
| `story` | `#8A4B2A` | Stories accent — warm brown-red, distinct from content-ink |
| `practice` | `#2E5AA8` | Practice accent — cool blue, distinct from primary jade |
| `success` | `#2F9E6D` | keep (already 72 uses) |
| `warning` | `#D97706` | keep |
| `weak` / `error` | `#DC2626` | keep |
| `reward` / gold | **`#C08A2E`** | level unlock, mastery, story unlock |
| `locked` | `#A8A29E` | genuinely desaturated, not low-opacity |

Neutrals (warm, paper-leaning — keeps the ink metaphor):

| | hex |
|---|---|
| `bg` | `#FAF9F6` |
| `surface` | `#FFFFFF` |
| `surface-2` | `#F3F1ED` |
| `surface-3` | `#E9E6E0` |
| `border` | `#E3DFD8` |
| `border-strong` | `#CFC9C0` |
| `text` | `#1A1815` |
| `text-secondary` | `#5C574F` |
| `text-muted` | `#847D73` |
| `text-faint` | `#A8A29A` |

Note the neutral scale is **warmer** than today's `#FAFAF8`/`#E7E5E4` (which are
near-neutral greys) and, critically, `text-faint` is now genuinely lighter than
`text-muted` — fixing §2.2.1.

### Dark mode

Not an inversion. Deeper ground, *more* saturated accents, and the same
hierarchy.

| role | hex |
|---|---|
| `bg` | **`#0C0F0E`** (near-black with a green cast, not blue) |
| `surface` | `#161A19` |
| `surface-2` | `#1F2422` |
| `surface-3` | `#2A302D` |
| `border` | `#2E3533` |
| `border-strong` | `#3E4642` |
| `text` | `#ECEAE6` |
| `text-secondary` | `#B4AFA6` |
| `text-muted` | `#8E887E` |
| `text-faint` | `#6E6862` |
| `primary` | **`#2CC49A`** (lifted and more saturated) |
| `primary-pressed` | `#23A481` |
| `primary-soft` | `rgba(44,196,154,0.14)` |
| `content-ink` | `#E2684F` (vermilion lifted — this is what `ink()` already does) |
| `story` | `#C8825C` |
| `practice` | `#6D9BE8` |
| `success` | `#34D399` (keep) |
| `warning` | `#F0A93B` |
| `weak` / `error` | `#F87171` (keep) |
| `reward` | `#E3B24E` |
| `locked` | `#4A524E` |

**VISUAL ONLY.** The existing `ink()` / `pinyinInk()` / `color-mix` machinery
already solves accent-on-dark correctly; the new palette plugs into it.

---

## 5 · Typography system

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

## 6 · Shape, surface and elevation

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

## 7 · Buttons and controls

| control | height | radius | type | rest | pressed | disabled | dark |
|---|---|---|---|---|---|---|---|
| **primary** | 52 | `r-ctl` | `label` 15/700 | `primary` fill, white text, `shadow-1` | `primary-pressed`, scale .985, shadow removed | `surface-3` bg, `text-faint`, no shadow | `primary` (lifted), text `#0C0F0E` |
| **secondary** | 52 | `r-ctl` | 15/600 | `surface` + `border-strong` | `surface-2` | as above | `surface-2` + `border-strong` |
| **ghost** | 44 | `r-ctl` | 14/600 | transparent, `primary-ink` text | `primary-soft` ground | `text-faint` | `primary` text |
| **destructive** | 52 | `r-ctl` | 15/700 | transparent, `error` text, `error` border | `error` at 8% ground | — | `error` lifted |
| **icon button** | 44×44 | `r-pill` | — | `text-muted` glyph | `surface-2` ground | 40% opacity | same |
| **chip (selectable)** | 36 | `r-pill` | 13/600 | `surface` + `border` | — | — | `surface-2` + `border` |
| chip **selected** | 36 | `r-pill` | 13/700 | `primary-soft` + `primary` border, `primary-ink` text | — | — | `primary-soft` + `primary` |
| **segmented** | 40 | `r-ctl` (track `r-ctl`, thumb `r-sm`) | 13/600 | track `surface-2`, thumb `surface` + `shadow-1` | — | — | track `surface-2`, thumb `surface-3` |
| **list row** | 54 min | 0 (inside a `grouped`/`raised` container) | title `title-card`, sub `caption` | `borderTop: 1px border` except first | `surface-2` | `text-faint` | same |

Every interactive target ≥44px in at least one axis and ≥44 in both where it is
the primary action — which the app already satisfies everywhere measured.

**COMPONENT REFACTOR** — these want to be real components (`Button`,
`Chip`, `Row`), which the repo currently does not have; today each screen
re-declares them inline. This is the single highest-leverage refactor in P14 and
it is what makes screens 5–10 cheap.

---

## 8 · Custom icon art direction

**The most important section, because it is the biggest gap (§1.3) and the
cheapest identity win: 77 generic line icons today, 5 custom.**

### The art direction

- **Silhouette first.** Each icon must be recognisable as a solid black shape at
  24px before any tone is added. If it needs three tones to be legible, the
  silhouette is wrong.
- **2–4 tones per icon**, no more: a base, a shadow (base darkened ~18%), a
  highlight (base lightened ~22%), and optionally one accent. Flat fills, no
  gradients except a single subtle top-to-bottom on the base where it reads as
  a curved surface.
- **One light source, top-left, always.** Highlight on the top-left facet,
  shadow on the bottom-right, and a soft contact shadow under the object only
  where the object sits on something.
- **Slight isometric tilt** for objects with volume (cards, books, boxes) —
  around 10–15°, never a full isometric grid. Flat-on for symbols (tones,
  strokes).
- **Rounded geometry**, 1.8–2.5px corner radii at 24px, matching `NavIcons.jsx`'s
  existing family rules — that file is already the style guide for this.
- **No photorealism, no bevels, no glass, no long shadows.** "Clean mobile-game
  object", as you put it: think a well-made board-game piece, not a 3D render.
- **Two states**: `inactive` (single tone, `text-muted`) and `active` (full
  dimensional treatment). This matters — a dimensional icon in every row would
  be visual noise; dimension marks *the current thing*.
- **Designed at 32px, verified at 24px and 20px.** Anything that dies at 20px
  gets simplified, not shrunk.

### Concepts

| icon | concept |
|---|---|
| **Home** | A tiled roof over an open doorway — a dojo gate, not a house. Reads Chinese-architectural at 24px; roof is the silhouette. |
| **Cards** | Two stacked cards, slight tilt, front card carrying a single brush stroke. Already the right idea in `NavIcons`; give it a face and a tone. |
| **Stories** | An open book whose right page carries a small painted scene (two colour fields, no detail). Distinguishes "story" from "reference". |
| **Practice** | Three小 stacked blocks / a rack of drill tiles — the P8 decision (a grid, not a bullseye) with volume. |
| **Profile** | A seal stamp (印章) — a rounded rectangular block with a carved face. Far more distinctive than a person glyph, and deeply Chinese. |
| **Listening** | A bell with one sound arc, not a speaker cone. Warmer, and it avoids the "mute" ambiguity. |
| **Writing** | A brush held at an angle over a paper edge, with one wet stroke below it. |
| **Grammar** | Two joined blocks with a connector — structure, literally. Avoid the "book" metaphor (that is Stories). |
| **Tones** | Four brush marks in the four tone contours (ˉ ˊ ˇ ˋ), the third one emphasised. Instantly Chinese; no other app owns this. |
| **Stroke order** | A single 一→十 form with a numbered ghost stroke and a small arrow. |
| **Weak words** | A card with a chipped/cracked corner and a small amber mark. Not a warning triangle — the object itself shows wear. |
| **Level test** | A sealed scroll with a gold band. The band is the reward colour; a broken band = passed. |
| **Streak** | *We do not have streaks and are not adding them.* Use for **"days studied"** only: a row of small filled tiles. **PRODUCT CHANGE if it becomes a streak — out of scope.** |
| **Progress** | A jade ring with a notched arc, not a percentage donut. |
| **Story unlock** | A padlock whose body is a book spine, opening — plus one gold spark. Locked = single desaturated tone. |

Format: **SVG, hand-authored, one file per icon** in a new `src/icons/`
directory, following `NavIcons.jsx`'s conventions (24×24 viewBox, optical
centring, `currentColor` for the single-tone state, explicit tones for active).
**COMPONENT REFACTOR** to introduce; **VISUAL ONLY** per swap.

**Do not generate assets yet** — noted. The Higgsfield pipeline is a poor fit
for 24px UI icons anyway; these should be drawn as SVG paths, not generated as
raster art.

---

## 9 · App icon direction

### Current state, audited

`ios/App/App/Assets.xcassets/AppIcon.appiconset/` contains **one image**
(`AppIcon-512@2x.png`, 1024²) and its `Contents.json` declares **no
`appearances` entries** — so there is no dark variant and no tinted variant.
The mark is a vermilion brush ensō on a `#FAFAF8` near-white ground.

**Why it looks flatter and weaker than its neighbours:**
1. **It is genuinely flat** — one vermilion, no gradient, no inner shadow, no
   highlight, no dimensional construction of any kind. Every iOS icon beside it
   on a home screen has at least a soft gradient and an implied light source.
2. **The ground is near-white**, so on most wallpapers it reads as a bright empty
   square with a small mark in it, rather than as an object.
3. **It is a ring, and rings lose their content at small sizes.** The interior is
   ~45% of the tile and it is empty. At 40px the brush texture — fine bristle
   streaks, the small speckles at 10–11 o'clock — is entirely gone, and what is
   left is "an orange-red circle".
4. **There is nothing Chinese about it.** The ensō (円相) is *Japanese Zen*
   iconography. For a product that is exclusively HSK Chinese and has frozen its
   Japanese track, the brand mark is borrowed from the wrong tradition. This is
   worth saying out loud even though it is uncomfortable, because it is the
   strongest argument for direction B or C.

**Why dark mode changes its appearance:** because no dark appearance is
declared, iOS derives one. With a light ground it will either keep the bright
square (jarring on a dark home screen) or auto-treat it in a way nobody chose.
The tinted appearance is worse: tinting maps luminance to a monochrome ramp, and
a thin vermilion ring on near-white becomes a faint outline on grey.

**What must stay recognisable:** the circular gesture and the vermilion. Those
two together are the equity; the brush texture is not (it is invisible at size).

### Three directions

**A — refined ensō.** Keep the ring. Rebuild it as a dimensional object: a
thicker brushed ring with a real inner and outer edge, a top-left highlight along
the stroke, a soft contact shadow inside the ring's lower-right, on a warm
ink-dark ground (`#16100E`) rather than white. Texture simplified so it survives
at 40px.
*Silhouette:* ring. *Colours:* vermilion `#B83A24` → `#E2684F` highlight on dark
ground. *Pros:* zero brand risk, cheapest, fixes flatness and dark mode. *Risks:*
still a ring (weak at small size), still not Chinese, still generic-adjacent —
"red circle" is a crowded space.

**B — dojo/hanzi mark. ← recommended.** A single bold hanzi form inside the
circular gesture: **学** (to learn) or **口** (mouth/enclosure, and the radical
that reads as a gate). The ring becomes a brushed enclosure around the character
rather than the subject itself.
*Silhouette:* filled circle with a carved character. *Colours:* vermilion
character on jade-dark ground, or jade character on ink ground — a chance to
introduce the new palette at the front door. *Dimensional treatment:* the
character is a raised brushed form with a top-left highlight and a cast shadow on
the ground; the ground carries a very subtle radial. *Pros:* unmistakably
Chinese-learning; fills the tile at every size; carries both brand colours;
survives tinting (strong luminance separation). *Risks:* a hanzi in an app icon
is a category convention, so it needs a distinctive letterform and enclosure to
stand out; also non-Chinese-readers cannot decode it (acceptable — they are not
the audience).

**C — abstract brand mark.** A jade seal-stamp block (印章) with a carved
negative-space form that reads as both a brush stroke and a "D"/dojo gate.
*Silhouette:* rounded square block. *Colours:* jade `#0E7A63` body, `#2CC49A`
top facet, vermilion carved face. *Pros:* strongest App Store recognisability,
fully ownable, most dimensional, best at 40px. *Risks:* discards the existing
ensō equity entirely; more design iterations to get right; risks reading as a
generic app tile if the carve is not distinctive.

### The four iOS 18 appearances — plan all of them explicitly

| appearance | plan |
|---|---|
| **Default** | Full colour on a warm ink-dark ground. Dark ground, not white — it is the ground that makes an icon read as an object. |
| **Dark** | Same mark, ground deepened to `#0C0F0E`, accents lifted (~+12% luminance) so the mark holds against a dark wallpaper. Authored, never derived. |
| **Tinted** | Authored greyscale with deliberate luminance separation: mark at ~85% white, ground transparent-to-dark. iOS applies the user's tint to *our* ramp, so the ramp must be designed. |
| **Clear** (visionOS/iOS 18 "clear") | Silhouette-only version — a single flat form, no interior detail, no texture. This is the one that proves the silhouette rule from §8. |

Also required for a store release: the Play Store adaptive icon needs a separate
foreground/background pair (the current `maskable-512.png` is a single flattened
image and will be cropped by any mask shape).

**DO NOT IMPLEMENT YET** — noted.

---

## 10 · Bottom navigation — three concepts

Same five destinations, same architecture (`navConfig.js`, `navStack.js`,
`MobileNav.jsx`). Nothing about routing, tab state or Back changes. **VISUAL
ONLY** for all three.

**A — floating pill bar (HelloChinese-adjacent).**
Height 60 (+ safe-area below the bar, not inside it). Horizontal inset 12px.
Radius `r-hero` 26 all four corners. Solid `surface`, no blur, `shadow-2`.
Active: dimensional icon + `primary` label 10.5/800. Inactive: single-tone
`text-muted` glyph + `text-faint` label. Cards keeps its shell, restyled as a
jade `primary-soft` rounded square that fills with `primary` when active.
Light/dark: solid surface both; dark gets `border` at 1px to separate from `bg`.
*Custom icons:* ideal — the floating bar gives each glyph its own quiet ground.

**B — native iOS-style bar.**
Height 56 + safe-area, full-bleed, radius 0, `surface-glass` + blur, 1px hairline
top. Essentially today's bar with the new icons and type. Active: filled glyph +
`primary`. Inactive: outline + `text-muted`.
*Pros:* most familiar, zero risk, cheapest. *Cons:* it is the current bar, and
"looks like every other app" is the problem we are solving.

**C — inset tray with a raised Cards key. ← recommended.**
Height 62 + safe-area. Inset 10px. Radius 22 (`r-card`+4). Solid `surface`,
`shadow-2`, and a 1px `border` in both themes so the tray reads as a physical
object on the page. Four tabs at even weight; **Cards sits in a jade key** — a
44×36 `r-ctl` block with a real top facet (`primary` → `primary-pressed`
vertical) and a 1px inner top highlight, so it reads as a *pressable key* rather
than a tinted rectangle. Active tab: dimensional icon, `primary` label. Inactive:
single-tone glyph, `text-faint` label. Labels always on.
*Why this one:* it is the smallest change that gives the bar an identity, it
keeps the P8 device-approved decision that Cards is the primary destination and
strengthens it *visually* rather than structurally, and it is the treatment
custom dimensional icons look best in. It also avoids the full-bleed-glass idiom
without going as far as A's fully-floating pill, which on a 320px screen costs
real width.
*Risk:* an inset tray leaves a strip of page visible below it; that strip must
not look like a bug. Requires the page background to be intentional at the very
bottom of every screen.

---

## 11 · Screen transformation plan

| screen | before | after |
|---|---|---|
| **Home** | Functional, correct hierarchy, flat maroon hero, translucent CTA, seven empty grey week pills, 4px progress bar, sage FAB. | Jade primary action as a solid dimensional key; hero ground given real depth and a drawn ink-wash; week rendered as small ink tiles that read as marks-on-paper; progress as a segmented jade track with the level as a destination; story hand-off shows real cover art at a size worth looking at; FAB adopts the palette. |
| **Study** | The best screen. 5 type styles, functional colour. | Token adoption only — radii, grade palette, type roles. No composition change. Frozen behaviour. |
| **Session Complete** | Correct structure, three stacked greys, nested tint-on-accent CTA, no celebration. | One dimensional celebration mark (jade + gold), tally as typography on the page rather than boxes-in-a-box, single jade primary action, gold used once for the unlock. |
| **Stories** | Real art cropped 16:9→2:3, 36 surfaces, four alike sections, icon-on-wash fallback. | Art presented at its native composition and at a size that reads; sections differentiated by ground and rhythm, not just headings; designed fallback covers; `% known` kept exactly as approved. |
| **Reader** | Good typography, generic chrome. | Paper ground, ink chrome, custom back/settings glyphs, jade progress. Mechanics untouched. |
| **Practice** | Structure approved and frozen; 32 lucide strokes. | Same rows, custom dimensional drill icons, jade counts, quieter tool family. Nothing moves. |
| **Profile** | Three identical white cards; chart-like known-word map; destructive card loudest. | Grouped rows on the page instead of stacked cards; the known-word map redrawn as one deliberate ink-and-jade readout; destructive de-emphasised to a quiet row with the confirmation carrying the weight. |
| **Onboarding** | Frozen, device-approved, already near the target type scale. | Token/type/icon inheritance only. No composition change. |
| **Auth** | Photographic wash + plain white card + underlined tabs. | Ink ground, one raised card, segmented control instead of underlined tabs, jade primary, provider rows as proper secondary buttons. |

---

## 12 · Implementation order

Your order is close. Two changes, both dependency-driven:

1. **P14-0 — token layer** (`colors`, `radius`, `elevation`, `type`). Fix the
   three defects in §2.2 here. Nothing visual ships yet.
2. **P14-1 — control components** (`Button`, `Chip`, `Row`, `Segmented`,
   `IconButton`). **Moved ahead of navigation.** The repo has no button
   component; every screen re-declares one inline. Nav, Home, Study and every
   screen after them all consume these, so building them second makes steps 3–10
   dramatically cheaper — and building them later means restyling the same
   buttons twice.
3. **P14-2 — global typography and surface sweep.** Mechanical, wide, low risk,
   and it is what makes the app feel coherent before any screen is redesigned.
4. **P14-3 — custom icon system.** **Moved ahead of the bottom bar.** The bar's
   whole visual identity depends on the icons; restyling the bar first means
   choosing its treatment against placeholder glyphs and then re-tuning it.
5. **P14-4 — bottom navigation** (concept C).
6. **P14-5 — Home.**
7. **P14-6 — Study** (token adoption only).
8. **P14-7 — Session Complete** (grouped with Study; it is the same flow).
9. **P14-8 — Stories** + the cover-art aspect decision.
10. **P14-9 — Practice** (icons + colour only).
11. **P14-10 — Profile.**
12. **P14-11 — Auth**; onboarding inherits and is verified, not redesigned.
13. **P14-12 — loading / empty / error states.** Cheap once the system exists,
    and currently the weakest category in the app.
14. **P14-13 — motion and haptics.** Last, as you had it.
15. **App icon** runs in parallel from the start — it needs the most iteration
    and blocks nothing.

**One sequencing warning:** the visual baselines in
`tests/e2e/visual.spec.js-snapshots` will go stale at steps 3, 4, 5, 8 and 10.
Each of those needs a `visual-baseline.yml` dispatch after it lands
(`docs/RELEASE-CHECKLIST.md` §1), and the baselines are CI-owned — never
regenerate them locally.

---

## 13 · Product vs. visual, marked

**VISUAL ONLY** — palette, type scale, radii, elevation, icon swaps, nav
treatment, app icon, hero depth, week tiles, progress rendering, reader chrome,
auth composition, loading/empty/error art.

**COMPONENT REFACTOR** — the token modules, `type.js`, the control components,
`src/icons/`, extracting inline button styles. Behaviour-preserving; each needs
its own spec.

**PRODUCT CHANGE — backlog, not P13/P14:**
- A HelloChinese-style lesson path / node progression (explicitly out of scope,
  as you said).
- Streaks, currencies, XP, rewards-as-mechanics. Note: CLAUDE.md §1 removed
  streaks and XP *on purpose*; a "streak" icon in §8 exists only as a
  days-studied readout.
- The story cover **aspect** decision. Re-cropping or re-generating 204 covers,
  or changing the poster aspect, changes what the shelf *is*. It needs its own
  decision and possibly a content run.
- Making the known-word map a real chart with more data.
- Anything that adds a screen, a tab, or a new number to a screen.

---

## 14 · Risks

1. **Jade vs. vermilion is an identity decision, not a palette task.** §3
   recommends keeping both with separated jobs. If instead jade *replaces*
   vermilion, `languageTheme.js`, `heroGround`, `ink()`, the card status band and
   the app icon all change meaning at once, and the per-language architecture
   (CLAUDE.md §1) needs rethinking. Decide this before P14-0.
2. **A token sweep touches every screen, including four frozen ones.** Home,
   Stories, Practice, Profile and onboarding are device-approved. A token change
   *will* alter them. The freeze has to be read as "no composition changes",
   with a device pass after the sweep — otherwise P14-2 is untestable.
3. **Custom icons are a real design workload** — 15+ glyphs, two states, three
   sizes, drawn as SVG. Underestimating this is the most likely way P14 stalls
   half-migrated, which would look worse than either the before or the after.
   Ship them in complete families per surface (all five nav glyphs, then all
   Practice glyphs), never one at a time.
4. **Warming the neutrals changes every screen's ground.** `#FAF9F6` vs today's
   `#FAFAF8` is small on paper and total in effect. Worth a device round on its
   own before anything is built on top of it.
5. **Dark mode is currently unaudited by render** (§0.3). Do the sweep before
   designing the dark palette's finer points.
6. **The 13 stale-baseline moments** in §12 — each is a place where a red
   Playwright run means nothing and a real regression could hide.
7. **Scope creep from "polish" into "features"** is the risk this document's §13
   exists to prevent. Re-read it at the start of every P14 commit.

---

## 15 · What must explicitly NOT change

- **Navigation architecture** — `navStack.js`, `navLedger.js`, `TabHost.jsx`,
  per-tab stacks, deep-link seeding, Android Back, scroll restoration. Visual
  only, on the bar itself.
- **Onboarding** — the P12 flow, all 14 states, the sandbox, the gate, Skip, the
  funnel events. Inherits tokens; composition frozen.
- **Study behaviour** — the queue, FSRS, grading, undo, the session mix, the
  first-run cap. `Study.jsx` is not reopened.
- **Home structure** — the hero + one supporting surface composition (P10-C3,
  device-approved). Its *treatment* changes; its *structure* does not.
- **Stories structure** — the one-page shelf, its sections, series units, the
  `% known` on artwork.
- **Practice structure** — the P11 hero + drill list + level-test row + tools,
  the uneven hints, counts as typography.
- **Profile structure** — the single progress panel, the weak-word list, the
  control rows.
- **The frozen non-Chinese tracks** — untouched, as always.
- **Every rule in CLAUDE.md §5–§7** — semantic tokens for neutrals, `color-mix`
  tints, `ink()` for accent-as-text, one lit panel per screen, no Tailwind
  classes, no TypeScript, and the Supabase safety rules.
- **No streaks, no XP, no guilt.** The visual language gets more energetic; the
  product's promise does not change.
