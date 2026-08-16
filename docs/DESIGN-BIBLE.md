# Hanzi Dojo Design Bible v1

> **Status:** Product design source of truth for the mobile app.
> **Goal:** Make Hanzi Dojo feel like a deliberate, premium learning tool — not a repackaged website, a generic SaaS dashboard, a Duolingo clone, or an AI-generated concept app.

---

## 1. North star

Hanzi Dojo is **the better Anki experience for Chinese learners**: serious spaced repetition, directly connected to stories and practice that adapt to the vocabulary the learner actually knows.

The design must make this loop obvious without explaining it constantly:

**Learn words → remember them → meet them in stories → practice them in context.**

The product's strongest idea is not a visual motif. It is the relationship between a learner's vocabulary and the content they can now understand.

### The one-sentence design brief

**A calm, modern Chinese learning tool where the content feels valuable enough that the interface can stay quiet.**

---

## 2. Who we are designing for

Primary user:

- Serious beginner/intermediate Chinese learner, roughly HSK 1–4.
- Understands the value of flashcards or is already using/considering Anki.
- Wants an efficient system, not a game pretending to be language learning.
- Wants level-appropriate reading but finds it difficult to locate material that matches their vocabulary.
- May use the app every day for months or years.

This means the interface should optimize for **repeat use**, not first-impression spectacle.

---

## 3. Product personality

Hanzi Dojo should feel:

- **Calm** — no pressure, noise, fake urgency or casino feedback.
- **Precise** — hierarchy and numbers mean something.
- **Modern** — excellent mobile spacing, typography, interaction and motion.
- **Confident** — the app does not over-explain or decorate ordinary controls.
- **Human** — copy sounds like a useful tool, not an AI coach.
- **Chinese-aware, not Chinese-themed** — typography, language content and a restrained ink-red accent provide identity. No cliché temples, lanterns, dragons, brush textures or ornamental pseudo-Asian UI.

Reference feeling: a polished reading/productivity app, not a game and not a marketing website.

---

## 4. The anti-slop rules

These are hard constraints. Breaking one requires a specific product reason.

### Never use decoration to solve weak hierarchy

Do **not** add:

- decorative gradients behind ordinary content
- ink washes or atmospheric overlays inside generic cards
- giant hero areas just because the screen needs visual interest
- random floating blobs, glows or mesh gradients
- background illustrations on core learning screens
- excessive glassmorphism
- ornamental Chinese characters used as watermarks
- unnecessary badges, chips or pills
- multiple competing card styles on one screen
- huge empty vertical space marketed as "premium minimalism"
- an icon in a colored rounded square for every row
- uppercase microcopy everywhere
- three different shadow strengths on the same screen
- animation simply because an element appeared

If a screen looks boring, fix **layout, type hierarchy, spacing, content or interaction** before adding decoration.

### Never design by novelty

A control should look familiar enough that a user knows what to do.

Avoid unusual interaction patterns unless they materially improve the learning flow. Hanzi Dojo should not need a paragraph in the source code explaining why a navigation control behaves differently from normal mobile navigation.

### One visual idea per screen

The screen may have one visually dominant object because the **content** earns it: e.g. the current flashcard or a story cover.

Everything else should support it quietly.

---

## 5. Visual foundation

## 5.1 Color

### Light theme

Use neutral warm paper, not beige decoration:

- `bg`: `#F7F7F5`
- `surface`: `#FFFFFF`
- `surface-subtle`: `#F1F1EF`
- `border`: `#E5E5E2`
- `text`: `#171717`
- `text-secondary`: `#676767`
- `text-tertiary`: `#8A8A86`
- `accent`: Chinese ink red, current family around `#B83A24`

The accent is for **meaning and action**, not atmosphere.

Use accent for:

- selected navigation state
- the primary action when an action needs emphasis
- progress/readability highlights
- active controls
- important vocabulary interaction

Do not tint whole screens or large generic panels red.

### Dark theme

Dark mode should feel deliberately dark, not like the light UI with variables inverted:

- `bg`: approximately `#0F1012`
- `surface`: approximately `#191A1D`
- `surface-subtle`: approximately `#222326`
- `border`: approximately `#2B2C30`
- `text`: approximately `#F1F1F1`
- `text-secondary`: approximately `#A2A2A7`

Accent may be lifted slightly for contrast, but should remain recognizably the same brand color.

### Color rule

**If removing the accent color makes the hierarchy collapse, the hierarchy was weak.**

The UI must still read correctly in grayscale.

---

## 5.2 Typography

