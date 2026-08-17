# 🎨 Design Bible — Hanzi Dojo

The permanent design source of truth. `CLAUDE.md` holds the short version; this
file holds the reasoning and the detail.

**What belongs in here:** principles that should survive several redesigns.
**What does not:** the current layout of any particular screen. A Home mockup, a
dock geometry, a nav order, a section list — those are *implementation*, and
they live in the task that builds them, in `git log`, and (once shipped) in
`docs/ARCHITECTURE.md`. Nothing in this file is permission to keep a specific
2026 screen forever.

> **Supersedes "Design Bible v1" (2026-08-16).** v1 mixed durable principles
> with a specific Home structure, bottom-dock geometry and per-screen specs
> written during that week's redesign. The principles are kept and sharpened
> here; the screen-level detail was deliberately removed, because Home and
> global navigation are being decided as their own piece of work. v1 is in
> `git log` if you need it.

**Where this sits in the hierarchy** (also in `CLAUDE.md`):

1. `CLAUDE.md` — permanent product + engineering rules.
2. **this file** — permanent design principles.
3. `docs/ARCHITECTURE.md` — technical truth: schema, tokens, components as built.
4. The current task/spec you were given — what to build now.
5. `docs/superpowers/` and other old specs — history only. **They never
   override 1–4.** A shipped-feature spec describing a screen that has since
   changed is out of date, not an instruction.

---

## 1. Product feeling

**Premium native consumer app × Japanese minimalism × content-first learning.**

In practice:

- **Premium native consumer app** — it should feel like a well-made iOS/Android
  app, not a responsive website in a wrapper. Controls sit where a thumb
  expects them, transitions are quick and physical, nothing reflows or flashes
  on load. Premium comes from precision, not decoration.
- **Japanese minimalism** — restraint, alignment, generous space, few materials
  used consistently. Emptiness is allowed to be empty. This is a *discipline*,
  not a theme: no ornamental temples, lanterns, dragons or brush textures.
  Identity comes from typography, the Chinese content itself, and a restrained
  ink-red accent.
- **Content-first learning** — the Chinese, the story and the learner's own
  progress are the visually memorable things. UI chrome supports them and then
  gets out of the way.

The one-sentence brief: **a calm, modern Chinese learning tool where the content
feels valuable enough that the interface can stay quiet.**

The app is used daily for months. Optimise for the five-hundredth session, not
the first impression: calm, precise, deliberate, modern, confident, and
recognisably Hanzi Dojo.

---

## 2. Product hierarchy — Cards → Stories → Practice

The product's model is **Learn → Understand → Reinforce**:

- **Cards** teach and retain vocabulary through FSRS.
- **Stories** turn learned vocabulary into comprehensible Chinese.
- **Practice** strengthens learned vocabulary through contextual exercises and
  active recall. Listening, writing, speaking and drills are *kinds of
  practice*, not separate top-level pillars.

**The differentiator is the link between them:** the learner can read a story
because the app knows which words they already know. Design should make that
relationship visible — story readability expressed against the learner's own
vocabulary, practice drawn from words they have actually met — rather than
presenting three unrelated destinations that happen to share a nav bar.

Readability against the learner's vocabulary (the "% known" signal) is a
flagship product number, not metadata. It should be easy to scan, not buried in
a row of badges.

When a design choice strengthens that chain, it is probably right. When it makes
the three feel like separate apps, it is probably wrong.

---

## 3. Visual hierarchy

Hierarchy comes first from **typography, spacing, composition, content and
restrained contrast** — and only then from surfaces, borders and colour.

- If a section needs emphasis, try scale, weight, position and space before
  reaching for a container.
- One clearly dominant thing per screen is good. It should be dominant because
  the *content* earns it (a flashcard, a story cover, a chapter), not because a
  panel was painted to look important.
- If removing every gradient, shadow and tint would collapse the hierarchy, the
  hierarchy was never there. The screen should still read in greyscale.
- **Boring is a hierarchy problem, not a decoration problem.** Fix layout, type,
  spacing, content or interaction before adding anything decorative.
- Familiar beats novel. A control should look like what it is; an unusual
  interaction needs to earn its place by improving the learning flow, not by
  being interesting.

---

## 4. Colour

Technical definitions live in `docs/ARCHITECTURE.md` (full palette, token list,
`ink()`, `heroGround()`); this section is the intent.

