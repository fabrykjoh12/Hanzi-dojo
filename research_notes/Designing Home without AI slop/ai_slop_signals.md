# AI-slop UI signals, and what replaces them in well-crafted mobile design (applied to the HanziDojo Home card)

Method note: I used web search plus full fetches. Only three pages could be fetched in full: Anthropic's frontend-aesthetics cookbook, the Laith0003 "Anti AI slop ban list" wiki on GitHub, and styleseed's VISUAL-CRAFT.md on GitHub. These hosts could not be reached from the sandbox: thefountaininstitute.com, cdn.jsdelivr.net (pixelslop catalog) and jakub.kr. Findings from those sources come only from search-result summaries and are labelled that way. Most of the "AI slop" literature is practitioner blogs and agent-skill catalogs, not research. It is community consensus, not measured fact.

## 1. What designers name as the hallmarks of AI-generated UI (2025–2026)

### Takeaway
The tells are on-distribution defaults: purple/indigo gradients, Inter/Roboto, centered hero plus three equal icon cards, one radius on everything, glass and glow, emoji icons, gradient text, invented round-number stats and filler verbs. The common diagnosis is that the model or designer fell back to the average. The fix is a deliberate, context-specific choice, not swapping in a different default.

### Cited Findings
- Anthropic's own guidance says models "converge toward generic, 'on distribution' outputs… what users call the 'AI slop' aesthetic." It names overused fonts (Inter, Roboto, Arial, system fonts), "purple gradients on white backgrounds", "predictable layouts and component patterns" and "cookie-cutter design that lacks context-specific character." — [Anthropic cookbook: Prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- The same guidance notes that even after steering, Claude "still tend[s] to converge on common choices (Space Grotesk, for example)". The replacement can become the new slop. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Anthropic's typography rules: "Use extremes: 100/200 weight vs 800/900, not 400 vs 600. Size jumps of 3x+, not 1.5x." "Pick one distinctive font, use it decisively." Pairing should be high-contrast, e.g. serif + geometric sans. — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Anthropic on colour: "Dominant colors with sharp accents outperform timid, evenly-distributed palettes." On backgrounds: "Create atmosphere and depth rather than defaulting to solid colors." On motion: "one well-orchestrated page load with staggered reveals… creates more delight than scattered micro-interactions." — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Concrete ban list with the exact slop CSS values:
  - the default gradient `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`;
  - glow on every card, `0 0 80px rgba(120,80,200,.6)`;
  - heavy shadow on flat cards, `0 20px 60px rgba(0,0,0,.3)`, to be replaced by `0 1px 3px rgba(0,0,0,.1)` or no shadow;
  - glassmorphism on every panel (`backdrop-filter: blur(20px); background: rgba(255,255,255,.1)`), at most one glass element, "only where translucency has a purpose";
  - one radius for everything (12px);
  - gradient headline text;
  - faux-3D shadows on flat elements ("commit to true depth or stay flat");
  - centered everything;
  - Title Case everywhere;
  - loose letter-spacing on body text;
  - cards wrapping everything ("use cards only to signal groupings");
  - emoji as icons;
  - mixed icon styles;
  - fade-up on every element;
  - 600ms routine animations (use 100–150ms routine and 200–300ms significant);
  - round-number stats;
  - filler verbs such as "empower, leverage, unlock, enable, transform".

  — [Laith0003, Anti AI slop ban list (GitHub wiki)](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)