### Latin UI

Use **Mona Sans** as the primary interface typeface if it continues to render cleanly across iOS and Android. Stop mixing Mona Sans and Inter arbitrarily inside the product shell.

Default hierarchy:

- Screen title: 24–28px / 700
- Section title: 17–19px / 650–700
- Primary body: 15–16px / 450–550
- Secondary body: 13–14px / 450–550
- Metadata: 11–12px / 550–650

Avoid ultra-heavy 800+ weights for normal UI.

### Chinese

Chinese text is content, not decoration.

- Give Hanzi more breathing room than Latin UI text.
- Keep large vocabulary words visually dominant on flashcards.
- Do not force Latin letter-spacing conventions onto Chinese.
- Never uppercase romanized metadata as a default aesthetic treatment.

### Labels

Sentence case by default.

Prefer:

- `New card`
- `87% readable`
- `12 reviews due`

Avoid defaulting to:

- `NEW CARD`
- `STORY`
- `PRACTICE`

Uppercase is reserved for rare, genuinely tiny categorical metadata where it improves scanning.

---

## 5.3 Spacing

Use an 8px rhythm with 4px half-steps.

Core values:

- 4 — optical correction only
- 8 — tight internal gap
- 12 — compact control gap
- 16 — default mobile padding / component spacing
- 20 — comfortable content gap
- 24 — section separation
- 32 — major section separation
- 40+ — only when a layout genuinely needs breathing room

### Mobile page rule

Default horizontal page padding: **16px**.

Do not invent 13px, 19px, 27px and 31px repeatedly. Optical exceptions are allowed but should be rare.

---

## 5.4 Radius

Keep the radius vocabulary small:

- 10–12px — buttons, compact controls
- 14–16px — ordinary cards / panels
- 20px — major interactive content card
- full pill — only for true pills: filters, compact status, segmented controls

Do not make every rectangle a 24–30px rounded blob.

---

## 5.5 Borders and elevation

Most structure should come from spacing and contrast, not shadows.

Default surface:

- 1px subtle border OR subtle tonal separation
- no shadow unless the object is physically meant to float

Floating navigation / sheets may use one restrained shadow.

Avoid layered dramatic shadows on ordinary content cards.

---

## 6. Mobile shell

Hanzi Dojo is now a mobile-first product. The shell should feel native even though the implementation is React inside Capacitor.

## 6.1 Top area

Core screens should not begin with a web-style page header plus explanatory subtitle plus dashboard section.

Use:

- compact top safe-area spacing
- one clear title when a title is needed
- profile/settings action where context requires it

Home does not need to shout "Home".

## 6.2 Bottom navigation

Keep the floating form if desired, but make its behavior conventional.

Recommended:

- 16px horizontal inset
- approximately 58–64px visual height
- three equal destinations
- fixed geometry; tabs do **not** resize when selected
- selected state uses accent + subtle background/tint
- no centre-tab pedestal
- no notch
- no oversized active capsule
- no bouncing or elastic flex animation

A subtle translucent material is acceptable **only here or in other persistent chrome**, if it performs reliably in WKWebView/Android WebView. Content cards should remain opaque.

The navigation should feel invisible after five minutes of use.

---

## 7. Home

Home has one job:

> **Show me what I should do next and let me begin immediately.**

The current product logic — Home contains the learner's real next task and hands directly into Study — is worth preserving. Do not rewrite working session preparation or zero-loading transition behavior merely to restyle the page.

### Structure

1. Compact top area: date/context + profile.
2. Current task object.
3. Quiet preview of what comes after it.
4. Bottom navigation.

### Current task

Before cards are complete, the flashcard can be the dominant object.

But it should feel like **a real flashcard**, not a website hero panel:

- neutral surface
- generous Hanzi
- restrained state indicator
- clear tap/start affordance
- no decorative background
- no watermark
- no gradient
- no giant marketing CTA

The card should occupy enough screen space to feel intentional, but not so much that the page looks empty merely because the card is artificially tall.

### After cards

The same area may transition to the recommended story.

A real story cover is allowed to carry strong visual weight because it is content. If there is no cover, use typography rather than synthetic decoration.

### Supporting steps

Cards / story / practice status should look like a clean progression, not three dashboard widgets.

Use rows, subtle dividers and concise status.

### Home success test

A new user should understand within ~3 seconds:

- what their next action is
- what happens after it
- where the three main areas of the app are

---

## 8. Flashcard Study

This is the highest-frequency screen. Optimize for concentration and speed.

### Priority hierarchy