- **Semantic neutral tokens are mandatory.** Every neutral colour comes from
  `--bg`, `--surface`, `--surface-2`, `--surface-glass`, `--border`, `--text`,
  `--text-muted`, `--text-faint`, `--shadow-1`, `--shadow-2`, `--hairline`. A
  hardcoded neutral hex is a bug — it will not theme.
- **The accent stays data-driven.** Components read the accent from
  `languageTheme(profile.active_language)`. Never a ternary on the language,
  never a hardcoded per-screen accent.
- **The Chinese vermilion (`#B83A24`) is an accent, not the canvas.** Use it for
  active state, the one important action, progress, selection and small brand
  details. Avoid large accent-filled blocks unless there is a product reason
  that survives being asked twice.
- **Raw accent vs `ink()`** — wrap the accent in `ink(hex)` wherever it is *text
  or a drawn mark* (it lifts toward white in dark mode); keep the raw hex for
  tints and borders that already mix into a surface.
- **Tints mix into the surface** — `color-mix(in srgb, <accent> 11%, var(--surface))`,
  never an `<accent>+'14'` alpha hex, which stays light in dark mode.
- **Never carry meaning by colour alone.** Correct/wrong, known/unknown and
  locked/unlocked need a second signal (text, icon, position).

---

## 5. Typography

The stack is what the repo already loads: **Inter** for UI, **Noto Sans SC** for
Chinese (the per-language font comes from `languageTheme`). Do not introduce a
new typeface without a deliberate decision and a check that it renders in both
webviews.

- **Strong, few steps.** A small number of clearly distinct sizes and weights
  beats many near-identical ones. Ultra-heavy weights (800+) are rarely right
  for ordinary UI.
- **Chinese gets room.** Hanzi need more optical space and line-height than
  Latin UI text; never apply Latin letter-spacing conventions to Chinese, and
  never shrink the Chinese to make chrome fit. On a flashcard the word is the
  screen.
- **Reading comfort wins in story surfaces.** Comfortable measure, generous
  line-height, paragraph rhythm — closer to a good ebook than to a dashboard.
- **Sentence case by default** (`New card`, `12 reviews due`, `87% readable`).
  Uppercase is reserved for rare, genuinely tiny categorical metadata where it
  aids scanning — never as a default label treatment.
- **Less microcopy.** One clear line beats a title plus a subtitle plus a hint.
  If a control needs a paragraph, the control is wrong.
- **Type is not decoration.** No oversized numerals, watermark Hanzi or
  display-weight text used purely to fill space.

---

## 6. Spacing and density

Use the **8px rhythm with 4px half-steps** already in the code:

| | |
|---|---|
| **4** | optical correction only |
| **8** | tight internal gap |
| **12** | compact control gap |
| **16** | default mobile padding / component spacing |
| **20** | comfortable content gap |
| **24** | section separation |
| **32** | major section separation |
| **40+** | only when a layout genuinely needs the room |

There is no spacing-token module and this file is not introducing one — inline
styles use raw px on that rhythm. Don't invent 13, 19, 27, 31 repeatedly;
optical exceptions should be rare and deliberate.

- Default mobile horizontal page padding: **16px**.
- **Group with space, not boxes.** A gap change is usually a better grouping
  signal than another border.
- **Generous breathing room over density.** This is a daily-use learning tool,
  not an ops console; nothing on a core screen needs to be dense. Equally,
  empty space has to be doing something — vast blank areas are not minimalism.
- **Touch-friendly controls** — see §13 for the minimum.

---

## 7. Surfaces

**Not every section needs a card.** Cards and panels are tools for grouping,
interaction and layering — not the default layout primitive. A screen of six
rounded rectangles is a symptom, not a design.

Rough ladder, lightest first:

| Level | Use it when |
|-------|-------------|
| **Flat content on the page background** | The default. Text, lists, headings, most sections. |
| **`Panel`** | A group genuinely needs a boundary — mixed content that would otherwise run together, or a tappable unit. |
| **Elevated / lit surface** (`HeroPanel`) | One object is genuinely the subject of the screen and benefits from being lifted off the ground. Available, useful, **not required** — see §14. |
| **Sheet** | Transient, focused detail over retained context (a word lookup, a picker). Dismissible, respects safe areas. |
| **Overlay / modal** | A blocking decision or a full-attention moment. Rare. |

Rules that hold across all of them:

- At most two competing surface treatments on one screen.
- One radius vocabulary, not five: compact controls ~10–12px, ordinary panels
  ~14–16px, a major content object ~20px, full pill only for real pills
  (filters, segmented controls, compact status). Not every rectangle is a
  24–30px blob.