- The same list allows all-caps only for "short labels, badges, and eyebrow text". The eyebrow itself is not banned, but it is listed as a placement where caps are tolerated. — [Laith0003 ban list](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)
- The biggest "surface defaults" are listed as purple gradients, glassmorphism, emoji icons, 3D blobs and the centered hero plus three cards. Emoji at 32px above card headings is a tell because emoji render differently across platforms and lack a consistent stroke weight. — via search summary of [innovatemap](https://innovatemap.com/resource/signs-of-ai-generated-ui) / [UI Craft "Seven tells"](https://skills.smoothui.dev/blog/gradient-text-and-other-tells) (not fetched in full)
- "Glass effect with a glowing border and coloured status dots" and "numbers that mean nothing in a floating glass panel" are named tells. Equal card grids "imply every item matters equally, which is almost never true." — search summaries of [noqode.fr](https://www.noqode.fr/en/blog/design-ia-generique), [vibecodekit](https://vibecodekit.dev/ai-slop-design), [sikora.software](https://sikora.software/blog/ai-website-design) (not fetched)
- The vibe-coded look is "every dashboard looks like the same purple-accented shadcn template"; stock slate cards with default radius and spacing; rainbow side tabs and status dots "on every block… nothing is actually being communicated". The diagnosis is that "given a description, the agent falls back to its average." — search summaries of [uxmagic](https://uxmagic.ai/blog/vibe-coding-designers-spec-driven-workflow), [codemyspec](https://codemyspec.com/blog/vibe-coded-websites-look-the-same), [Fountain Institute "7 signs"](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui) (not fetched)
- Generated illustration tells: "generic blobs and flat-style stock poses"; a hastily drawn mascot or scene "can make a finished page feel unfinished — use a well-made illustration… or leave it out"; illustrations "full of tiny decorative details that don't quite add up to an actual idea". — search summaries of [Hallmark catalogue](https://instagit.com/Nutlope/hallmark/hallmark-anti-patterns-detected.md), [impeccable](https://impeccable.style/gallery), [mikareyes.com](https://mikareyes.com/ai/how-to-spot-ai-made-graphic-design-and-posters)
- Copy tells: "weightless headline copy ('Build faster. Ship smarter.')" — search summary of [925studios](https://www.925studios.co/blog/ai-slop-design-tells). "Unnecessary labels… the extra text isn't telling users anything they don't already know from the headline." — search summary of [innovatemap](https://innovatemap.com/resource/signs-of-ai-generated-ui)
- Warning: "the failure mode of every anti-slop effort is replacing one default look with another." — search summary of [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)

### Inferences
- Every rejected HanziDojo attempt matches a catalogued tell:
  - Saturated vermilion hero block: a dominant colour block and the "big CTA banner" / gradient-hero family.
  - White rounded card with a giant number and a red button: the "giant stat in a card" and "one primary CTA" template.
  - Frosted glass card: glassmorphism used as decoration.
  - Ink progress ring: a decorative progress widget, the Apple-Fitness-ring cliché.
  - Word chips plus a red seal: pills and "cultural" ornament.
  - Framed rice-paper card with vertical text: costume. The motif is used as decoration rather than meaning.
- In each case the motif or component was chosen because the pattern exists, not because the content required it.
- The common thread is surfaces and ornament standing in for hierarchy. This matches CLAUDE.md §5: hierarchy should come from type, spacing and composition first.

### Gaps
- No primary or quantitative study of which tells users actually perceive. One Show HN audit figure appears only in secondary summaries and was not verified.
- "Uppercase letter-spaced eyebrow label" and "centered giant stat number" are widely repeated in practitioner talk, but no fetched source names them as standalone tells. The closest are "unnecessary labels" and "numbers that mean nothing".

## 2. Craft details that separate premium apps

### Takeaway
Premium apps feel premium through many small, consistent decisions:
- a typographic scale with real contrast;
- one accent with stable roles;
- light, purposeful elevation (hairlines or tonal surfaces in place of big shadows);
- concentric radii;
- tabular numerals;
- optical (not geometric) alignment;
- de-emphasised labels;
- real, specific content;
- short, state-driven motion.

### Cited Findings
- Nested radius: inner = outer − padding (via `calc()`, clamped ≥ 0), from a radius token scale such as 4/8/12/16/full. — [styleseed VISUAL-CRAFT.md](https://github.com/bitjaru/styleseed/blob/main/engine/VISUAL-CRAFT.md). Same rule (outer = inner + padding), with a caveat to treat layers as separate surfaces when padding is large. — search summary of [jakub.kr "Details that make interfaces feel better"](https://jakub.kr/writing/details-that-make-interfaces-feel-better) and [ECC skill](https://github.com/affaan-m/ECC/blob/main/skills/make-interfaces-feel-better/SKILL.md)
- Vary radii by role: pills 9999px, cards 8–16px, inputs 4–6px, modals 16–24px. — [Laith0003 ban list](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)
- Tabular figures (`font-variant-numeric: tabular-nums`) are "mandatory" for counters, timers and dashboards, applied to the whole numeric grid. Optical correction of glyphs and icons beyond bounding boxes; "padding may be unequal when optical alignment… requires it." — [styleseed](https://github.com/bitjaru/styleseed/blob/main/engine/VISUAL-CRAFT.md)
- Type values:
  - scale ratios: dense UI 1.125–1.2, default 1.25, editorial 1.333, display 1.5–1.618;
  - line-height: display 1.0–1.2, headings 1.2–1.35, body 1.5;
  - Latin display tracking −0.01 to −0.03em; uppercase labels +0.05 to +0.12em;
  - "CJK… need their own checks."

  — [styleseed](https://github.com/bitjaru/styleseed/blob/main/engine/VISUAL-CRAFT.md)
- Depth semantics: small tight shadows mean near the page; large blurry shadows mean floating (modals). "In dark mode, prefer tonal elevation (a lighter surface) over shadow." — [styleseed](https://github.com/bitjaru/styleseed/blob/main/engine/VISUAL-CRAFT.md)
- Hairlines in place of shadows: Linear-style cards use 1px hairline borders at 12px radius. A light-mode hairline is about 7% black. In dark mode use a white-alpha border, because shadows disappear there. — search summaries of [VoltAgent Linear DESIGN.md](https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md), [rationalgo](https://rationalgo.ai/resources/app-builder/prompts/prompt-website-feel-premium)
- Stripe uses slightly asymmetric button padding to compensate optically. — search summary of [refero Stripe style](https://styles.refero.design/style/48e5de76-05d5-4c4e-a269-c7c245b291ec)
- Colour restraint: neutral chrome plus one action accent, with stable roles; colour never carries meaning alone. Contrast floors: 4.5:1 body, 3:1 large text and UI. Re-derive dark-mode roles rather than inverting. — [styleseed](https://github.com/bitjaru/styleseed/blob/main/engine/VISUAL-CRAFT.md)
- Motion: one duration set (~150/200/300ms) and one easing family — [styleseed](https://github.com/bitjaru/styleseed/blob/main/engine/VISUAL-CRAFT.md). Animate only on state change, using `transform`/`opacity` only; easing `cubic-bezier(0.4,0,0.2,1)` — [Laith0003](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)
- Labels: "De-emphasize the label by making it smaller, reducing the contrast, using a lighter font weight… Simply using a darker color for the label and a slightly lighter color for the value is often enough." — [Refactoring UI, "Labels are a last resort"](https://www.refactoringui.com/previews/labels-are-a-last-resort). Write "12 left in stock" rather than "In stock: 12". Emphasise by de-emphasising the surroundings. — secondary summaries of Refactoring UI ([skills.lc](https://www.skills.lc/wondelai/skills/wondelai-skills-refactoring-ui-skill-md))
- Real content: use specific figures, not round numbers; "concrete action verbs"; sentence case; left-aligned body text; one dominant CTA with the secondary as a text link. — [Laith0003](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)
- iOS: system text styles give Dynamic Type. Custom fonts "make sure it implements the same behaviors". Support text enlargement to at least 200%. — [Apple HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography) / [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (via search summary)

### Inferences
- For a reviews-waiting count, the premium move is a typographically quiet number in tabular figures, sized as text rather than as a "hero stat", inside a sentence such as "38 reviews waiting". This applies the "12 left in stock" principle.
- A single hairline plus tonal surface is the native-feeling replacement for a white card with a soft drop shadow.

### Gaps
- No fetched source gives exact optical-alignment offsets. Texture and materiality (paper grain, noise) are not covered by any fetched craft source.

## 3. Cultural motifs (ink, seals, calligraphy): tasteful vs kitsch

### Takeaway
I found no designer writing specific to ink-wash or seal motifs in app UI. The adjacent material agrees on four points:
- Kitsch is motif as costume: garish, sentimental, and placed because "it's Chinese".
- Taste is restraint: the motif carries meaning or structure, appears sparingly, and stays out of the core chrome.
- The real Chinese aesthetic principle worth borrowing is 留白 liúbái, meaningful emptiness, not ornament.
- Faux-brush "chop suey" lettering is the canonical stereotype to avoid.

### Cited Findings
- Kitsch is "art, objects or design considered to be in poor taste because of excessive garishness or sentimentality." The key is restraint: apply a style "through patterns, frames, and accent illustrations so it reads intentional rather than costume-like." — search summary of [Kitsch in Product Design (Medium)](https://medium.com/@awanasywa/kitsch-in-product-design-love-it-or-loathe-it-7680c7e49b1b) and [Kittl styles guide](https://www.kittl.com/blogs/design-styles-name-stl/). Chinoiserie motifs (cranes, bamboo, pagodas, clouds, lattice) "read as luxurious when used sparingly." — [Kittl](https://www.kittl.com/blogs/design-styles-name-stl/)
- "Wonton"/"chop suey" fonts mimic brush strokes and "convey a sense of Orientalism… viewed by those in the East Asian diaspora as culturally insensitive." They travelled with dragon gates and pagoda roofs. — [Wikipedia: Wonton font](https://en.wikipedia.org/wiki/Wonton_font); [Grapheine "Stereotypography"](https://grapheine.com/en/magazine/stereotypography-typefaces-racist/). A Pratt thesis survey found the "Asian font" evokes "cheap, fast Asian food". — [Margot Lin, Pratt BFA thesis](https://bfacomdthesis.pratt.edu/2022/?p=312)
- 留白 liúbái: deliberately leaving areas blank. The unpainted paper is treated as meaningful (the Void, qi) rather than empty. Modern usage maps it onto white/negative space in web and graphic design. — [Contextual Chinese: 留白](https://contextualchinese.com/%E7%95%99%E7%99%BD). In shan shui, emptiness (xu) complements solid form (shi), and voids draw the eye along implied paths. — [Educationmagz on shan shui](https://educationmagz.blog/chinese-landscape-paintings-philosophy-shan-shui) (low-authority blog)
- Mainland Chinese UX tends toward "more is more" density. White can carry associations with death. — [digitalcreative.cn](https://digitalcreative.cn/blog/how-china-ux-is-different) (search summary; agency blog). Counter-trend: China's "New Ugly" graphic design rejects polished harmony. — [RADII](https://radii.co/article/decoding-chinas-new-ugly-graphic-design)

### Inferences
- The red seal, rice-paper frame and vertical text in the rejected attempts are motifs-as-costume. Each reads as "Chinese-themed app" rather than as a functional element.
- A tasteful use would either give the motif a job or keep it at very low intensity. Giving it a job could mean the seal appearing only as a real mark of completion, or the ink illustration also serving as the progress metaphor. Keeping it low could mean one small vermilion detail at most, consistent with "accent, not canvas" in CLAUDE.md §5.
- The most authentic Chinese reference is compositional (liúbái, asymmetric placement in the empty sky of a shan shui) rather than decorative.
- The real Hanzi is the best "cultural" element. A single character or word the learner actually knows, set beautifully in a proper CJK face, beats any seal. This is inference, consistent with "the Chinese… should visually dominate the UI chrome" (CLAUDE.md §5).
- The white-equals-mourning association is weak for this audience, which is mostly non-Chinese learners on a warm paper ground. I note it but do not treat it as a constraint.

### Gaps
- I found no essays by designers of East-Asian-themed or Chinese-learning apps (Du Chinese, Pleco, HelloChinese, etc.) on motif use. Primary sources such as Anne Quito's CNN piece on chop suey fonts and Paul Shaw in Print were not opened.

## 4. Making one "today" card over an illustrated background feel intentional

### Takeaway
The card should feel like it belongs to the scene's light and space, not like a sticker on top of it. The techniques:
- Protect only the text area: a long, targeted gradient or scrim, never a blanket darkening.
- Place the card in the illustration's quiet zone (its liúbái).
- Separate the card with tone and a hairline rather than heavy shadow or decorative glass.
- Reserve translucency for system chrome.
- Verify 4.5:1 contrast in both themes and with Dynamic Type.

### Cited Findings
- Over images: target text protection at specific areas rather than covering the whole image, and use long gradients to avoid banding. — [Material Design imagery guidance](https://m1.material.io/style/imagery.html) (search summary). A bottom-weighted gradient creates "a safe area for text"; aim for 4.5:1. — [Amazon APL background](https://www.developer.amazon.com/en-US/alexa/alexa-haus/visual-design/apl-components/apl-background)
- A ~40% black-to-transparent scrim "often gives enough contrast without disturbing the image." Pair it with a soft text shadow in the scrim colour as a fallback. — [Prototypr: techniques for text over background images](https://prototypr.io/news/techniques-to-display-text-over-background-images) (search summary)
- Text-over-image options: overlay, gradient, darkening the whole image ("easy but dull"), large-blur text shadow, text-in-a-box. — [Ahmad Shadeed, Handling text over image](https://ishadeed.com/article/handling-text-over-image-css/); [Erik Kennedy, 7 Rules part 2](https://learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-2.html) (search summaries)
- Apple materials: the regular material "blurs and adjusts the luminosity of background content to maintain legibility." Low-contrast symbols on materials fail; use vibrancy. — [Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) (search summary). Liquid Glass elements "require clear separation from content" — [WWDC25 notes](https://wwdcnotes.com/documentation/wwdc25-356-get-to-know-the-new-design-system/). Clear-glass variants need a dimming layer and suit only media-rich backgrounds — third-party summary, unverified ([Axiom skill](https://lobehub.com/skills/charleswiltgen-axiom-axiom-liquid-glass))
- Test under light/dark, Reduce Transparency, Increase Contrast, Reduce Motion and large Dynamic Type. — [Axiom Liquid Glass skill](https://lobehub.com/skills/charleswiltgen-axiom-axiom-liquid-glass) (third-party)
- Glass should be one element, "only where translucency has a purpose." — [Laith0003](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list). "Atmosphere and depth rather than defaulting to solid colors." — [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- Do not use `h-screen` heroes on mobile; let content peek below. Mix proportions instead of uniform cards. — [Laith0003](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)

### Inferences (applied recommendations, not sourced facts)
- **Integrate through the art, not the card.** Commission or crop the ink-wash so it has a deliberate empty mist or sky band where the card sits. The illustration is composed around the card, rather than the card being composited onto a busy scene. Mist fading into `--bg` toward the card zone acts as a natural scrim, the ink-wash equivalent of a targeted gradient.
- **The card surface:**
  - an opaque `--surface`, or a surface mixed slightly with the paper tone;
  - a 1px `--hairline` border;
  - a light near-page shadow (≈`0 1px 3px` at low alpha) in light mode and tonal elevation in dark mode;
  - concentric radius with any inner element;
  - no glass. Glass is reserved for nav per CLAUDE.md.
- **The card content:**
  - Lead with a sentence in real type, e.g. "38 reviews waiting · about 9 min", with tabular numerals at body to title size rather than a giant stat.
  - Show HSK progress as a fine hairline bar or a plain-text fraction ("412 of 600 words toward HSK 4"), not a ring.
  - Use the accent only for the progress fill or the one action affordance. The whole card can be the tap target, so no separate red button is needed.
- **Asymmetry and liúbái.** Place the card off-centre (e.g. lower third, left-aligned text) and leave the mountain's empty sky genuinely empty. Avoid centred stacks.
- **Motion.** At most one quiet entrance: opacity and translate under 300ms, honouring reduced motion. A subtle parallax between mist and mountain layers on scroll is optional at most, once.
- **Validate** card text contrast at 4.5:1 over the actual illustration pixels in both themes, at 320/390/430 widths and with large Dynamic Type.

### Gaps
- I found no teardown of Calm, Headspace or Apple Weather explaining how they integrate cards with illustrated backgrounds. Search returned only generic scrim guidance.
- No source gives concrete values for paper or grain texture overlays.