1. Word / Hanzi
2. Reading + meaning after reveal
3. Context/example
4. Grade actions
5. Secondary controls

### Rules

- One card surface.
- No ornamental card frame.
- No competing panels inside the card unless semantically necessary.
- Audio controls remain secondary.
- Grades are large, thumb-friendly and visually distinct without becoming four neon blocks.
- Schedule previews are useful but visually subordinate to the grade labels.
- Session progress is visible but quiet.
- Exit/undo controls are predictable and stay in stable positions.

The learner should be able to complete dozens of cards without visual fatigue.

---

## 9. Stories Library

Stories are not a settings list and not a Netflix clone copied literally.

The library should communicate three things extremely well:

1. **What looks interesting?**
2. **Can I understand it?**
3. **Where am I in the series?**

### Story card hierarchy

- cover
- title
- level
- **% readable / known vocabulary**
- chapter/progress state where relevant

The readability percentage is a flagship product signal and should be visually easy to scan.

Example:

**87% readable**

not buried inside three metadata badges.

### Covers

- consistent vertical aspect ratio
- consistent crop behavior
- no stretched art
- no redundant decorative frame around already-strong cover art

### Series

When opening a series, use a clear series detail screen with vertical cover, concise description and chapters/episodes beneath it.

Do not mimic Netflix chrome for its own sake. Borrow only the useful information architecture.

---

## 10. Story Reader

The reader should feel closer to a good ebook app than to a language-learning dashboard.

### Reading mode

- maximum visual calm
- no persistent bottom navigation while actively reading
- strong typography and line-height
- comfortable margins
- paragraph/content rhythm, not card rhythm

### Word interaction

Tap a word → immediate lookup.

Lookup sheet should prioritize:

1. word
2. pinyin
3. meaning
4. whether it is already known / learning
5. one useful action

Do not turn the lookup sheet into a mini dashboard.

### Known-word visualization

If known/unknown highlighting exists, it must remain subtle enough that Chinese text still looks like text rather than a heatmap.

---

## 11. Practice

Practice should visually inherit from Study, not become a separate game mode aesthetic.

- consistent question framing
- one task at a time
- answer feedback is clear but not celebratory noise
- correct/wrong state uses semantic color carefully
- explanation appears close to the answer
- next action stays in a stable position

No confetti, XP explosions or streak pressure.

---

## 12. Components

Create a small, strict component vocabulary.

Core primitives should include:

- `Screen`
- `TopBar`
- `SectionHeader`
- `Surface`
- `TaskCard`
- `ListRow`
- `PrimaryButton`
- `SecondaryButton`
- `IconButton`
- `Chip` / `Badge` only when semantically justified
- `BottomDock`
- `Sheet`
- `EmptyState`

Before inventing a new component style, ask whether one of these can represent the same information.

### One component, one appearance

The same semantic control should not look different on Home, Stories and Profile because different AI sessions implemented it.

---

## 13. Iconography

Use Lucide consistently unless a specific custom glyph is a core brand asset.

Rules:

- same stroke family across the shell
- default 20–24px navigation/action icons
- avoid decorative icon tiles
- never use emoji as UI icons
- icons support labels; they do not replace unclear concepts

Custom nav glyphs must be simpler than the UI around them, not mini illustrations.

---

## 14. Motion

Motion communicates state change. It is not decoration.

### Timing

Typical ranges:

- press response: 80–120ms
- small state change: 160–220ms
- navigation/sheet transition: 220–320ms

### Good motion

- flashcard reveal
- Home task → Study card continuity
- sheet appearing from its physical origin
- navigation selection changing
- list insertion/removal when it helps orientation

### Avoid

- every section rising into place on every screen load
- stagger animation as a default
- spring/bounce on serious learning controls
- simultaneous scale + blur + fade + slide
- re-running entrance animation whenever the user revisits a screen

Reduced-motion must remain fully supported.

---

## 15. Copy

Write like a calm tool.

Prefer:

- `12 reviews due`
- `Start cards`
- `87% readable`
- `Nothing due`
- `Continue reading`

Avoid:

- `You're crushing it! 🔥`
- `Amazing job!`
- `Don't lose your streak!`
- `Unlock your full potential`
- generic AI-coach encouragement

The content itself is motivating.

---

## 16. Empty, loading and error states

These states are part of the product design, not placeholders.

### Loading

Prefer preserving final geometry with a subtle skeleton. Avoid spinners when the screen can keep its structure.

### Empty

Tell the user what the state means and provide one relevant next action.

### Error

Plain language. Explain what can be retried or what data remains safe.