- Structure comes from spacing and contrast first, a hairline border second, a
  shadow last. Use `--shadow-1`/`--shadow-2`/`--hairline` rather than one-off
  box-shadows, and only shadow things that are meant to float. Never three
  shadow strengths on one screen.
- **Glass/translucency is for system layers only** — floating navigation,
  overlays, sheets, transient chrome — and only where it performs in
  WKWebView/Android WebView. Ordinary content surfaces stay opaque.
- **The flex scroll rule** (bites constantly): any `flex: 1` scroll area inside a
  `position: fixed` or fixed-height flex column needs `min-height: 0`.

---

## 8. Navigation

Principles only. **The current Home and global-navigation design is its own
decision — do not encode a specific dock, tab order, CTA layout or Home section
list here.**

- **Mobile first.** Navigation is designed for a thumb on a phone; desktop
  adapts to it, not the other way round.
- **Clear active state**, readable without colour alone.
- **No layout shift on selection.** Tabs do not resize, reflow or bounce when
  chosen; geometry is fixed.
- **Safe-area aware**, top and bottom, on every device it runs on.
- **Navigation must not obscure content.** Anything fixed or floating owns a
  reserved amount of space; scrollable content ends above it, not behind it.
- **Focused experiences may hide global navigation** — reading, a study session,
  a drill — as long as the way out is obvious and predictable.
- **One coherent icon family** (`lucide-react`), consistent stroke and size.
  Emoji are content, never UI icons. A custom brand glyph must be simpler than
  the UI around it.
- Destinations are few and stable. Renaming or reordering them is a product
  decision, not a styling one.
- Navigation should be invisible after five minutes of use.

---

## 9. Motion

Motion communicates state change. It is not decoration.

- **Fast and subtle.** Press feedback ~80–120ms; small state changes ~160–220ms;
  navigation/sheet transitions ~220–320ms.
- **Functional only** — a reveal, continuity between two screens showing the
  same object, a sheet growing from where it was summoned, list insert/remove
  that aids orientation.
- **Interruptible** where the user can act during it. Never block input waiting
  for an animation to finish.
- **`prefers-reduced-motion` is fully supported**, everywhere, with a static
  end-state that still makes sense.
- Avoid: staggered entrance choreography as a default, springs and bounce on
  serious learning controls, simultaneous scale+blur+fade+slide, and re-running
  entrance animations every time a screen is revisited.

---

## 10. Dark mode

Dark mode is a designed mode, not an inversion.

- **Surfaces** step up from the background in small, deliberate increments; a
  dark screen should not be a stack of near-identical greys, nor pure black with
  floating white boxes.
- **Text** uses the tokens; muted/faint stay legible against dark surfaces.
- **Accent** uses `ink()` wherever it is text or a mark, so it lifts instead of
  sinking, while staying recognisably the same brand colour.
- **Borders** carry more of the structure in dark mode than shadows do.
- **Overlays and scrims** must not turn the whole screen into mud; keep the
  layer beneath readable enough to give context.
- **Translucency** is checked in dark mode explicitly — a glass layer that reads
  as frosted in light can read as dirty in dark.
- **Shadows** flip to near-black and do far less work; do not compensate by
  making them heavier.

Every visual change is reviewed in both modes before it ships. "Looks fine in
light" is half a review.

---

## 11. Mobile behaviour

The primary environment is a native mobile shell (Capacitor → WKWebView /
Android WebView). Design for it first.

- **Safe areas** on all four edges; nothing important under a notch, a home
  indicator or a status bar.
- **Check 320px, 390px and 430px.** 320 is the sanity floor — it may be tight,
  it may not break.
- **No horizontal overflow, ever.** A row that must scroll scrolls inside its
  own container, not by moving the page.
- **Touch targets ≥44×44px** for anything tappable, including icon-only controls.
- **Fixed and floating controls may never cover content** at the end of a
  scroll; reserve their height.
- Critical actions should be reachable one-handed on a common phone.
- Webview reality check: audio, storage, OAuth, haptics and system fonts behave
  differently there than in a desktop browser. Verify, don't assume.

---

## 12. Desktop behaviour

Desktop should look considered — it is where the public/legal surface and much
of the testing live — but mobile is the design priority.

- Constrain content to a comfortable max-width; do not let a mobile layout
  stretch across a 1920px window.
