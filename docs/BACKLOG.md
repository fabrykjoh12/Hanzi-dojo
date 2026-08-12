# 🛠️ Engineering backlog

Granular fixes, tech-debt, and ops tasks. **Internal — not community-facing.**
The public plan lives in [`ROADMAP.md`](../ROADMAP.md), which auto-posts to the
`#roadmap` Discord channel; keep raw bug detail and dashboard-only steps here so
that stays clean. Move items to **Done** as they land (or promote user-facing
ones to the roadmap).

Active milestone, task assignments, ownership boundaries and merge order live in
[`docs/PM-BOARD.md`](PM-BOARD.md) (not Discord-synced). This file stays the
long-lived engineering backlog; the board holds short-lived execution state.

## P14-5 — Home restyled; what it left (2026-08-12)

- **Three heroes were drawn and two were rejected on rendered evidence.** A
  burgundy-ground variant (vermilion appearing only as light) was handsome and
  demoted the brand — the ground stopped being #B83A24, which CLAUDE.md §1 makes the
  anchor. A two-plane "folded" variant put the count on a lit upper face and the CTA
  on a shaded lower one; the structure was the most meaningful of the three and it
  cost 28px of height for a lower face that ended up mostly empty. Both are worth
  re-reading if Home ever gets taller: the fold in particular would suit a hero that
  has more than one thing to say.
- **A brush-stroke object (一) was drawn and is not shipped.** `heroObjects.jsx`
  documents where it went. The deck's own 撇 is already the hero's ink element, and a
  second mark on the one object the screen is about is decoration. It comes back the
  day a heading wants an atmospheric mark — which the P14-5 brief invited and Home
  did not need.
- **`material="wash"` is still the default on `HeroPanel`.** Stories, Practice and
  Profile are frozen and keep the ink ridgelines plus a watermark character. Whichever
  phase unfreezes them should flip the default and delete the prop, not add a third
  material.
- **The supporting surface is at its limit.** It holds three rows and two hairlines,
  which is what P10 approved. Home's next addition — if there ever is one — does not
  fit there without either a fourth row (making it a list) or a second surface (making
  it a dashboard). That is a product decision, not a visual one.