Do not decorate failures.

---

## 17. Accessibility and ergonomics

- minimum practical touch target: 44×44px
- critical actions reachable one-handed on common phone sizes
- WCAG-appropriate contrast
- never communicate state by color alone
- Dynamic Type-like resilience: UI must survive larger text where practical
- visible focus states for web/keyboard use
- reduced-motion support
- screen reader names must describe destination/action, not icon shape

---

## 18. Responsive behavior

Design mobile first at:

- 320px narrow device
- 390px standard target
- 430px large phone

Do not design at desktop width and collapse it later.

Core mobile layouts should be deliberately checked at all three widths before approval.

Tablet/desktop may expand spacing and max-width but should not introduce an entirely different visual language.

---

## 19. Existing design system: what survives, what should be retired

### Preserve

- semantic theme variables
- language-driven accent source
- accessibility work
- shared geometry contracts such as bottom-safe-area handling
- reduced-motion handling
- session-preparation / Home-to-Study continuity
- story readability as a first-class metric
- real content instead of fake dashboard examples

### Reconsider / retire from core mobile flows

- `HeroPanel` as a universal design primitive
- "one lit panel" as the defining visual language
- `InkWash` decoration
- `heroGround()` gradients for generic app surfaces
- watermark Hanzi as atmosphere
- default uppercase `MICRO` styling everywhere
- global staggered `hd-rise` entrance behavior
- expanding-flex active navigation tab
- large-radius cards as the default answer to hierarchy

These patterns are not forbidden in every possible future marketing surface; they should simply stop defining the daily learning UI.

---

## 20. Home implementation constraint

The latest Home has valuable product behavior that should not be casually destroyed during visual redesign:

- it prepares the same actual first Study card
- Study claims that prepared session immediately
- Home → Study can preserve object continuity
- the task changes from cards → story → practice based on real state

**Restyle before rewriting.**

If a design proposal requires breaking this logic, it must explain why the user benefit outweighs the proven fast transition.

---

## 21. Design process from now on

### Step 1 — Define the problem

Example:

> Home feels like an AI-designed webpage because the primary object is oversized, supporting hierarchy is weak and navigation is visually novel.

Not:

> Make Home more premium.

### Step 2 — Make 2–3 materially different static directions

Do not implement three production versions.

Directions should differ in information hierarchy, not merely colors.

### Step 3 — Owner selects direction

No coding polish before the direction is approved.

### Step 4 — Implement one screen

Test on a real iPhone/Android device.

### Step 5 — Propagate system

Only after the screen proves the system should components/tokens spread to the other core screens.

---

## 22. AI implementation rules

Claude/Codex are implementers, not autonomous art directors.

Every design task must provide:

- the user problem
- screenshot/reference context if available
- relevant Design Bible rules
- allowed structural changes
- things that must be preserved
- exact acceptance criteria

### AI must not

- add visual decoration to make a screen "premium"
- create a new design primitive when an existing one works
- introduce gradients/glass/shadows without an explicit reason
- rewrite working product logic during a styling task
- add new product features during visual polish
- change multiple core screens before the first one has been visually approved

---

## 23. The 30-second anti-slop review

Before accepting any screen, ask:

1. If all gradients/shadows were removed, would the hierarchy still be excellent?
2. Is there one obvious thing to do next?
3. Does any component look like it exists primarily to make the screenshot impressive?
4. Is there unnecessary empty space?
5. Are there more than two card/surface treatments competing?
6. Are pills/badges being used as decoration rather than information?
7. Does it look like an app used every day, or a Dribbble concept?
8. Could this screen plausibly belong to the same product as Study and Reader?
9. Does the screen show real learning content as early as possible?
10. Would Fabian still like it after seeing it 500 times?

If several answers are bad, do not polish the current direction. Revisit the hierarchy.

---

## 24. Release-quality visual gate

The five core screens are visually ready when:

- Home, Study, Stories, Reader and Practice clearly belong to the same product.
- Typography, spacing, radii, control geometry and navigation are consistent.
- Light and dark modes both feel intentional.
- No screen looks like a responsive website placed inside an app wrapper.
- No screen relies on decorative AI-style effects for visual interest.
- Real-device screenshots at 320/390/430 widths show no awkward empty zones, clipping or web-like spacing.
- A tester can identify the primary action without instruction.
- The content — Hanzi, stories and learning state — is more visually memorable than the chrome.

---

## 25. Final principle

**Hanzi Dojo should not look impressive because it has more design. It should look expensive because nothing feels accidental.**