- Extra width buys spacing and, where genuinely useful, a second column — not a
  different visual language.
- Hover states are additive; nothing may be reachable *only* by hover.
- Keyboard use is a first-class path on desktop (§13).

---

## 13. Accessibility

Not a pass at the end — a constraint while designing.

- **Contrast** meets WCAG AA for text and meaningful marks, in both themes.
- **Semantic controls** — a button is a `<button>`, a link is a link. Do not
  rebuild controls out of divs.
- **Focus is visible** and follows a sensible order; dialogs and sheets trap
  focus and return it on close.
- **Screen-reader labels** describe the destination or action, not the icon
  shape. Chinese text is marked with the right language so it is not read with
  an English voice.
- **Reduced motion** is honoured (§9).
- **Minimum practical touch target 44×44px** (§11).
- **Never colour alone** for state (§4).
- **Survive larger text** where practical — a layout that breaks at a bigger
  system font size is not finished.

---

## 14. Anti-patterns

Named so they can be pointed at in review:

- **Dashboard UI** — a learning screen turned into a metrics console.
- **Card soup** — every section in its own rounded rectangle; multiple competing
  card styles on one screen.
- **Giant accent blocks** — vermilion used as a canvas instead of an accent.
- **Mandatory hero** — the old "exactly one `HeroPanel` per screen" rule.
  `HeroPanel` remains a legitimate component where one object really is the
  subject; it is **not** a required structure, and no screen should grow a lit
  panel to satisfy a template.
- **Generic glassmorphism** on ordinary content surfaces.
- **Decorative gradients, glows, mesh, blobs, ink washes and background
  illustration** used to make a weak screen look interesting.
- **Watermark Hanzi** and ornamental characters as atmosphere.
- **Stat-tile walls, unnecessary pills, arbitrary badges** and a coloured icon
  tile on every row.
- **Uppercase microcopy everywhere.**
- **Fake gamification** — XP, streaks, leagues, confetti, celebration noise.
  These were deliberately removed from the product; do not reintroduce their
  visual language.
- **Mixed icon families** or emoji standing in for icons.
- **Duplicated navigation patterns** — two ways to reach the same place, looking
  different.
- **Web-page furniture in an app** — a page title plus subtitle plus toolbar at
  the top of every screen.
- **Visual change with no product reason** — restyling something because it was
  there, during a task that was about something else.
- **Screens forked into twins** — a "mobile version" file and a "desktop
  version" file of the same screen. They rot apart.

---

## 15. The decision test

Before shipping a new visual element, ask:

1. Does it help the learner understand what to do next?
2. Does it strengthen the **Cards → Stories → Practice** relationship?
3. Could spacing or typography solve this without another card?
4. Is the accent colour actually necessary here?
5. Does it feel native and intentional — or generated?
6. Does it work in dark mode?
7. Does it work at 320px, with safe areas and a 44px touch target?
8. Is the UI serving the content, or competing with it?

If several answers are weak, the fix is the hierarchy, not more polish.

---

## Working rules

Not visual principles, but they protect them.

**Copy.** Write like a calm tool: `12 reviews due`, `Start cards`, `Nothing due`,
`Continue reading`. Not `You're crushing it! 🔥`, `Don't lose your streak!` or
generic coach encouragement. The content is the motivation. Copy is
observational, never guilt-based (`CLAUDE.md` §1).

**Empty, loading and error states are design, not placeholders.** Loading
preserves the final geometry with a quiet skeleton rather than a spinner where
the structure is already known. Empty says what the state means and offers one
relevant next action. Errors use plain language, say what can be retried and
what data is safe, and are never decorated.

**One component, one appearance.** The same semantic control should not look
different on two screens because two sessions built it. Before inventing a new
component style, check whether an existing primitive can carry the same
information.

**Restyle before rewriting.** A visual task does not rewrite working product
logic, does not add features, and does not change several core screens before
the first one is approved. If a design proposal requires breaking proven
behaviour, it has to say why the user benefit outweighs it.

**Ask for the problem, not the polish.** A design task should name the user
problem, what may change structurally, what must be preserved, and how it will
be judged. "Make it more premium" is not a task.

---

## Appendix — what this file is not

- **Not the token reference.** That is `docs/ARCHITECTURE.md`.
- **Not a screen spec.** Current screens are described by the code; past ones by
  `git log` and `docs/superpowers/`.
- **Not a licence to redesign.** A styling task does not include rewriting
  working product logic, and a visual pass does not add features.