- **`p14-home.spec.js` is a harness, not a contract.** Gated on `P14_HOME` so CI never
  runs it; it writes the render matrix and a measurement dump (page height in
  viewports, every drawn box, every leaf text's size/weight, every target under 44px).
  Use it for the next screen rather than writing a second one.
- **My own box-counter conflates marks with containers.** It reported "13 → 23 drawn
  boxes" on Home, which sounds like ten new cards and is ten goal pips, ten progress
  segments and seven week dots — all 4–10px marks. The containers are unchanged: one
  hero, one supporting surface, one CTA, one cover. Worth teaching it the difference
  before quoting it again.

## P14-4 — the tray shipped; what it left (2026-08-12)

The bottom bar is an inset floating tray with the dimensional family on it. Numbers,
reasoning and the surface treatment are in `docs/ARCHITECTURE.md`; this is what a
later phase inherits.

- **`NavIcons.jsx` is nearly dead.** Nothing imports `HomeIcon`, `StoriesIcon`,
  `CardsIcon` or `PracticeIcon` any more — `navConfig.MOBILE_PRIMARY` derives from
  `navGlyphFamily.NAV_GLYPHS`. `MoreIcon` also has no reader now. The file is left in
  place on purpose: it is the flat family that passed two device reviews, and
  deleting it before the tray has been on a physical phone would throw away the only
  thing to fall back to. **Delete it once P14-4 passes device QA**, along with
  `navEmphasis`'s references to it in comments.
- **The More sheet's top radius is 22px, the tray's is 18.** The sheet rises out of
  the tray and should hinge on the same corner. Not changed in P14-4 because the
  brief froze More-sheet behaviour and CLAUDE.md §5 claims every sheet is already
  `18px 18px 0 0` — which is true of the other four. One-line tidy, needs a look at
  `designSystem.guard.test.js`'s sheet-radius check first.
- **Motion is the minimum.** The tray transitions colour, background and box-shadow
  at 180ms and nothing else; there is no selection animation, no icon movement, no
  haptic beyond the existing `tapFeedback()` on a tab change. **P14-13 owns motion
  and haptics** and should decide whether the dimensional glyph earns a transition
  between its flat and lit states (it cannot cross-fade two SVG trees for free).
- **`.hd-tab-icon` is now unused CSS.** `index.css` still carries
  `.hd-tab-icon { transition: transform 220ms … }` and
  `.hd-tab.is-active .hd-tab-icon { transform: translateY(-1px) }`, but no element
  has the class — MobileNav never applied it. Left alone in P14-4 (it changes nothing
  either way); it belongs to whatever P14-13 decides about selection motion.
- **The tray does not adapt to a very short landscape phone.** At 390×390 the
  reservation is still 66px of a 390px viewport. Nothing breaks — the nav-tray spec
  covers 320/390/430 portrait and `geometry.spec.js` covers the landscape case for
  content — but a landscape-specific tray height was not considered and probably
  should be if landscape ever stops being portrait-locked (it is locked today,
  CLAUDE.md §1).
- **The tray's columns are subpixel-unequal, by construction.** `viewport − 2×12 −
  2` is not divisible by five at most phone widths, so a flex remainder exists and
  each engine distributes it its own way. Measured: identical fractional widths on
  the sandbox's Chromium at 320/360/375/390/412/430, two values differing in the
  second decimal on the CI runner. The specs now assert a ≤0.5px spread. If a future
  phase wants exactly equal columns it has to stop using `flex: 1` — a grid with
  `repeat(5, 1fr)` has the same remainder — which means integral insets per width,
  i.e. a media query, which is not worth it for a fraction of a pixel.

- **`visual.spec.js` did not notice the tray, and that is a comparator finding.**
  The CI baseline job ran on the P14-4 commit and committed nothing: all five
  baselines matched. `stories-shelf-mobile` is 390×844 and DOES contain the bar, so
  the reason it passed is Playwright's default per-pixel `threshold` (a normalized
  colour distance of 0.2) — the old translucent bar composited to about #FFFFFE and
  the new tray/page-ground pair is #FFFFFF on #FAF8F5, a per-channel step of 5–9,
  which the comparator treats as identical. Only the icons and labels moved enough
  to count, and that is well under the 2% `maxDiffPixelRatio`. Nothing in the repo
  is stale — but **visual.spec.js is not evidence that the shell looks right**, and a
  future phase that expects it to catch a surface change should tighten `threshold`
  for the mobile shots rather than assume silence means no change.

- **Study leaves the navigation's reservation blank while the bar is hidden.**
  Measured at 390×844 with a card on screen: the tray is hidden (the NAV-MODEL
  §8.2 exception), `main`'s padding is 0, and the card shell is still
  `100dvh − reserve` = 778px — so 66px of the viewport is empty below the grade
  band, and the document does not scroll. Pre-existing (58px before P14-4, which
  widened it by 8), and the fix belongs to a Study phase, not a tray one:
  `studyLayout` already takes `reservedBottom`, and Study already knows whether it
  is immersive, so it is a one-line change — but it makes the flashcard 66px
  taller, which is a large visible Study change and needs its own device round.

- **`--surface-glass` has two consumers left**, both non-mobile: `Sidebar.jsx`
  (the desktop rail) and `Dashboard.jsx` (the admin analytics header). The tray was
  its third and the only one a learner on a phone ever saw. Whether frosted glass
  survives on desktop is a P14-x question, not a dangling reference.

## P14-3 — the icon family, and what it did NOT do (2026-08-12, amended)

Six dimensional glyphs exist (`src/navGlyphs.jsx`), visible only in `/dev`. The
rules and every rejected concept are documented in the file itself; this is the
list of things a later phase has to pick up.

**The navigation architecture is settled and is NOT P14-4's to change.** The bar is
Home · Stories · **Cards** · Practice · **More**, Cards centred, and Profile is
reached through the More sheet exactly as it is today. `navGlyphFamily.js` keeps
`NAV_GLYPHS` (the five) apart from `IDENTITY_GLYPHS` (Profile) so a tray cannot
install Profile as a tab by accident, and two specs assert it — including one that
opens the real More sheet and finds Profile in it. If Profile is ever promoted to a
tab that is a product decision with its own phase, and it starts by answering
"where do Settings, the level test, Words and Dictionary go".

**P14-4 owns the handover.** `MobileNav.jsx`, `NavIcons.jsx`, `navConfig.js` and
`navEmphasis.js` are untouched by P14-3 — deliberately, since the tray and its
icons have to change in one commit or the bar ships half a redesign. Two things
have to be decided there, not before:

- **Whether to adopt `NAV_GLYPH_PX`.** The glyph drawings are now all one weight
  (136–145 px² of ink at 22px), so the bar's whole visual hierarchy comes from the
  size table. `NAV_GLYPH_PX` in `navGlyphFamily.js` is the ramp the family wants —
  Cards 26 · Stories 24 · Practice 23.5 · Home 23 · More 22, which measures Cards
  203 · Stories 168 · Practice 165 · Home 149 · More 140 px², a 1.45× spread with
  Stories and Practice at 81–83% of Cards (P8's device-approved relationship).
  `NAV_ICON_PX` in `navEmphasis.js` is what the bar uses and is steeper: 27.5 down
  to 20 is 1.89× in area on its own, and lands Stories at 62% of Cards. Adopting
  the gentler ramp means editing `navEmphasis.js`, whose `navColumnHeight()` test
  pins the column sum to `MOBILE_NAV_HEIGHT` — 26 still fits the 34px icon row, but
  check the test rather than assuming.
- **Where the accent goes.** Only Stories carries one (a plum ribbon). Practice's
  `--blue` was drawn and removed: a small inset inside a tile reads as an
  unread-notification badge at 20px, and a whole tile in blue makes Practice look
  like a different app's icon. If Practice is to have an accent it belongs in the
  tray, not in the glyph.

**Not drawn, on purpose (the brief's "keep the scope narrow"):** Listening,
Writing, Grammar, Weak Words, Level Test; reward and story-unlock artwork; the app
icon; any animation or haptic on selection.

**Only Inter 300/400/500/600 are bundled** (`src/fonts.js`), which P14-2 measured:
every requested weight ≥550 matches 600 and renders identically, 550 through 900
drawing the same string at the same width. The five-weight allow-list is therefore
honest about what the screen shows, but **700 and 800 are synthetic emboldening of
600**, not real cuts — a display title at 800 is the browser smearing a semibold.
Adding Inter 700 (and possibly 800) as bundled weights is a real visual-quality
win for `TYPE.display` / `TYPE.titleScreen` / the eyebrow, and it is a **font-asset
change**: bytes in the bundle, a `src/fonts.js` edit, and a re-measure of the
weight allow-list. Not a P14-3 change; do not touch the assets to "fix" a weight.

**`tutorialScript.test.js:402` is flaky.** It samples 40 rolls of `previewLabels`
and asserts one lands within ±1 day of the pinned interval — FSRS fuzz is random,
so it can miss. Seen once in five full-suite runs during P14-3 (green the other
four); unrelated to any P14 change. Fix by seeding the fuzz or widening the band.

**The More glyph is close to a hamburger, and that was the choice.** Three raised
slabs beat three raised lacquer dots and a three-dot plaque, both measured: the
dots ink **56 px² against the family's ~140** and their facets come out half a
device pixel, so they render flat while everything around them is dimensional
(dots are small — that is structural, not tuning); the plaque reads as a CHAT
bubble with a typing indicator at every size. If a later phase wants something more
Hanzi-Dojo-specific for More, the constraint to beat is 140 px² of ink in a ~19×21
silhouette with details no finer than 1.4 units — which is why the obvious answers
lose.

## P14-2 — what normalization deliberately did NOT touch (2026-08-12)

The censuses after P14-2: **weights 12 → 5** (628 uses), **sizes 42 → 34** (925),
**radii 26 → 13** (491), **shadows 44 → 15** (85). What is left is left on
purpose, and each has a reason a per-screen phase has to weigh.

**Typography — the 18–25px band has no scale step.** The scale jumps 17 → 26, and
the app has 18/19/20/21/22/24/25 across ~67 uses (section headings, drill titles,
recap numbers). Snapping them means a 3–5px move on a heading, or the scale needs
a step at ~20. That is a design decision, not a sweep.

**`fontSize: 16px` carries THREE unrelated meanings** and cannot be snapped as one
value:
1. `CONTENT_TYPE.pinyin` is 16/600 — Speaking, Writer, WordLookupSheet, ChatMission.
2. **iOS input zoom.** A focused input below 16px makes WKWebView zoom the whole
   page. `Auth.jsx:454` and `Words.jsx:157` both carry the comment. Six inputs
   depend on it. **Never lower these.**
3. Card titles at 16/700 — the only ones that could move, to 15 or 17.

**`fontSize: 11px` splits two ways** (30 uses): uppercase eyebrow variants whose
*tracking* would have to move with the size, and plain small meta that wants
`caption` (12).

**The eyebrow is 40 sites and 25 distinct recipes** — sizes 10.5–15, weights
700/800, tracking in em AND px (0.03–0.14em, 0.3–0.8px). All of them are plainly
`TYPE.eyebrow` semantically. They were NOT snapped because size and tracking move
together: a 12px/0.3px label becoming 10.5px/0.14em gains ~1.2px of tracking per
character, so a 12-character label grows ~14px wider — which overflows a `nowrap`
row. This is the single biggest remaining type win and it needs per-row width
checks, not a regex.

**`fontWeight: 500` stays** (24 uses). Unlike 650/750/850 it is a real loaded face
that renders distinctly, and most of its uses are content: a 110px Cyrillic
letter, a 22px word option in the reader's own face.

**Radii kept, with reasons:** `3/4/5/6px` (35 uses) are below the scale's floor —
progress bars, dots, tiny tints, and a 3px bar snapped to 8px visibly changes
shape. `34px` is Listen's 108px hero object. `StoryCover`'s `radius = 14` default
is **Stories poster geometry**, explicitly protected. `manhuaTokens` keeps
`PANEL_RADIUS 3 / NARRATION_RADIUS 2 / CARD_RADIUS 22` — a printed comic is not
drawn to a UI scale. `MobileNav`'s `'0 3px 3px 0'` is the active edge bar, and
`navEmphasis.CARDS_SHELL.radius` is nav geometry with a test on it.

**Shadows kept (11 of 15):** the selected-word ring (`0 0 0 1px`), the
not-started underline drawn as an inset (`inset 0 -2px 0`), the speaking-line
ring, Speaking's listening ring, TourOverlay's `0 0 0 200vmax` scrim, the
accent-tinted CTA glows (Listen, SessionRecap, SeriesDetail, Test), the two 22px
toggle knobs, StoryPoster's badge-over-artwork, and Sidebar's deliberately
fixed-dark tooltip. None of them is elevation.

**Accent-tinted shadows still use alpha-hex** (`accentHex + '1A'`, `+ '33'`,
`+ '3D'`), which does not theme. Converting them to `color-mix` is the same fix
P14-0 applied to Landing's pill — worth doing, but it is a colour change on a CTA
glow, so it belongs with the screen that owns the CTA.

**56 hand-rolled `--surface` + `--border` surfaces across 33 files** vs 4
`flatPanel()` callers. `flatPanel()` IS `SURFACE.raised` plus a lit top edge, and
P14-2 pointed its radius at the scale — but converting the other 56 would ADD that
lit edge to surfaces that do not have one, which is a visible change on 33 files
and edges into container work. Left for the per-screen phases; the count is the
tracker.

## P14-1 — what the shared controls CANNOT absorb (2026-08-12)

The five primitives exist (`controls.jsx`). Before P14-2 tries to migrate a
screen onto them, read this: it is the census's verdict on which existing
controls a small, stable API genuinely cannot hold. Each entry is a real
measured reason, not a hedge.

**Never — these should stay bespoke.** Absorbing any of them means re-exposing
the exact properties the token layer exists to own (size, radius, tint strength,
shadow, transform), at which point it stops being a component.

- **`Listen.jsx:219`** — 108×108, radius 34, accent tint + accent glow, 44px
  glyph. That is the drill's hero *object*, not chrome.
- **`Speaking.jsx:282`** — an 84px circle whose background flips accent →
  `#DC2626` and whose shadow flips from a cast to an 8px ring to mean
  "listening". The behaviour *is* the component.
- **`Flashcard.jsx:143`** — 48×40, and its content is the text `1.5×`. Wider than
  tall on purpose, so the three possible rate strings cannot reflow the audio row.
  An icon-only button cannot hold a numeric label.
- **`InfoTip.jsx:64`** — 18×18 with a `?` glyph, inline inside body copy. Growing
  it to 44 changes text line-height wherever it appears. Wants the
  `holdLayout()` treatment, not a component.
- **`Settings.jsx:452`** — not a row, a card that *reflows*: `settingsLayout.js`
  recomposes it at 480px and the control sits BELOW the description, never
  trailing. `Row` has one horizontal axis.
- **`Words.jsx:211`** — `display: grid` with a 110px desktop gutter so every
  headword's right edge aligns down the column, and two entirely different child
  trees for mobile vs desktop. A flex `Row` cannot produce that alignment.
- **`GradeRow.jsx`** — four device-dependent minHeights driven by
  `studyLayout.js`, on a frozen screen.
- **`MobileNav.jsx:174/195`** — frozen, and it needs an absolutely-positioned 3px
  active edge bar plus a per-item staggered `animationDelay`. Its column height
  must also sum to `MOBILE_NAV_HEIGHT` (58), which `navEmphasis.test.js` asserts.
- **`Sidebar.jsx:63`** — the 44px height is load-bearing, not a minimum:
  `EdgeBar` positions the sliding marker from `ROW_HEIGHT + ROW_GAP`.
- **`panels.jsx:90` `HeroAction`** — a `<span>` inside a `role="button"` panel.
  Making it a real `<button>` would nest one interactive element inside another.
  Home's most prominent CTA; frozen either way.

**Wants a sixth primitive later, not a prop on an existing one.**

- **A "card row"** — the app's most common list shape is *not* a divided row, it
  is a bordered radius-13/14/16/18/22 card per row with a gap between (13 call
  sites: Dictionary, Onboarding, Tones, Profile, Settings, Grammar,
  LanguageSwitcher, SessionRecap, FinishOverlay, SeriesDetail). Selection paints
  border + tint + sometimes a weight change. `Row` is the *grouped* model; this
  is the *object* model, and it deserves its own name.
- **A `Toggle`/switch** — `Settings.jsx:600` is 50×28 with `aria-pressed` where
  `role="switch"` + `aria-checked` belongs, and `StoryReaderImmersive.jsx:1767`
  has a second one. Two call sites, one wrong role, no shared component.

**Migrating these WOULD change something — deliberate, deferred to P14-2.**

- The house CTA is **radius 16 / weight 750**; `Button` is `RADIUS.control` (12)
  and `WEIGHT.label` (600). Every full-width CTA therefore changes shape and
  weight when migrated. That is the systematisation, and it is a visual change —
  so it belongs to a phase allowed to make one, on a screen at a time.
- **Five independent "primary + ghost" pairs** shadow `ui.jsx`: `SessionRecap`
  (54px), `Test` (52px + `flex:1`), `Landing`, `Writer`. Plus two byte-identical
  CTA style functions in `PublicStory.jsx:160` and `HowMuchCanYouRead.jsx:210`.
- **Most CTAs fill with `accentHex`, not `var(--primary)`** — the same value for
  Chinese today, different concepts per CLAUDE.md §5. `Button` standardises on
  the brand fill and takes no accent prop, so this is a decision each migration
  has to make explicitly.
- **Three files hardcode `#B83A24`** (`Auth.jsx:215/:235/:321`,
  `PasswordReset.jsx:84`), so those buttons never get dark mode's lift.
- **Alpha-hex tints that stay light in dark mode**, widespread on buttons:
  `accentHex+'10'/'2A'/'E6'` in Flashcard, AudioButton, Settings, SessionRecap,
  Test, StoryReaderImmersive, Words.

**Accessibility gaps the primitives close by default, once adopted:**
`<div onClick>` rows with no role or tabIndex (`LanguageSwitcher.jsx:69` and
others) become real buttons; unlabelled icon-only buttons become impossible
(`label` is required and guarded); 15 one-of-N controls with no `aria-checked`,
no roving tabindex and no arrow keys get all three; `GradeRow`'s four buttons
have no aria at all; `KnownWords.jsx:320` has neither `aria-pressed` nor a radio
role; `Onboarding` mixes `role="radio"` (line 219) and `aria-pressed` (236) for
two adjacent groups.

## P14-0 left these for the sweep (2026-08-12)

The foundation commit built the systems and adopted them where adoption could
not change visual meaning. Everything below is deliberately still on the old
values — **P14-2 is the phase that migrates them**, screen by screen, with the
render harness (`tests/e2e/p14-foundation-renders.spec.js`, `P14_SHOTS=1`) as
the before/after check.

The budgets in `src/designSystem.guard.test.js` are the tracker. Each is the
count measured at P14-0 and **may only go down**; raising one needs a reason in
the commit message.

| Budget | At P14-0 | What it counts |
|--------|----------|----------------|
| `HEX_BUDGET` | 70 | Distinct hardcoded hexes outside the token modules |
| `NEUTRAL_BUDGET` | 73 | Occurrences of a hex whose channels sit within 12 — a value that **cannot theme** |
| `SIZE_BUDGET` | 46 | Distinct `fontSize: 'Npx'` literals |
| `RADIUS_BUDGET` | 34 | Distinct `borderRadius: 'Npx'` literals |

Specific items, and why each one was left alone rather than swept:

- **`--hairline` survives as a deprecated alias**, with ~33 call sites still on
  it. Renaming the token *and* its uses inside a foundation commit would have
  been a 15-file behavioural diff. The alias is the seam. P14-2 removes it, and
  the guard already forbids using it in a `border`.
- **Neutrals that legitimately stay hardcoded** and should never be "fixed":
  `supabase.js` (the "site can't start" card renders before any CSS exists),
  `main.jsx` (the `theme-color` meta tag is a browser API, not UI),
  `shareCard.js` (canvas drawing for a share image), `NavIcons.jsx`
  (`#FFFFFF`/`#000000` inside SVG masks are not colours, they are mask values),
  `splashIntro.js` (paints before the app mounts).
- **Drill, story-tone, grade and manhua palettes** are their own token modules
  (`gradePalette.js`, `cardMarker.js`, `manhuaTokens.js`) and are excluded from
  the hex budget by design. They are *content* colour, not UI colour.
- **`Kana.jsx` keeps `#5C7155`** for its "lesson cleared" tick. That is a success
  colour on a frozen-track screen; remapping it would change visual meaning for
  no benefit. Recorded as the one documented sage exception in the guard.
- **`SURFACE`, `ELEVATION` and `TYPE` have no consumers yet.** They are defined
  and specified but nothing imports them — that is what P14-1/P14-2 do. Do not
  "clean up" the unused exports.

## Onboarding — three verified defects (found 2026-08-11, P12 audit)

**All three FIXED in P12-0 (2026-08-12), shipped in TestFlight build 41.**
The auth tab is an explicit decision now (`authEntryTab` in `prelogin.js`); the
tutorial-done record lives under its own durable key (`hd:tutorial-done`) with
old-key migration; hardware Back walks the pre-login flow through
`preloginBackAction` + `tutorialScript.retreat`, registered via the same
`backHandler` registry the shell uses. Kept below as the record of what they
were. Full evidence in [`docs/P12-ONBOARDING-AUDIT.md`](P12-ONBOARDING-AUDIT.md) §3.

1. **"Create account" opens the LOG IN form.** `Auth.jsx:20` sets the initial tab
   from `Boolean(intro)`, and `intro` was the old pre-signup wizard's prop.
   Nothing passes it any more (`Landing.jsx:199` is the only caller), so the tab
   is always Log in and the submit button always says "Log in". A learner who
   finishes the tutorial and taps **Create account** gets a login form, types
   credentials for an account that does not exist, and fails. This sits exactly
   where the funnel already loses half its accounts. `landing.spec.js:88` asserts
   only that an Email field is visible — true on both tabs, which is why it was
   never caught. **Two-line fix; highest priority in this list.**

2. **The Home tour's tutorial suppression can never fire.** `Home.jsx:135` passes
   `suppressed: isTutorialDone()`, which reads `prelogin:prefs` —
   and `Onboarding.finish()` (`Onboarding.jsx:149`) calls `clearPreloginPrefs()`,
   removing that whole key, before any new account can reach Home
   (`App.jsx:575`). Verified with a fresh-account profile: flag present → no
   dialog; flag cleared → "Step 1 of 4 — Start here each day". So a learner who
   just did the 13-state tutorial is then told in a dimmed overlay what today's
   session is. The clearing is itself correct (it fixed a lost reading-test
   estimate); the bug is that a device-scoped *teaching record* and a
   *transitional handoff blob* share one storage key. Fix: move the tutorial-done
   record to the `offline.js` prefs store where `tour.js` already keeps its own,
   reading the old key as a fallback.

3. **Android hardware Back quits the app during onboarding.** The whole pre-login
   flow (NativeWelcome → tutorial → Auth) is `useState` inside `Landing.jsx` at
   path `/`. No shell is mounted, so `runBackHandler()` returns null and
   `NativeShellBridge` falls back to `backAction('/', canGoBack)`, which
   short-circuits on `atRoot` and returns `'exit'`. Back on tutorial card 2 closes
   the app, unwarned, on the platform where Back is the primary gesture. Not
   destructive (the position resumes) but jarring.

Also found, and NOT a bug: `signup_started` / `signup_completed` fire only on the
email/password path (`Auth.jsx:61,72`), never for Google or Apple. That is why the
database shows 3 `signup_completed` against 32 `onboarding_started`. It means **we
cannot currently tell how many accounts arrive via OAuth.** Worth its own small
analytics commit, separate from any onboarding work.

## Re-tapping the active tab does not scroll to the top (found 2026-08-11)

One line, pre-existing, found while writing the P8 prototype's reselect test and
deliberately left alone there (reselect semantics were frozen for that task).

`useNavigation.js` restores a remembered scroll offset with `window.scrollTo`
(line 62) but `reselect`'s `scroll-top` branch calls `el.scrollTo(...)` on the
`[data-tab-root]` element (line 163). That element is `height: 100%` with no
`overflow` (`TabHost.jsx`), so it is not a scroller — the document is. The call
is a no-op: the tap zeroes the remembered offset and leaves the page where it
was, so "tap the tab you're on to go back to the top" has never worked on
mobile. NAV-MODEL §5.1 says it should.

Fix is to scroll the window, matching the restore path. It needs a test that
asserts the offset actually changes, which is what would have caught it.

## The study shell reserves a tab bar that is not there (found 2026-08-11)

Found while fixing the nav-height drift (P8 commit 2), and deliberately **not**
fixed there: it is a Study layout change, not a navigation one.

While a flashcard is on screen the tab bar is hidden (`tabBarVisible` →
`studyImmersive`), so `main`'s bottom padding is 0 — but `MOBILE_SHELL_HEIGHT`
still subtracts `MOBILE_NAV_HEIGHT`. Measured on `/study`: viewport 568, shell
510, document 568, bar absent. The bottom 58px (+ the home-indicator inset on a
real phone) is empty, on the most-repeated screen in the app and the one whose
whole geometry module exists to avoid a scroll.

The reservation is correct for the two states that *do* show the bar (the recap
and the paused screen, which is what the `+62px` measurement in `Study.jsx` was
about) and wrong for the card view. Fixing it means `studyLayout` taking the
bar's visibility as an input rather than assuming it, and re-checking the
density bands — a 568px phone would move from 510 to 568 available, which
crosses `COMPACT_MIN`. Worth doing; worth doing on its own, with device photos.

## P8 nav — DONE and FROZEN (approved on TestFlight build 35, `78cf09e`)

The bottom navigation is finished: `Home · Stories · Cards · Practice · More`,
Cards centred at index 2 with its container, five custom glyphs, 58px. **No
further changes without a concrete usability bug found in real use.** The full
approved spec is at the top of [`docs/SESSION-HANDOFF.md`](SESSION-HANDOFF.md);
the audit that got there is [`docs/P8-NAV-AUDIT.md`](P8-NAV-AUDIT.md); §B2 of
[`docs/MOBILE-DEVICE-QA.md`](MOBILE-DEVICE-QA.md) is now a regression checklist
rather than an open question.

The two bugs found *while* doing P8 and deliberately left are still open, at the
top of this file — the reselect scroll-to-top no-op and the study shell reserving
a bar that is not there. Neither is a nav-design change; both survive the freeze.

- ~~`MOBILE_NAV_HEIGHT = 62` over-reserves by 4.25px~~ — fixed. The bar's height
  is declared in `src/navMetrics.js` and the bar, `main`'s bottom padding, the
  study shell and the immersive reader's bottom offset all read it;
  `geometry.spec.js` now asserts the bar's height and position exactly rather
  than within ±8px, which is what let the drift hide.
- ~~The level test is reachable on mobile only through the More sheet~~ — fixed.
  It is a gated row on the Practice screen (`levelTestEntry` in
  `practicePlan.js`, `TEST_UNLOCK_MASTERY_PCT` vs `counts.masteredPct`) and is
  gone from `MOBILE_MORE`. The locked row is still openable on purpose:
  `Test.jsx` owns the real gate and also unlocks for anyone who already passed
  the level, which the Home counts cannot see.

One thing NOT to re-add without a fresh decision: the Cards waiting count in
`MobileNav`. It shipped for one build and was removed after the device review —
it made the bar read as a dashboard. `navBadges.js` survives and still feeds
Home and the desktop rail; only the bottom bar's caller went away.

## Onboarding rebuild — what is left after Commit 5 (2026-08-10)

The maze is gone (`docs/ONBOARDING-AUDIT.md`). Three things were deliberately
left standing:

- **The Home tour still exists, and still has four marks.** It no longer starts
  by itself for anyone who finished the tutorial, and Home now carries a single
  inline line — *Your first session is ready* — derived from the account having
  no cards at all. Settings can still replay the marks. Whether the four should
  survive at all is a decision to take after device testing, not before.
- **The Stories tour is down to two marks**: chapter one is free, and locked
  stories say what opens them. The reward mark went, because the tutorial ends
  with a session completing, a story unlocking and two lines of Chinese read out
  of it. Of the two that remain, the LOCK one is arguably self-explanatory — the
  shelf already prints the condition under each locked cover — but it prints it
  small, and nobody has watched a first-time learner read it. Keep it until
  someone has.
- **`/tutorial` stays.** Signed out it is the real first run; signed in it is a
  replay, same component and same script, one flag. The e2e suite drives the
  tutorial through it. It is not a second onboarding system and must not become
  one.

Not done, and deliberately: an Android pass over the new first run, and a
decision on whether the four Home marks earn their place.

## Build-30 device findings — the three that were fixed (2026-08-10)

Physical iPhone, TestFlight build 30. All three are the same shape of bug: a
thing that is correct on a web page and wrong in an app.

**1. A hidden card kept its voice.** An unfinished session, left via X and a tab
switch, came back to the Continue screen — and the pronunciation of the card
that had been open played behind it. Two independent causes:

- `<Activity>` tears effects DOWN on hide and runs them again on show. The
  autoplay effect's dependency was `[flipped]`, and `flipped` was still `true`,
  so a re-attachment was indistinguishable from a reveal. **This applies to
  every card-entry side effect anyone adds to Study, not just audio** — a
  persistent root means "the effect ran" no longer implies "something happened".
- Nothing in the condition asked whether the card was on screen. `flipped &&
  queue.length > 0` are both true behind the Continue screen.

Fixed by `studyAutoplay.js`: a reveal is identified by *which card* was revealed,
the identity is remembered in a ref (refs survive `<Activity>`, effects don't),
and nothing fires unless `cardPresented` — the same derivation the shell uses to
hide the tab bar. `useStudyAudio` now takes `presenting`.

**2. The card's status band was a light-mode colour at full strength.**
`TONE_NEW`/`TONE_DUE` are pale marks tuned for white paper; at `MARKER_HEIGHT`
across the full card width they stop being marks and become a lit surface.
`cardMarker.markerStripTint()` now mixes the marker's hue into `--surface` at
`--card-strip-mix` (55% light — byte-identical to before, 32% dark). **The rail
segments and the legend/pill dots deliberately still use the raw tones**: a
small pale mark on a dark ground is correct, and darkening a 7px dot would make
it disappear. If a device ever disagrees, that is a separate decision.

**3. P4 identified — the right-edge scroll indicator was the WKWebView's.** It
was never the Stories rail. The app shell scrolls the *document*, so the bar
belonged to WKWebView's own `UIScrollView` (and, on Android, to the WebView's
fading scrollbar). Hidden in the two native shells; `::-webkit-scrollbar` could
never have reached the iOS one. **Still needs device verification** — see
`docs/MOBILE-DEVICE-QA.md` §A. `Stories.jsx`'s `scrollbarWidth: 'thin'` is
untouched and remains an open, separate question.

## Home's cache migration — done (2026-08-10)

Measured on a production bundle against the authed E2E fixture, before: a Home
revisit cost **25 Supabase requests**, identically every time. After: **0**.
After grading a card: **4**, and only the counts. Keys, the event table and the
one surviving clock are in NAV-MODEL §3.2–3.3; the shape is `cacheEvents.js` +
`homeData.js` + `dataCache.js`. `homeRefresh.js` is deleted — it answered a data
question by looking at which route the learner came from.

What is left, deliberately:

- **A learner with no active series pays one extra round trip on a COLD Home
  load.** The daily-story card is fetched only when the reward teaser comes back
  empty, because Home renders `!rewardTeaser && daily` — so for anyone with a
  series going those four queries (one of which pulls every reachable story's
  full text) could never be shown. Making the two concurrent again would mean
  splitting `getDailyStoryCard`'s inputs so the shared half rides along with the
  reward context: ~2 queries saved on that one cold path. Not worth the seam
  until someone measures cold-start on a phone and finds it.
- ~~Resume-from-background~~ — done in the follow-up commit
  (`appResume.js` + `useAppResume.js`, NAV-MODEL §3.5).
- **Practice and Profile are the same job, unstarted.** Neither has been
  measured; both fetch in mount effects and both are persistent roots now.
  *(P10-B rebuilt what Profile SHOWS, and dropped two queries on the way — the
  lifetime-mastered scan and `reviewed_at` — but did not touch when it fetches.
  Profile still loads in a mount effect and still re-runs on every visit.)*

## `npm run build` emits the HQ page as the app's index.html (found 2026-08-10)

`dist/client/index.html` and `dist/client/hq.html` are both Dojo HQ after a
plain `npm run build` — the multi-entry build (`SITES_BUILD`) clobbers the app's
entry. Nothing shipping is affected: Vercel and `cap:sync` both use
`npm run build:public` (`DOJO_PUBLIC_BUILD=1`), which emits one correct
`index.html`. But `npm run build && vite preview` serves HQ at `/`, which makes
the default build unservable and cost an afternoon to notice.

## A covered tab pane kept its box (found and fixed 2026-08-10)

Found by measuring a bounding box during the covered-layer check, and it had
been shipping since the shell became persistent (Phase 2 commit 2).

`<Activity mode="hidden">` puts `display: none` on ITS OWN subtree — not on
TabHost's wrapper div, which is ours and carried `height: 100%`. So every hidden
tab pane kept a full-height empty box in the document flow, and every pushed or
presented screen rendered underneath it. Measured on `/words`: the covered
Practice pane was **3,714px tall**, and the screen the learner had just opened
started at y=3714 — a blank screen with the real one below the fold.

**Why no test caught it:** Playwright's `toBeVisible()` asks for a non-empty
bounding box, not for being on screen, and every spec that clicks something
auto-scrolls to it first. 142 e2e specs passed over a screen nobody could see.
The guard now asserts the covered pane's height is 0 and that a pushed screen's
heading is inside the viewport (`tests/e2e/covered-layers.spec.js`).

A second, smaller one fell out of the same measurement: the document is the
scroller and `<Activity>` swaps panes out of layout, so nothing restored scroll
by itself. A push landed at whatever offset the previous screen was scrolled to,
and Back landed wherever the pushed screen left off. `useNavigation` now
remembers an offset per stack entry and asks `transitionFor` which direction it
is going — pushes start at the top, returns land where you left. Note this is
not only the browser-Back path: the in-app back control commits FORWARD through
the reducer, so direction had to be asked rather than inferred from POP.

## Sentence pronunciation should probably follow the word's model (2026-08-10)

The flashcard's WORD audio is now one Replay plus one speed control (P3): the
turtle went, and 0.5x with it. The example sentence further down the same card
still has its own play/slow pair (`Study.jsx` ~1586, two `AudioButton`s).

Evaluate whether it should adopt the same Replay + Speed interaction. It is not
a trivial swap: the sentence plays through `AudioButton`, which would have to be
verified against the shared playback rate, and the two clips (`sentence` and
`sentence_slow`) are separately synthesized the way `word_slow` was. Deliberately
left alone in the P3 pass rather than folded in unverified.

## Profile — Download vocabulary / deck (recorded 2026-08-10)

A possible future export: the learner's learned words, or their current HSK
deck, as CSV/JSON or similar, from Profile.

**This is not offline caching, and must not be confused with it.** Offline
caching (`prefetch.js`, `audioCache.js`, `vocabCacheKey.js`) exists so a session
WORKS without a network. An export exists so a learner can take their words
somewhere else. Different feature, different surface, different data shape.
Not implemented, and deliberately not started.

## The offline system after the completion-screen cleanup (2026-08-10)

The user-facing "Save this level for offline" button is gone from
`SessionRecap` — a completion screen is for the session result, the reward and
the next step, not for download management. The infrastructure underneath is
kept and is now correct, ready for a proper Downloads/automatic-offline surface
later:

- **`vocabCacheKey.js` is the single key builder**, used by both the writer
  (`prefetch.js`) and the reader (`Study.jsx`). They used to build the string
  by hand in two files and had never matched: the writer stored
  `vocab:chinese:hsk:2`, the reader looked for `vocab:chinese:hsk:1-2`.
- **The range is the intended granularity**, taken from the reader: the study
  queue is the cumulative deck `[floor..current]` (`levelScope.js`), so a
  one-level snapshot could never have answered it. `prefetchLevel` now fetches
  the range its key promises, via a `floorLevel` option.
- **The audio half always worked** and is untouched: `ensureAudio` persists each
  MP3 to IndexedDB and `utils.js`/`readyUrl` play it back. Caveat unchanged and
  still in the source: on iOS the service worker bypasses ranged media.
- **`prefetchLevel` currently has no caller.** That is deliberate — it is
  infrastructure waiting for a surface, not dead code to delete.

## The geometry sweep (2026-08-10) — what it found, and what it cannot answer

A measurement pass over every navigation class at four phone widths plus a
simulated native tablet, asserting coordinates rather than existence
(`tests/e2e/geometry.spec.js`, 61 specs). After the two fixes above, the shell
came back clean: every destination's own heading lands inside the first
viewport, every arrival starts at scroll 0, every covered pane occupies zero
height, every overlay begins at the top of `main`, the bar is either present
and paid for or absent and reclaimed, and there is no horizontal overflow at
320px.

One real defect fell out of it: **browser Forward did not restore a pushed
entry's own offset.** A browser Back is a POP, not a commit, so the entry it
LEFT was never measured — `useNavigation` now records the outgoing offset on
the POP path too. Measured: shelf 700 → series 0 → scroll series to 62 → Back
700 → Forward 62.

Deliberately not asserted: a document-height ceiling for fullscreen flows.
Writing, Languages and Profile legitimately scroll, and any number picked would
be a guess about their content rather than a rule about the shell. The failure
mode it was meant to catch — a flow "extending the document" — is a phantom
viewport contributed by a covered pane, which the zero-height assertion catches
at its source.

**What a browser cannot answer, and TestFlight must:** `env(safe-area-inset-*)`
is 0 in Chromium, so notch and home-indicator geometry is unverified by any
test in this repo. The static audit says the top inset is applied exactly once
for in-flow content (App's `<main>`), subtracted once by `studyLayout`'s locked
height, and carried independently by fixed overlays (Toasts, ChatMission,
manhua) which are positioned against the viewport by design — but "applied
once in the source" and "correct on a device" are different claims. Also
unverifiable here: real touch latency, whether the 150ms tab fade reads as
motion or lag, haptics, and the iOS silent switch.

## Navigation motion — the three deferred halves (recorded 2026-08-09)

Phase 2 commit 3C ships enter-motion for every navigation (`navMotion.js` +
`useNavMotion.js`, spec in NAV-MODEL §5.4). Three pieces were deliberately left
out, each with a reason that is not "ran out of time":

- **The outgoing layer never animates.** The View Transitions API is the right
  tool — it snapshots the old DOM for you — but it needs the update inside its
  callback, i.e. `flushSync`. Safe on the forward path (an event handler), NOT
  on a POP, which is adopted in an effect where `flushSync` warns and de-opts.
  Unblocking it means moving POP adoption out of an effect (a `popstate`
  listener that owns the update) — real work, and worth doing only once someone
  is looking at the transition on a device and wants the other half.
- ~~`series` and `reader` only cross-fade~~ — done in the Stories stack
  extraction. Both are real destinations now, so the series page gets the push
  plan and the reader the present plan, and the `INLINE_VIEWS` exception is
  gone from all four places.
- **iOS interactive swipe-back is not implemented.** `swipeBackEligible()`
  decides where it is allowed and is tested; what is missing is the gesture
  itself, which has to drive `pop()` interactively (follow the finger, commit
  past ~35% or on velocity, rubber-band back otherwise). A non-interactive
  "swipe fires pop()" would be the fake version — worse than none.
  `allowsBackForwardNavigationGestures` stays off regardless: browser history is
  not the app's stack.

## Competitive strategy — pick up here (2026-08-08)

The full deep competitive analysis lives in
[`docs/research/2026-08-08-deep-competitive-analysis.md`](research/2026-08-08-deep-competitive-analysis.md)
— codebase inspection + market research, feature matrix, scored priority table
(§19), three phased roadmaps (§20–22), and a ranked top-10 (§24). The agreed
pickup order when work resumes:

1. **Close the onboarding data seam + soften the email-confirm wall** — the
   wizard's `startLevel` / `purposes` / `minutesPerDay` are collected pre-signup
   and never read again (verified in code); prefill the post-signup steps
   instead of re-asking, route "I'm not sure" to the reading test. Then **native
   push** (`@capacitor/push-notifications` — Web Push is dead in the iOS shell)
   with one primed ask on the first session recap.
2. **Fund the LLM key + beginner trust pass** — HSK 3–6 serials unblock for
   dollars; fix the 8 under-coverage beginner stories, the stale `has_audio`
   flags, missing covers; dismantle the `Writing.jsx` XP/streak island (it
   contradicts the Terms page's "no XP" claim in shipping code).
3. **The episode-readiness loop (the killer feature, §23)** — live %-known on
   every serial's next chapter, a Home hook line ("Chapter 7 is ready — you now
   know 96% of it"), recap wiring. The readability engine already computes
   everything; this is display + plumbing.

After that, Phase 2 opens with **card types inside the SRS** (listening + cloze
per word, staggered by stability) and the **character decomposition / 声旁
layer** — the two biggest learning-quality gaps identified. Details, scores and
reasoning are all in the research doc; don't re-derive them here.

### An art-fetch commit lands without CI (know it before you merge)

`manhua-art-fetch` commits the panels it downloads back to the branch, using the
workflow's own `GITHUB_TOKEN`. **GitHub does not trigger workflows for a push
made with that token** — deliberately, so a workflow cannot loop by pushing. So
the commit at the head of a manhua PR is routinely one that `ci.yml` and
`e2e.yml` never saw, and the PR's check list will look thin rather than red.

Two consequences worth carrying:

- Do not read "no failing checks" as "CI passed" on one of these PRs. Look at
  which commit the checks are attached to.
- To get a real run, push one more commit yourself (any real change on top), or
  verify the exact tree locally with lint + test + build before merging. The
  art-fetch commit only adds `.webp` files, so the risk is low — but "low" is
  not the same as "checked", and this project has already shipped blank panels
  once by assuming.

### The SPA rewrite makes a missing file look like a 200 (fixed, but know it)

`vercel.json` rewrites `/(.*)` → `/index.html`. That is what makes deep links
work on refresh, and it also means **a request for a file that does not exist
returns 200 with the app shell, not 404.** Two things were built on the wrong
assumption before this was understood:

- `public/sw.js` cached that HTML under the asset's URL (cache-first stores
  anything `ok`), so an image that shipped late stayed broken on every device
  that had asked for it early. Fixed in v7: `isShellHtml` refuses to store it and
  drops an existing poisoned hit, and the version bump clears the old caches.
- `publish-manhua.mjs`'s art preflight checked `res.ok` only, so it would have
  passed on every missing panel. It now requires `content-type: image/*`.

**Anything else that probes for a file's existence over HTTP has the same trap.**
Check the content type, not the status.

## Database
- [x] **`20260730090000_manhua_presentation_rename.sql` — APPLIED (verified 2026-08-03: constraint is the final `('paced','chat','scene','manhua')` form, 8 rows on `manhua`, 0 on `manga`).** The `presentationOf` alias in `src/readerMode.js` and the `LEGACY_PROGRESS_PREFIX` fallback in `src/manhuaProgress.js` are now deletable per the plan below — though the IndexedDB fallback is cheap insurance for devices that saved positions under the old key and is fine to keep a while longer. Original entry: Retags the fourth presentation `'manga'` → `'manhua'` (Chinese word for the form; the Japanese one was a slip). Idempotent: it widens `stories_presentation_check` to accept both spellings, UPDATEs the one row, then narrows the constraint to `'manhua'` alone. **Order does not matter** — `presentationOf` in `src/readerMode.js` aliases the old tag to the new one, so the app deploy and this migration can land in either order without the live episode dropping to a plain paced story in between. Once it is applied everywhere, that alias and the `LEGACY_PROGRESS_PREFIX` fallback in `src/manhuaProgress.js` (which reads reading positions saved under the old `manga:` IndexedDB key) can both be deleted.
- [x] **APPLIED 2026-07-28 — `20260728210000_fix_language_reset_missing_writing_stats.sql`.** "Reset HSK 3.0 progress" failed outright with `relation "public.writing_stats" does not exist`, so a language's progress could not be cleared. Root cause was the §10 classic: `20260605224500_add_writing_stats.sql` sat in the repo unapplied while the reset RPC that deletes from that table was applied. It cost more than the reset — `src/Writing.jsx` reads and upserts `writing_stats` on every writing answer, so writing practice was discarding its results. The fix creates the table idempotently AND guards the RPC's delete with `to_regclass`, so a missing optional table can never abort a reset again. Applied through the dashboard SQL editor (the sandbox's MCP write gate was unreachable that session). **Worth a check when convenient:** reset a language from Profile and confirm it completes, and that a writing answer now persists across a reload.

## Auth / email / hosting
- [ ] **Custom SMTP — LIVE TEST PENDING.** Configured 2026-07-18: Brevo is the sending provider; `hanzi-dojo.com` shows **Authenticated** in Brevo (DKIM `brevo1/brevo2._domainkey`, `brevo-code` TXT, DMARC `p=none` — all added in Cloudflare DNS, the authoritative nameserver; Vercel only hosts). Supabase custom SMTP wired to `smtp-relay.brevo.com:587`, sender `no-reply@hanzi-dojo.com`. **Still to verify:** send a real magic-link/sign-up to an external inbox and confirm it (a) arrives (not spam) and (b) shows From `no-reply@hanzi-dojo.com`. Brevo "Branding" (the `em`/`img.em`/`r.em` CNAMEs) shows *Not branded* — optional, tracking-link cosmetics only, doesn't block sending.
- [ ] **🔴 Auth URL config — now BLOCKS password reset in the store apps.** Set Site URL = `https://hanzi-dojo.com` and put these in the redirect allowlist: `https://hanzi-dojo.com/**`, `http://localhost:5173/**`, and — **new and load-bearing** — **`com.hanzidojo.app://**`**. Reported 2026-08-09: requesting a password reset *inside the app* emailed a link that returned to `capacitor://localhost` (what `window.location.origin` is in a WebView). GoTrue rejects a redirect it was never told about, **burns the one-time token**, and falls back to the Site URL — so the learner landed on the website's welcome screen, signed out, with no form and no way to finish. The code half shipped the same day (`authRedirectTo()` now sends `com.hanzidojo.app://password-reset` / `://auth-callback` from the app, and the deep link is handled), but **it cannot work until the scheme is allow-listed** — the rejection happens on Supabase's side, before the app is ever reached. Same applies to the signup-confirmation email sent from the app. *(dashboard)*
- [ ] **Google sign-in shows the Supabase URL — OWNER DECISION 2026-08-07: do the FREE fix only (part 1); the custom domain is deliberately deferred.** So `bvqvturqupbggxaeihvi.supabase.co` stays the OAuth callback domain, and **every provider must be configured against it** — Apple's Services ID return URL included. Revisiting later is not just a toggle: it means re-editing the Apple Services ID, re-verifying the domain with Apple, and updating Google's authorized redirect URI, so treat this as settled unless there's a reason to pay the ~$10/mo add-on (Supabase org is on Pro, which makes the add-on available but does not include it). Original entry: the Google consent screen reads "continue to `bvqvturqupbggxaeihvi.supabase.co`" because that's Supabase's OAuth **callback** domain. NOT a code bug (`src/Auth.jsx` already sets `redirectTo` = the app origin). Two-part dashboard fix: **(1)** Google Cloud Console → APIs & Services → OAuth consent screen → set **App name** "Hanzi Dojo" + logo + authorized domain `hanzi-dojo.com`, then publish/verify → Google names the app "Hanzi Dojo" instead of the project ref (biggest visible win, free). **(2)** To remove the `…supabase.co` "continue to" line entirely, set up a **Supabase Custom Domain** (`auth.hanzi-dojo.com` — Pro add-on + a CNAME in Cloudflare), then add the new `https://auth.hanzi-dojo.com/auth/v1/callback` as an authorized redirect URI on the Google OAuth client. Re-test the full Google flow after. *(dashboard + DNS)*
- [ ] **Turn off the retired GitHub Pages site** — repo Settings → Pages → Source → None. The deploy workflow is already removed; this disables the last-built site.
- [ ] **🔴 Two Cloudflare Workers projects fail CI on every commit — ONE-TIME DASHBOARD CLICK, confirmed not fixable in code (2026-07-31).** The two red checks are named `Workers Builds: hanzi-dojo` and `Workers Builds: hanzidojo`; they are check runs posted by the **Cloudflare Workers and Pages GitHub App**, one per Worker service that has a Workers Builds git integration pointed at this repo. Verified on PR #175: both completed as `failure` with `started_at == completed_at` (a **zero-second** build) and an empty `output.text` — the signature of a build that dies before it starts, because there is **no wrangler config in the repo at all** (`wrangler.toml` / `.jsonc` / `.json` — none, and none in git history) and no deploy script. A full grep of the repo finds **nothing Cloudflare-related in CI**: no workflow, no config, no secret, so there is nothing here to delete and no repo-side switch to flip. `docs/DEPLOY.md` §Cloudflare is explicit that Cloudflare is **DNS only, not hosting** — Vercel builds and serves (`vercel.json`, production tracks `main`) — and that `worker/index.js` is deployed by hand. **Do not "fix" this by adding a wrangler config:** that would turn every push to `main` into an automatic Worker deploy of a backend that ships manually on purpose. The fix, both halves outside this repo: **(1)** Cloudflare dashboard → Workers & Pages → open `hanzi-dojo`, then `hanzidojo` → **Settings → Build** → disconnect the GitHub repository (do **both**; one alone leaves the other red), or delete the Worker services if the standalone `*.chatgpt.site` build is retired; **(2)** equivalently/bluntly, repo Settings → GitHub Apps → *Cloudflare Workers and Pages* → Configure → drop `Hanzi-dojo` from the app's repo access. Neither is merge-blocking today (`main` is unprotected, so these were never required checks) — the cost is noise that trains everyone to ignore red. Now more clearly vestigial: Dojo HQ runs on Supabase, so `worker/index.js` only serves that standalone build. *(dashboard)*

Already shipped (code side): `signUp` now sends `emailRedirectTo`; hardcoded github.io links replaced with `BRAND_URL`; app consolidated on Vercel (base `/`).

## Data safety
- [x] **Transactional grading — SHIPPED AND APPLIED (verified in prod 2026-08-07: `grade_card` function exists).** Collapsed the separate writes (card update, review log, daily activity) into the single security-definer RPC `public.grade_card()` (`20260722120000`, PR #116). The client falls back to separate writes only if the RPC is ever absent.
- [ ] **Real-device verification pass** — offline grade replay, iOS/Safari flashcard + reader audio, and Web Push reminders end-to-end. All built and unit-tested but never exercised on a live device.

## Admin tooling
- [x] **Dojo HQ migration APPLIED 2026-07-27.** `dojo_items`, `dojo_comments`, `dojo_attachments` exist in prod with RLS on. Still open: a second person needs `is_admin = true` before they can see the board (`/make-admin`), and the board has not been exercised end-to-end against real data.
- [x] **`_reading_backup_20260725` had RLS disabled — FIXED 2026-07-27** (`20260727150000_enable_rls_on_reading_backup.sql`, applied). The pre-fix readings snapshot was created without RLS, leaving 1,871 rows readable *and writable* by anyone with the public anon key. Found by the Supabase security advisor. Nothing reads the table, so RLS is enabled with **no policies** deliberately: PostgREST denies everyone, the service key still reaches it for a restore. **Worth a habit:** run `get_advisors` after any migration — this sat exposed since 25 July and nothing in CI would have caught it.
- [ ] **Dojo HQ — schema notes.** `/hq` is backed by the app's own Supabase project and keyed to the signed-in account (`src/dojoSupabaseClient.js`), replacing the `localStorage` device board that could never be shared. `20260727140000_add_dojo_hq.sql` created `dojo_items`, `dojo_comments`, `dojo_attachments`, all with RLS where every policy requires `exists (select 1 from profiles where id = auth.uid() and is_admin)`, plus a security-definer `dojo_hq_members()` and a private `dojo-attachments` bucket. Membership *is* `profiles.is_admin` — there is no workspace or invite system, every admin shares one board. If the tables are ever missing the screen names the migration rather than showing an empty board (CLAUDE.md §10).
- [x] **`src/devTools.js` rule violations — FIXED 2026-08-07.** `masteredCardRow` now delegates to `creativeCardRow(mode: 'mastered')` (real FSRS stability, `is_easy` false, no `ease_factor`), `learningCardRow` dropped its `ease_factor` write, and the `.claude/commands/unlock.md` SQL was rewritten the same way. Regression specs assert neither row ever carries `ease_factor` or `is_easy: true`.
- [ ] **Creative mode is untested against a real account.** The admin sandbox on `/dashboard` (level jump, learn/master N words, force N cards due, reset) is unit-tested and writes only rows matching `user_id = session.user.id`, but has never been run against live data. Exercise it on the maintainer's own account before relying on it — especially the level jump, which appends to the append-only `level_unlocks` (§7.5).

## Scheduling
- [x] **Timezone-correct reminders — ALREADY SHIPPED; this entry was stale (verified 2026-08-07).** `send-review-reminders.mjs` has not fired on a plain UTC hour for some time: the per-user "is it their hour?" decision lives in the pure, tested `src/reminderSchedule.js`, which reads the wall clock in `profiles.timezone` and de-duplicates via `reminder_last_sent_at` (so the repeated hour on a DST fall-back day can't double-send). **All four columns — `timezone`, `reminder_last_sent_at`, `reminder_hour_utc`, `reminder_enabled` — exist in prod**, so the legacy fixed-UTC fallback path is not the one running, and `App.jsx`'s `recordTimezone` keeps each profile's zone current.
  ⚠️ **Worth knowing before investing more here: nobody has reminders on.** Prod counts on 2026-08-07: **0 of 31 profiles** have `reminder_enabled = true` (9 have a timezone recorded). So this feature is live, correct, and completely unexercised — which makes it a product question (is the toggle discoverable? is the browser permission prompt the blocker?) rather than an engineering one. It also folds into the native-push work, since Web Push is dead inside an iOS app anyway (`docs/PRE-RELEASE-CHECKLIST.md` §0b).

## Learning quality
- [x] **Ordering dependency between the two reading fixes — MOOT 2026-08-03.** The migration was applied first (see below), so the hazard window is closed. `normalize-readings.mjs` itself is now style-only (see next entry) and its header documents the same ordering rule if it is ever run.
- [x] **Pronunciation pinning for spaced readings — FIXED AT THE SOURCE (entry was stale).** `readingToPhonemes` in `src/pinyin.js` now treats a space (and an apostrophe) as the syllable boundary the author wrote, so a spaced reading like `jiù shì` pins correctly as-is — verified 2026-08-03 (`readingToPhonemes('jiù shì')` → `jiu4 shi4`). No data change is needed for audio; `normalize-readings.mjs` survives only as an optional house-style joiner (its own header now recommends leaving readable spaced forms alone). The old "79% of HSK 3–6 has no phoneme hint" framing described the pre-fix helper.
- [x] **HSK 3–6 wrong readings — MIGRATION APPLIED 2026-08-03.** All 54 rows corrected in prod (verified: 厂→`chǎng`, 忽略→`hūlüè`, 成功→`chénggōng`, 一切→`yíqiè`, 不必→`búbì`…). **Follow-up RESOLVED 2026-08-07:** the owner added the Azure secrets and the staged `tts-flashcards` run executed — dry run verified 21 records/84 clips, confirm run generated 84/84 with 0 failures (~240 characters), and all 84 rows are verified in `tts_audio`. The 21 words now play correct Azure audio (it takes precedence over the legacy `audio_path`). A real-device listen of a couple of them (厂, 美) closes the loop. Original staging notes: the regen was staged and one click away — `regen-content.yml` now has a `tts_ids` input for targeted runs, and a dry run on 2026-08-03 confirmed it selects exactly those 21 records (84 clips, ~240 characters — pennies) — but the same run's env dump shows `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` are STILL unset in Actions, so a confirm run cannot bill. Once the secrets exist: Actions → Regenerate vocabulary content → task `tts-flashcards`, language `chinese`, `tts_limit` 25, `tts_confirm` ticked, and `tts_ids` = the 21 ids from `select id from vocabulary where language='chinese' and system='hsk_3' and char_length(word)=1 and word in ('厂','合','约','胖','追','圈','广','抢','藏','匹','保','台','土','朝','美','诗','神','青','井','清','塞')`. Azure clips take precedence over the legacy `audio_path` at play time. Original entry kept below for the record.
- [ ] ~~**HSK 3–6 wrong readings — MIGRATION WRITTEN, NOT APPLIED.**~~ 54 of the ~1,870 HSK 3–6 words shipped with a wrong `reading`, because HSK 3–6 came from a bulk CC-CEDICT pass while HSK 1–2 was hand-curated. Four classes: CC-CEDICT's ASCII `u:` for ü leaked in verbatim (忽略 `hū lu:è`, 战略, 策略); a rare reading beat the everyday one (厂 `hǎn` not `chǎng`, 转 `zhuǎi`, 追 `duī`, 广 `yǎn`, 藏 `Zàng`, 作, 抢, 圈, 胖, 合, 约, 匹 `pī`→`pǐ`); a proper-noun capital on ordinary words (成功 `Chéng gōng`, 和平, 美元, 网络, 资源, 大众, 通道, 时代, 现代, 将军 + 12 single chars); and **dropped tone sandhi** on 17 words (一切 `yī qiè`→`yíqiè`, 不必→`búbì`, 不见→`bújiàn`…) that HSK 1–2 gets right (一下 `yíxià`, 不错 `búcuò`). ⚠️ Precise scope of the audio impact: only the **single-character** words actually pin, so only those are currently *spoken* wrong (厂 really does say "hǎn"); the multi-syllable spaced ones never pinned, so for them the bug is the **displayed** pinyin only. Found by diffing against the CC-CEDICT `dict_entries` already in the project — note 1,864/1,871 matched *some* attested reading, which is exactly how a polyphone error hides. All replacements are CC-CEDICT-attested and yield syllable-aligned phonemes; none of the 54 is in a learner's deck yet. Fix: apply `supabase/migrations/20260724120000_fix_hsk3_6_readings.sql` (idempotent — matches on the known-bad value), **then re-run Actions → task `audio-hsk3-6`**. ⚠️ Do *not* null `audio_path` to force that: the generator's work list is `vocab.filter(v => v.audio_path)` with `upsert: true`, so clearing the path *excludes* a word. Deliberately left alone: genuine proper nouns (上帝, 圣诞节, 国会, 佛) and ~14 words where both readings are defensible in context (待 dāi/dài, 答 dā/dá, 结 jiē/jié, 泡, 档, 扇, 尽, 切, 挨, 晕, 杆, 踏, 码头, 眼里) — those want a native-speaker call, not a blind edit.
- [x] **HSK 1–2 readings audited — clean, no action needed.** All 497 words checked the same way. The 23 that differ from CC-CEDICT are *better* than it: correct tone sandhi (一下 `yíxià`, 不要 `búyào`, 不错 `búcuò`), the Hanyu Pinyin apostrophe (女儿 `nǚ'ér`), and legitimate proper-noun capitals (中国, 汉语). Worth confirming because this is the band the 157 in-deck words actually sit in.
- [ ] **FSRS parameter tuning** — optimize scheduler parameters beyond library defaults once `review_logs` + analytics have real data.
- [ ] **"Read next" weighted by slipping words.** The SRS already knows which of a learner's words are due or repeatedly failing, and `storyReading.js` already matches stories against known vocabulary — combine them so the Stories shelf quietly prefers the published story containing the most of *that learner's* due words. Reading a word in context the day it comes due is the cheapest retention win available, needs zero new UI (it's a sort order), and fits the calm philosophy: no badge, no prompt, just the right story happening to be first.

## Reference dictionary (Pleco-style)

Shipped 2026-07-20 (see Claude.md §0). Data loaded to prod Supabase: **123,465** `dict_entries` (CC-CEDICT) + **~77,045** `dict_examples` (Tatoeba, simplified, with pinyin). Deferred, non-blocking polish:
- [x] **Wire stroke-order into the entry** — DONE: `src/StrokeOrder.jsx` (one animated hanzi-writer per Han char, reuses Writer.jsx config); the entry's Strokes button toggles it.
- [ ] **得-particle pinyin** — `pinyin-pro` renders degree-complement 得 as `dé` where neutral `de` is wanted (occasional; example sentences only).
- [ ] **Capitalized-pinyin display** — CC-CEDICT proper nouns (Běijīng) render lower-cased in `src/cedict.js` (`markTarget` lowercases; display-only, search unaffected).
- [ ] **Migration hardening** — add `drop policy if exists` before the `create policy` lines in `20260719120000` (idempotent re-runs) and a partial unique index `(language,system,word) where level is null` on `vocabulary` to bound concurrent dictionary-word inserts.
- [ ] **Both-language / other-language dictionaries** — Japanese (JMdict) + Russian; the entry view + search are language-agnostic, the data + `dict_search` are Chinese-only today. *(PAUSED — non-Chinese languages are on hold until the app scales.)*
- [ ] **Operator note** — reloading examples requires `truncate public.dict_examples` first (seed-examples is insert-only). CC-CEDICT/Tatoeba downloads + `--apply` are manual (service key); see the seed script headers.
- [ ] **HSK 3-6 stories — BLOCKED on LLM quota.** Vocabulary/examples/audio shipped (via `regen-content.yml` tasks `examples-hsk3-6`, `audio-hsk3-6`; serial configs added to `generate-serial-stories.mjs` for `chinese|hsk_3|3..6`). The `serial-hsk3-6` task runs but `generate-serial-stories` "plan season" call hits Gemini free-tier **429** on every level → `Published 0`. Unblock: enable billing on the Gemini API key (cheap, big RPM jump) OR set `ANTHROPIC_API_KEY` + `LLM_MODEL_PREMIUM` GitHub secrets (the generator's premium path). Then re-run `serial-hsk3-6` (tier taste-test first, then full). **No longer the only path:** the hand-authored lane now works for Chinese (PR #112) — dispatch `authored-vocab-hsk3`, commit the dump as `data/hsk3-vocab-snapshot.json`, author into `data/authored-stories.json`, and `authoredStories.test.js` validates every chapter against the real pool with the production matcher. No LLM, no quota. *(The "HSK 1 words" tier-label bug is fixed — PR #113 keys tiers by language AND level.)*

## Content

- [ ] **Four small letterbox bars in the two already-shipped Inkbound episodes.**
  Found on 2026-07-30 by the bar check newly added to
  `tools/manhua-contact-sheet.mjs`, which did not exist when those episodes were
  reviewed. 第一话: `panel-08-teacher` (bottom 6%), `panel-11-stroke` (top 6% and
  bottom 9%), `panel-13-watcher` (left 11%). 第二话: `panel-21-hook` (right 6%).
  All are small, all are dark-on-dark, and none of them puts a bubble on a bar —
  which is why nobody saw them. **Deliberately not fixed here:** reworking
  published art means a force re-fetch and a new commit on live episodes for a
  defect no reader has noticed, and this batch already spent three rounds on the
  bars that mattered. Worth doing the next time either episode is touched for
  another reason. The cause and the prompt wording that avoids it are in
  `docs/STORY-BIBLE.md` §6.

**Focus: Chinese only.** Japanese and Russian are paused until the app scales; the
gate lives in `PUBLIC_LANGUAGES`/`ADMIN_LANGUAGES` in `src/languageTheme.js` (add a
language key back to un-pause). The non-Chinese content items below are kept for
when we resume, not scheduled.

- [ ] **25 HSK 6 words still have no example sentence** (down from 335 on 2026-07-28; level 6 stands at 1596/1621). Levels 3, 4 and 5 are complete. Nothing is broken — this is purely a free-tier quota wall, and it does **not** clear on the hour. Two runs have now confirmed the shape of it: the 16:06 run wrote 300 and stopped at `Used 99085`; the 17:21 re-run, 65 minutes later, got only **10 more** words before stopping again at `Used 99430 / Limit 100000`, `retry-after: 3631`. Groq's tokens-per-day is a **rolling 24-hour window**, so an hourly re-run only recovers whatever trickles out of the window — roughly 10 words a run. Don't loop it. Either wait ~24h from the 16:06 bulk run for the window to clear properly and finish the last 25 in one pass, or use a key with real headroom (Gemini's daily free tier resets at midnight Pacific and would cover 25 words easily). Re-run is Actions → `examples-fill`, `language: chinese`, `level: 6`. History below.
- [ ] **335 HSK 3-6 words still have no example sentence.** ✅ *Mostly resolved 2026-07-28 — 300 of 335 filled; see the entry above.* The Tatoeba backfill (`backfill-examples.mjs --levels 3-6 --apply`, Actions task `examples-hsk3-6`) matched **4,160 of 4,495** on 2026-07-28 and is now exhausted — the remainder simply has no Tatoeba sentence containing the word. Left: level 3 ×3, level 4 ×33, level 5 ×74, level 6 ×225 (the tail is the rarest vocabulary, so it skews to level 6). Finish with the LLM path, one level at a time: Actions → `examples-fill`, `language: chinese`, `level: 3` … `6`. That path is already paged and stops early on a spent quota (`f51c626`) and reports a refusal instead of retrying it 46 times (`6834533`), so a quota wall costs one short run, not a burned hour. ⚠️ **Gemini's free daily quota is spent** — the 15:43 level-3 run got a 429 on all four attempts and wrote nothing. `llm.mjs` now fails over to Groq after three consecutive quota refusals, so the next run finishes on the standby; if both are walled, the fill simply has to wait for the daily reset. Nothing is broken meanwhile — the fill-in-the-blank question builder already filters to rows whose `example_sentence` contains the word (`src/fillBlank.js`), so a missing example just means that word never becomes a cloze question.
- [x] **Azure flashcard TTS can't run in CI — RESOLVED 2026-08-07: the owner added `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` as Actions secrets; run #108's env dump shows both set, and the 21-word regen ran successfully through Actions the same day (see §Learning quality). What remains open from this entry is only the optional per-level HSK 3–6 `tts-flashcards` pass for slow-word/sentence audio.** *(Re-confirmed 2026-08-03: a `tts-flashcards` dry run on that day's branch still shows both Azure vars empty in the workflow env — the 2026-08-02 story-audio batch must have run outside Actions. Adding the two secrets also unblocks the 21-word reading-fix regen in §Learning quality.)* `tts-flashcards` (`tts-generate.mjs`, the only script that spends money on speech) is wired into `regen-content.yml` with its dry-run/confirm/cap guards, but the 2026-07-28 run's env dump shows `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` **empty** — only `GOOGLE_TTS_KEY` is populated. So HSK 3-6 has zero rows in `tts_audio` (levels 1-2 have full `word` coverage from the earlier pass), which means no slow-word and no sentence audio there. **This is not user-visible today:** all 4,498 words have a legacy `audio_path`, and `flashcardAudio()` falls back to it for the `word` variant, hiding the slow/sentence controls when absent. Fix is repo settings, not code: add `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` as Actions secrets, then run `tts-flashcards` per level (dry run first — `tts_confirm` unticked — then confirm; the 200-record cap needs `--override-max`, which the task adds automatically above a limit of 200).
- [ ] **Stale fix instruction above:** the HSK 3-6 reading-fix entry says "re-run Actions → task `audio-hsk3-6`". That task was **retired** in `5e65347` (it billed Google, not Azure) and now exits 1 with a pointer. Once the Azure secrets exist, the equivalent is `tts-flashcards` for the affected levels; the legacy Google `audio_path` rows it replaces are the ones carrying the wrong readings.
- [ ] **🔴 The serial-story generator cannot run on free LLM tiers — needs a funded key.** Settled empirically overnight 2026-07-29 across three batch runs (story-batch.yml #1, #3, #5). Run #5 was the clean experiment: dispatched at 07:30 UTC, half an hour after Gemini's daily reset, with the SEASON_SEEDS crash already fixed — all three levels ran real LLM calls for 27/16/16 minutes and published zero stories. Gemini's fresh daily quota exhausts mid-tier-one, failover lands on Groq, and Groq's 100k tokens-per-day is a rolling 24h window that the night's own attempts keep full (final reading: Used 98,091/100,000 with each season plan needing ~9k — it can never fit). This is structural, not timing: a season is ~100 calls and the two free tiers together cannot fund even one. The pipeline is otherwise healthy and now inherits the story canon. Fix is repo settings, not code: add a funded `ANTHROPIC_API_KEY` as an Actions secret (premiumLlm() picks it up automatically; a level costs a dollar or two on Sonnet) — or a paid-tier Gemini/Groq key. Until then, stories are hand-authored via `data/authored-stories.json` + `check-authored-stories.mjs`, which is how HSK 4-6 got their 45 chapters.
- [ ] **Chinese → HSK 7-9** (the advanced band): seed the vocab, then run `generate-meanings` → `generate-examples` → `generate-serial-stories` → `generate-audio`/`generate-story-audio`. Add tiers to `storyTiers.js` and level labels in `utils.js`. *(HSK 3-6 vocab/examples/audio already shipped; stories pending LLM quota.)*
- [ ] More graded stories at existing Chinese levels (volume, not just new levels) — improves the "read next" ladder density.
- [ ] **Eight published HSK 1-3 stories sit under their level's coverage bar.** Found by `node check-authored-stories.mjs`, which now runs the same validator the generator uses against the vocabulary lists in `data/` (no network, no API key). These predate that checker, so nothing regressed — but a learner reading them meets words that are not on their list yet:
  - `下雨天` (L1 t1) — 64% vs 85%. The worst at HSK 1: 拿着、伞、走路、树、鸟、花、美、心. Nearly every content word in it is off-list.
  - `我的早上` (L1 t1) — 74%: 刷牙洗脸、拿、包、公共汽车.
  - `放学以后` (L1 t1) — 84% (marginal): 放、以、起、公园、啊、门. `放学`/`以后`/`公园` are the recurring offenders; HSK 1 has neither.
  - `在动物园` (L2 t1) — 65% vs 90%. 狮子、熊、猴子、象、冰淇淋、拍、照片. A scene story, so the zoo animals are the point; it may be easier to re-level it to HSK 3 than to rewrite it.
  - `新的决定` (L3 t1) — 87%: 理解、紧张、支持、庆祝.
  - `坚持` (L3 t1) — 88% (marginal): 困、紧张、停止、建议、胜利.
  - `周末的电影` (L2 t1) — 88% vs 90%: 末、空、主意.
  - `2. 一个办法` (L3 t2) — 85% vs 86% (marginal): 田、秧苗、拉.
  Deliberately **not** rewritten — these are published stories and how far to push a reach word is a content call, not a lint. The marginal ones may just want a word swapped; `在动物园`, `下雨天` and `我的早上` need a decision.
  ✅ `回家的路` is FIXED (83% → above bar): 压力→累, 美丽→好看, 父母→爸爸妈妈, 幸福→家, 消失→变, and the 眼前都是光 line dropped. 村里/阳光/桥 stay as declared reach words — they are what the story is about.
  *(The three HSK 1 entries only became visible on 2026-07-29: `data/hsk1.json` was an empty file, so the checker had been silently skipping every HSK 1 story. `data/hsk1-vocab-snapshot.json` now supplies the pool.)*
- [ ] **`src/authoredStories.test.js` still has no HSK 1 pool.** `SNAPSHOT_FILES` covers `chinese|hsk_3|2` and `|3` (the latter now correctly unioned from `data/hsk2-vocab-snapshot.json` + `data/hsk3.json` — the old `data/hsk3-vocab-snapshot.json` was an obsolete draft that rejected 发现/相信/一直/然后/回答/忘记 and admitted ~400 words that are not in the database). HSK 1 has a real pool now, `data/hsk1-vocab-snapshot.json`, but wiring it in would immediately fail the three legacy HSK 1 stories listed above — this test is absolute, not a percentage. Do it in the same change that resolves them. Until then HSK 1 stories get structural checks in the suite plus the full coverage check in `check-authored-stories.mjs`.
- [x] **Cover art for all 60 new hand-authored chapters — DONE 2026-07-29, then REDONE the same day.** First pass was ten craft styles (gouache, ink wash, woodblock, riso, manhua, noir, screenprint, collage); read as tasteful but dated. Replaced with a single modern register — cinematic anime key art, lineless digital painting, volumetric light, filmic grade — varied per season by colour grade and time of day rather than by medium. That keeps the shelf coherent while the seasons stay distinguishable, and it lets the sea strand's three legs read as one arc through grade alone (cold steel → teal night → gold dawn). The manifest was swapped **in place** (same 60 keys, new URLs), not appended. Every prompt carried an explicit no-text/no-signage constraint — generated hanzi is always wrong and this is a language-learning app, so a cover must never show a character a learner might read. 16:9 to match the fixed cover slot in `Stories.jsx`.
  *Note for next time:* `data/story-covers.json` keys on `(language, system, level, story_number)` with no tier, so `story_number` has to be unique within a level — worth asserting before a batch, since two seasons at the same level can otherwise silently overwrite each other. Also: CDN URLs 403 from inside the sandbox proxy (a known-good already-applied URL 403s the same way), so don't read that as a broken link — the Actions runner fetches them fine.
- [ ] *(PAUSED)* **Japanese JLPT N4+ / Russian A2+**: same pipeline per new level; extend the level/tier config so onboarding offers them (Onboarding gates on seeded levels already). Repo already has `data/n4.json` (N4 vocab, meanings + readings) if/when we resume Japanese.
- [ ] *(PAUSED)* **Spanish track**: add a `spanish` entry to `languageTheme.js` (accent, font, system=CEFR), level list + tiers in `storyTiers.js`, seed CEFR vocab, generate content. Onboarding/data layers are already data-driven, so most of the app picks it up for free.

## Media
- [ ] **Story cover art is 16:9; the shelf now shows 2:3 posters (2026-08-08 Stories redesign).**
  `StoryCover` center-crops with `object-fit: cover`, so every existing cover
  still renders acceptably, but a third of each image is cropped away and
  compositions with subjects near the left/right edges lose them. Next cover
  batch should generate portrait 2:3 art directly (`generate-story-images.mjs`
  prompt + size change); existing covers can be regenerated season by season —
  it's polish, not breakage. The reader header still uses wide crops, so keep
  the source art tall and crop wide, not the other way around.
- [ ] **Pictures on flashcards**: generate/source one image per vocab item (image-gen pipeline → Supabase Storage `images/` bucket, mirror of the audio flow), add `image_path` to `vocabulary`, render lazily on the card back. Keep it optional so a missing image degrades cleanly.
- [ ] **Better TTS**: current narration is Google TTS (`generate-audio.mjs`, `generate-story-audio.mjs`). Evaluate more natural voices (e.g. Azure Neural, ElevenLabs, OpenAI TTS) per language, pick voices, regenerate vocab + story audio; watch blob size / offline-cache cost. A/B a sample before mass regen.

## Video (graded YouTube — the flagship idea)
Turn the current recommended-videos list (`YouTube.jsx`, `youtube_recommendations`) into graded comprehensible input — the video analog of the story reader:
- [ ] Fetch a video's **caption/transcript** by video id (YouTube timedtext / caption tracks); handle the no-captions case gracefully.
- [ ] Reuse `storyReading.js` to compute **% known** over the transcript and make words **tappable** (define / add to deck), exactly like the reader.
- [ ] **Sync the transcript to playback** (YouTube IFrame API `getCurrentTime`/state events) — highlight the current line, tap a line to seek.
- [ ] **Pre-teach flow**: surface the top-N unknown words as quick flashcards before watching.
- [ ] **Level-matched library**: tag recommendations with level + a computed "% you'll understand" badge so browsing mirrors the graded-story ladder.

## Your words & tools
- [ ] **Custom flashcards**: let users add their own cards (word, reading, meaning, optional TTS audio). Store as user-owned vocab (a `custom_vocab` table or a `source` flag on `vocabulary`), feed them into the study queue + FSRS exactly like seeded cards, and optionally group into named decks. Reuse the existing card/grading path so scheduling, offline, and XP work unchanged.
- [ ] **Built-in dictionary**: a searchable lookup over the vocabulary table, extended with an open dataset per language (CC-CEDICT for Chinese, JMdict for Japanese, an A1+ list for Russian). Search screen → result shows reading + meaning + a play button (recorded audio or TTS) + "add to deck" (which creates a custom card). Bundle/cache the dataset for offline. Pairs with the tap-to-define that already exists in the reader.

## Home & session-recap declutter (mod feedback, 2026-07-21)

Shipped 2026-07-21. From Eliazu's mod-chat review (old vs new mocks): the home and
session-complete screens were number-heavy and partly off-brand. Streamlined toward
"fewer numbers, straight to the story."
- [x] **Remove the "streak" from Home** — the Flame badge ("day streak") and the
  "Study today to keep it" guilt line are gone (they directly contradicted the *no
  streaks, no guilt* promise). *(Superseded 2026-07-22: the account-level (Lv/XP)
  badge mentioned below as staying was later removed too — see "Streak & XP system
  removal" below.)*
- [x] **Declutter the Dojo card** — removed the daily-goal ring, the mastery bar,
  "Your rhythm" dots, and the "Next 7 days" forecast. The New/Learning/Due counts
  stayed (functional, not decorative). The whole "Today's Dojo" card is now itself
  tappable (role="button", hover state, trailing chevron) — same destination as the
  "Review & unlock" CTA below — instead of a small nested pill being the only
  clickable part.
- [x] **Simplify the session recap** — dropped the XP badge and the Accuracy stat;
  collapsed the stat tiles + separate "Tomorrow" banner into two calm tiles ("Today:
  N reviewed, M new" / "Tomorrow: N due, M new"). The "Recommended next" story CTA
  (already the first action after the trimmed stats) leads straight to reading.
  *(The level-up card mentioned as "kept as-is" below was later removed too — see
  next section.)*

## Streak & XP system removal (2026-07-22)

Shipped 2026-07-22. Full removal of the streak counter, streak freezes, XP totals,
and account leveling — the mechanic itself ran against the *no streaks, no
leagues, no guilt* promise, not just its Home/recap presentation. Deleted
`src/xp.js` and `src/xpService.js` outright; trimmed `src/streak.js` down to the
two plain date helpers (`todayStr`, `daysBetween`) still needed elsewhere. Removed
the account-level badge (Home), the level-up card (session recap), the streak/
streak-freeze/account-level stat cards (Profile), the streak/level achievement
groups (`src/achievements.js` — the file itself is gone as of P10-B1, see below), the
dev-only streak/XP debug actions (`src/Dev.jsx`),
and the "+N XP" completion copy from all 11 drill/reader screens. Deliberately kept:
`daily_activity` day-counting (fed the Study Calendar heatmap until P10-B2; it
now feeds the one-sentence study rhythm — `studyRhythm` in `profileProgress.js`) and a minimal
`profiles.last_studied_on` write-back in `Study.jsx` (feeds the calm "gentle return
after a break" welcome — the one non-gamified consumer of that field, previously
written only by the now-removed streak updater). DB columns (`total_xp`,
`streak_freezes`, `streak`, `longest_streak`) were left in place, unused — no
migration to drop them, since this removed the feature, not historical data.
- [ ] *(optional follow-up)* Drop the now-dead `profiles` columns (`total_xp`,
  `streak_freezes`, `streak`, `longest_streak`) once we're confident nothing else
  reads them.

## Frontend cleanup
- [x] **`Stories.jsx` shelf logic extracted to `src/storyShelves.js` (2026-07-30).** The
  screen held two closures over render scope (`shelvesForTier`, `tierInfo`) plus a
  ~70-line IIFE inside the JSX that filtered, arc-grouped and split every level of
  the open tier. All of it is pure and all of it decides what a learner can read,
  so it now lives in a module with 22 specs beside it — `shelvesForTier`,
  `tierInfo`, `defaultTier`, `splitShelf` — and the JSX renders a `LevelBlock`
  component instead. No behaviour change; the tier rules are identical.
- [x] **Deleted the two superseded pre-signup tastes (2026-08-08).**
  `SentenceTaste.jsx` + `starterSentences.js`(+test), then `CharacterTaste.jsx`
  + `tasteSteps.js`(+test) — both replaced by the first-encounter flow
  (FlashcardIntro / MicroStory / EncounterComplete). `starterAudio.js` stays,
  slimmed to the `speak()` fallback FirstLesson-era code still uses.
- [ ] Continue extracting the large `Study` screen into focused hooks/components.
- [ ] Supabase generated types (gradual TypeScript adoption).
- [ ] Centralize design tokens (colors/spacing/shadows) beyond the current shared primitives.

## Deploy steps (apply before the feature works)
- [x] **Public story links — APPLIED (verified in prod 2026-08-07: `public_story` function exists).** Original entry: apply migration `supabase/migrations/20260716000000_add_public_story.sql` in the Supabase SQL editor. It adds the anon-callable `security-definer` RPC `public_story(uuid)` (returns one published story + its language's active vocab capped to the story's level). Until applied, `/read/:id` shows the "story not found" state (a `console.error` fires so it's diagnosable). Smoke-test: `POST $VITE_SUPABASE_URL/rest/v1/rpc/public_story` with the anon key and a published story UUID → JSON with `title` + `vocab_pool`; an unpublished id → `null`.

## Done
- [x] **#needs-testing Discord feed** — `docs/TESTING.md` mirrors to a Discord **forum** channel, one thread per item (stable-id keyed, edited in place, ✅ when checked off), so testers can react/reply per item. `scripts/needs-testing-discord.mjs` (pure parser unit-tested) + `.github/workflows/needs-testing-sync.yml` (fires on push to main touching `docs/TESTING.md`). *(one-time: make #needs-testing a FORUM channel, add its webhook as secret `DISCORD_TESTING_WEBHOOK`; skips until set.)*
- [x] **Public story links** — signed-out `/read/:id` page: pick a level → "you'd understand ~X%" (canonical `calculateStoryReadability`) → teaser lines with known/new highlighting → signup gate; the reader's share card now links here. Anon funnel events (`public_story_viewed/level_picked/signup_clicked`) feed the dashboard. Pure logic in `src/publicStoryHelpers.js` + `readStoryId` in `routes.js` (tested); page code-split (lazy). *(needs the migration above applied)*
- [x] Onboarding language cards render equal width — the longer "Русский" label no longer stretches the Russian card past the two CJK cards (`src/Onboarding.jsx`).
- [x] Story reader no longer dead-ends: "learn N more to unlock the next tier" hook (`src/StoryReaderImmersive.jsx`, `nextLockedTier`).

---

## Known issues (migrated from CLAUDE.md §16)

These moved out of `CLAUDE.md` so that file stays short enough to read every
session. **Some entries predate the current state** — they were accurate when
written and have not been re-verified since. Confirm against the code or the DB
before acting, and delete an entry once it is resolved rather than annotating it.

**In progress:**
- **Apply migration `20260630000000_add_xp_and_prefs.sql`** in the Supabase SQL Editor to enable persistence of account XP and study prefs (`total_xp`, `recall_mode`, `audio_autoplay`, `furigana_default`). The app is defensive — it runs without it (defaults applied in code), but XP/prefs won't save across reloads until the columns exist.
- **Apply migration `20260630010000_add_story_questions.sql`**, then generate questions (Action `task=comprehension`, or `node --env-file=.env.script generate-comprehension.mjs`). The end-of-story comprehension card only appears once questions exist; the "new words" recap works without it.
- **Japanese example sentences (N5 Part 1 + Part 2):** 798/800 words populated. Run `node --env-file=.env.script generate-examples.mjs --japanese` to fill the remaining 2.

**Russian (new language — frontend + DB ready, content pending):**
- **Apply migration `20260701120000_add_russian_language.sql`** so the DB accepts `language='russian'` / `system='russian'` (relaxes the CHECK constraints across profiles, language_tracks, vocabulary, test_attempts, level_unlocks, stories, youtube_recommendations; RLS unchanged). Until applied, creating a Russian track fails the CHECK.
- **Seed the starter deck** (`data/russian-a1.json`, 147 A1 words) via `seed-vocab.mjs --language russian --system russian --level 1 --apply` (needs a runner with Supabase access, like HSK 2). Then run the pipeline: `generate-audio --language russian --system russian --level 1` → `generate-examples --russian` → `generate-stories --language russian --system russian --level 1`.
- The Cyrillic alphabet drill, gating of CJK-only modes, background, accent, and native name all ship in the frontend already.

**Missing content:**
- **Japanese YouTube recommendations:** None published. Chinese HSK 1 has 3.
- **HSK 2 vocabulary: COMPLETE** (Chinese HSK 3.0 level 2) — 198 words + audio + example sentences + 15 stories + comprehension questions, all live. Only missing extra: YouTube recommendations. Both HSK 1 and HSK 2 are now done.
- **JLPT N4 (level 3): 636 words seeded** (`data/n4.json`); audio/examples/stories/comprehension run via the Action. **HSK 3–9 and JLPT N3–N1:** still no vocabulary — level selection exists but shows empty study queues.

**Technical debt:**
- **Vocabulary `meaning` data is messy and sometimes wrong (TODO — deferred).**
  AI-generated glosses have junk formatting ("Good morning., Good afternoon.,
  Hello.") and some are semantically off (こんにちは listed as "good morning").
  `cleanMeaning()` tidies *display* in the reader + flashcard, but the source
  data is still messy and used elsewhere. Two follow-ups, do **#1 first**:
  1. **Deterministic DB cleanup script — DONE (`clean-meanings.mjs`).** Imports
     `src/cleanMeaning.js` (no drift) and applies the same tidy to the `meaning`
     column across all active vocab. Conventions match the `generate-*.mjs`
     scripts (`--env-file=.env.script`, SUPABASE_URL + SUPABASE_SERVICE_KEY).
     **Dry-run by default** (prints every before→after, only rows that differ);
     `--apply` writes; `--chinese`/`--japanese` filter. Free, safe, no AI — never
     blanks a meaning. **Not yet run** — run it (or via a runner that can reach
     Supabase) to fix formatting everywhere (flashcards/test/writing/stories).
  2. **Regenerate meanings** (later) — `generate-meanings.mjs` already exists
     (70B, tighter prompt, `--dry-run`/`--chinese`/`--japanese`). Easiest path is
     the one-click Action (`task=meanings`, `language=both`). Neither Chinese nor
     Japanese meanings have been regenerated yet. Costs API calls; spot-check.
- **Example sentences — Chinese regenerated; Japanese still pending.**
  The generator was upgraded (`generate-examples.mjs`: 70B model + quality
  prompt + few-shot + an anti-tautology rule). **Chinese HSK 1 (all 300 words)
  has been regenerated** via the one-click Action (`task=examples,
  language=chinese`). **Japanese is still on the old data** — run the Action with
  `task=examples, language=japanese` (or `--japanese --regen` locally) to fix it.
  Costs Groq tokens; spot-check, and consider the counter-suffix entries
  (～さい/～グラム/～たち) for deactivation since they make awkward sentences.
- **Some Japanese audio mispronounces kanji.** Fix: generate-audio.mjs already uses `v.reading` (hiragana). Delete the storage folder for the level before regenerating so files are not skipped.
- **Duplicate kanji + counter-suffix cleanup — script written (`deactivate-awkward-vocab.mjs`), not yet run.** Duplicate-reading kanji (何 = なん/なに, 私 = わたし/わたくし) create identical-looking options across Test/Listening/Fill-in-the-blank; counter-suffix entries (～さい/～グラム/～たち) are grammar fragments that make nonsense in the sentence modes. The script deactivates suffix entries (Japanese words starting with a wave dash) and the secondary reading of the listed duplicates (only if the word keeps another active row — never fully removes a word). Safe/reversible (`is_active=false` only, dry-run by default). Run via the Action (`task=deactivate-awkward`) or `node --env-file=.env.script deactivate-awkward-vocab.mjs --apply`. Reading is also already shown in Test.jsx Japanese options.
- **Unified Stories reader.** All languages route through `src/StoryReader.jsx`, now a 50-line presentation dispatcher (immersive / paced / chat / scene / manhua). The old "dead in-file `StoryReader`/`CharacterGuide`/`StoryLine` in Stories.jsx" note was stale — verified gone 2026-08-07; no dead reader code remains.
- **Mobile layout.** Below 768px the left sidebar is replaced by a fixed bottom bar (MobileNav.jsx, 5 tabs + a "More" sheet); App.jsx branches the shell via useIsMobile(). Each top-level screen (Home, Study, Test, Writing, Stories, Profile, Settings, LanguageSwitcher, YouTube) reduces its horizontal padding (~32px → ~16px) on mobile via useIsMobile(). Stat/option grids use `1fr`/`minmax(0,1fr)` columns so they compress without overflow. Further polish (font scaling, 4-col → 2-col stat grids on very small phones) is optional.
- **ESLint baseline (current): `npx eslint .` = 7 errors / 6 warnings.** The §0a "0 errors" claim from PR #40 is stale — new rules (`react-hooks` v6's `set-state-in-effect`) and new non-app files landed since. Current breakdown:
  - **4 errors — `playwright.config.js`** (`no-undef` on `process`): the flat config only declares `globals.browser`, so Node globals in the e2e config are flagged. Harmless; fix by giving that file a Node-globals config block.
  - **3 errors — `tests/fixtures/mockSupabase.js`** (1 `no-empty`, 2 `react-hooks/rules-of-hooks` on a Playwright `page.use(...)` call the rule mistakes for a React hook). Test fixture, not app code.
  - **6 warnings** — the intentional `react-hooks/exhaustive-deps` on mount-load effects + audio autoplay (unchanged since PR #40).
  - **`.claude/**` is ignored** (`eslint.config.js` `globalIgnores`) — it holds Claude Code tooling (skills/commands/worktrees), not app source; it was contributing 15 `no-undef` errors on `require`/`process`.
  - **Zero errors remain in `src/`. Keep it that way** — don't add new ones.
- **Existing ESLint hook-dependency warnings** in some files — don't add new ones.
- **Legacy DB columns** `ease_factor` and old SM-2 `learning_step` semantics are kept in the cards table but unused. Do not write to `ease_factor`.

## Profile after P10-B (2026-08-11)

The redesign is on `claude/hanzi-dojo-continuation-e3vnbg` (`898ad91`, `e3970f6`,
`95c9b74`, `8c24055`, `9cb7ed5`) and **awaiting physical-device QA**. What it
leaves behind, deliberately:

- **The achievement mechanic is gone, by owner decision** — the wall,
  `src/achievements.js`, its test, `ACH_ICONS`, the `EVENTS.ACHIEVEMENT_UNLOCKED`
  analytics event and the Study "Seal earned" toast. Nothing replaces it: no
  streaks, XP, trophies, badges, levels-as-rewards or celebration overlays. The
  `achievement_unlocked` rows already in `analytics_events` are history and were
  left alone.
- **The 17×7 contribution grid is gone**, with `StudyCalendar`, `buildWeeks`,
  `cellColor` and the day-detail interaction. It had quietly reintroduced the
  streak mechanic §Streak-removal deleted. Replaced by "Studied N of the last 30
  days" — descriptive, never consecutive.
- **`monthReview.js` and `reviewAccuracy.js` are deleted**, along with their
  tests. Both existed only for panels P10-B3 removed.
- **The duplicate-metric defect is fixed at the source.** "Words mastered"
  appeared twice on one screen with two different numbers; every figure now comes
  from `src/profileProgress.js` and its label names its scope. The unit tests
  assert the ambiguous wording cannot return.
- **Type styles came to 11, against the audit's target of 8.** Owner-accepted:
  the remaining eleven each carry a distinct job, and reaching eight means
  collapsing hanzi against pinyin against gloss inside one row. Not a debt item —
  a closed decision.

### Two things worth knowing for the next Profile change

- **`tests/e2e/profile-shape.spec.js` is a budget, and it will fail you.** It
  pins ≤2.2 viewports, ≤8 containers, ≤12 type styles and **zero** sub-44px tap
  targets at 320/390/430. Adding a panel is meant to be a deliberate act.
- **The e2e fixture returns leech rows unfiltered.** The `cards` mock ignores
  `.gte('lapses', …)`, so the old panel rendered six words at "missed 0×" and
  nobody noticed for months. `weakList()` now re-checks the threshold client-side
  and `withWeakWords(page, n)` (in `tests/fixtures/mockSupabase.js`) describes a
  learner who really has words slipping. Assume the same about any other mocked
  server-side filter.

## Two things P10-C found (2026-08-11)

- [x] **`homeStory.js` asked `stories` for `cover_url`, which does not exist —
  FIXED in `5c69ea2`.** PostgREST answers an unknown column with a 400,
  supabase-js reports it in `error` and leaves `data` null, and
  `getDailyStoryCard`'s `stories.length === 0` guard returned null. So Home's
  "Then read" hand-off **never rendered in production** for a learner without an
  active series, from the day it was written. Verified against the live schema
  (`42703`). `DAILY_STORY_COLUMNS` is exported and pinned against the real column
  list in `src/homeStory.columns.test.js`; every other `stories` select in `src/`
  was audited and this was the only phantom.

  **The lesson is the test surface, not the typo.** The unit suite never touches
  Supabase, and the e2e mock answers any `select` with its own rows whatever
  columns were asked for — so a query naming a column that has never existed
  passes every gate the repo has. This is the second such blind spot found in two
  days (the first: the leech query's `.gte('lapses')`, which the mock also
  ignores). Assume mocked server-side behaviour is *not* being tested.

- [ ] **Stories' four filter chips are 38px tall**, below the 44px floor the rest
  of the app now holds. Pre-existing, and left alone in C1 because making them 44
  moves the shelf's first row. Worth doing with the next Stories change.


## Speaking is missing from the store apps (recorded 2026-08-11)

- [ ] **The Speaking drill does not exist on iOS or Android.**
  `speechRecognitionSupported()` returns false whenever `isNativeApp()` is true,
  because iOS's WKWebView and Android's WebView both expose
  `webkitSpeechRecognition` and implement nothing behind it — a constructor-only
  check made the drill *look* available and then fail on the first tap. So the
  hub omits it rather than advertising a dead end, and **the store builds offer
  seven drills where the web offers eight.**

  Two consequences worth carrying:

  - **Any local render over-states the app.** A sandbox Chromium supports the
    API, so every screenshot of Practice taken here shows a row an iPhone does
    not have. P11 measurements state which surface they describe.
  - **A whole practice mode is web-only.** Speaking is the app's only production
    drill (say it aloud, get it checked), and store users cannot reach it at all.

  Fixing it needs a native speech plugin (`docs/PRE-RELEASE-CHECKLIST.md` §5) or
  a server-side transcription path — a real piece of work, not a flag. **Not in
  scope for the P11 Practice redesign**, which preserves the existing gating
  exactly and is measured both ways. Recorded here so the gap is a known product
  decision rather than an accident of a webview API.
