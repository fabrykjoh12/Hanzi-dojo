# How skilled designers and design engineers get non-generic UI out of Claude (2025–2026)

Research date: 2026-11-12. Evidence tiers used below:
- **[Anthropic-tested]**: Anthropic docs or engineering posts that report their own experiments (strongest available, still not peer-reviewed).
- **[Practitioner]**: a named, credible designer describing their own practice (anecdote, but first-hand).
- **[Community]**: blogs, skill registries, tool vendors (anecdote, often marketing; treat as weak).

Network note: several sources could not be fetched from this sandbox (hosts blocked: www.claude.com blog URL, prg.sh, muz.li, understandingdata.com, emilkowal.ski, anything.com, ischool.berkeley.edu). Where cited, those come only from search-result snippets and are marked as such.

## 1. What workflows do respected designers / design engineers publicly describe?

### Takeaway
The workflows that recur among credible practitioners are: (a) structure first, visuals second (wireframes before fidelity); (b) generate many divergent options, then remix the best parts; (c) ground every generation in real references and a real design system rather than adjectives; (d) put a rendered screenshot in the loop and critique against it; (e) do final polish by hand rather than by prompt.

### Cited Findings
- **Nate Parrott (Anthropic product designer who built Claude Design), July 24 2026 [Practitioner]:** generates many options and remixes — "most of them won't be good, and that's fine; one or two will be." Then: "I like option B and a little of option D. Give me five riffs that smoosh those together." — [Claude: How the product designer who built Claude Design uses it](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- Parrott asks for **wireframes first** to explore structure: it "is much faster" and keeps Claude focused on structure rather than visuals. — [same source](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- Parrott's inputs: paper **sketches photographed and uploaded** for layouts hard to describe in words; **moodboards**; connecting the real **codebase** so Claude reuses existing components ("with a few tries it can recreate your existing designs with pretty high fidelity"). — [same source](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- Parrott: without direction Claude defaults to familiar AI-style aesthetics; he counters by **specifying fonts and colours, supplying moodboards, or asking Claude to propose font-and-colour pairings and iterating until one fits**. Final polish is done with direct manipulation, not prompts — small adjustments like sizing are "better eyeballed anyway." — [same source](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- Parrott thinks **before** prompting: drafts prompts on his phone and in voice notes, so instructions are clear before he sits down. — [same source](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- Parrott: for recurring work, upload brand files/type specs so Claude builds a design system and **checks its output against that system before presenting**, so "each artifact starts from your choices rather than a blank slate." — [same source](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- **Paul Bakaus (jQuery UI creator) — Impeccable skill [Practitioner/tool]:** run an `init` once that writes `PRODUCT.md` (who it is for, what it must do, constraints), and `document` to capture the existing visual system in `DESIGN.md` "so changes stay on-brand"; every later command reads them. "Narrow targets get better results; a single section reviewed closely beats a whole page at a glance." Named moves (`bolder`, `polish`, `distill`, `critique`, `audit`) replace vague asks like "make it pop". For native apps, setting `## Platform` to ios/android makes it work from Apple HIG / Material 3. — [Impeccable README](https://github.com/pbakaus/impeccable)
- Impeccable's own A/B demo: same model, same brief (Ligurian guesthouse); without the skill → "cream page, thin serif, italic accent, pill buttons"; with it, "the page is built around one picture". — [Impeccable README](https://github.com/pbakaus/impeccable)
- **Emil Kowalski (design engineer, Sonner/Vaul)** argues in "Agents with Taste" that taste can be written down as rules an agent follows, with a review step rejecting animations that "work technically but feel tasteless." Only seen via secondary summary; original not fetchable. — [search snippet: bittide summary](https://bittide.aicompass.dev/article/a68de954-effe-4a98-b091-f01bbf76c603); [Kowalski, Developing taste](https://emilkowal.ski/ui/developing-taste) (not fetched)
- **Rauno Freiberg / Vercel Web Interface Guidelines** — a public, rule-form list of interface decisions ("Interfaces succeed because of hundreds of choices"), e.g. "Match visual & hit targets… On mobile, the minimum size is 44px", visible focus rings, inputs ≥16px on mobile to stop iOS zoom. Usable as a machine-checkable craft floor. — [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- Community Claude Code + Playwright MCP loop: build → open localhost → screenshot → evaluate → iterate; often multi-viewport captures to catch mobile issues. — [Claude Tips: Playwright MCP visual testing](https://claude-tips.pages.dev/tips/playwright-mcp-visual-testing); [designproject.io: Claude Code for designers](https://designproject.io/blog/claude-code-designer-workflow/); [claude-codex.fr: card with impeccable + playwright](https://claude-codex.fr/en/content/redo-a-card-with-impeccable-and-playwright/) [Community]

### Inferences
- The best-attested pattern from a real designer is "diverge wide → pick fragments → remix → hand-polish", not "one prompt, then a dozen correction rounds on the same mockup".
- Writing the product brief and visual system down once (a `PRODUCT.md`/`DESIGN.md` equivalent) is the shared move across Parrott and Bakaus. HanziDojo already has `docs/DESIGN-BIBLE.md` + tokens; the gap is likely a Home-specific brief (audience, primary job, the one memorable thing).

### Gaps
- No verified X/Twitter threads or YouTube talks from Linear/Vercel designers on Claude specifically were retrievable; search returned only aggregators.
- Kowalski's essay and the Berkeley MIMS 2026 study ("Aesthetic taste and its limits: breakdowns in prompt-mediated design of user interfaces") could not be fetched — the latter looks directly relevant and is worth reading if the host is allowed.

## 2. What does Anthropic itself recommend?

### Takeaway
Anthropic's guidance has three layers: (1) the 2025 "frontend aesthetics" prompt — attack typography, colour, motion and backgrounds individually and name the defaults to avoid; (2) the current `frontend-design` skill — ground in the subject, write a compact token plan, review it against the brief for genericness before coding, spend boldness in one place, and screenshot-critique; (3) for recent models, the default is a *specific* house style (cream + serif + terracotta), and "don't do X" just swaps to another fixed palette — the fixes are concrete specs or proposing several directions before building.

### Cited Findings
- Root cause, Nov 12 2025: models default to the "high-probability center"; "Safe design choices–those that work universally and offend no one–dominate web training data." — [Anthropic: Improving frontend design through Skills](https://claude.com/resources/articles/improving-frontend-design-through-skills)
- Cookbook: three strategies "consistently produce better results": "Guide specific design dimensions" (typography, colour, motion, backgrounds individually); "Reference design inspirations… without being overly prescriptive"; "Call out common defaults". — [Anthropic cookbook: Prompting for frontend aesthetics](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- Cookbook prompt key lines: "You tend to converge toward generic, 'on distribution' outputs… Dominant colors with sharp accents outperform timid, evenly-distributed palettes." "One well-orchestrated page load with staggered reveals… creates more delight than scattered micro-interactions." "You still tend to converge on common choices (Space Grotesk, for example) across generations." Typography variant: "Use extremes: 100/200 weight vs 800/900, not 400 vs 600. Size jumps of 3x+, not 1.5x." "State your choice before coding." — [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- Cookbook "isolated prompting": lock one dimension or a theme when you want predictable, consistent output across generations. — [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- **Current `frontend-design` skill (fetched 2026-11-12)**, key rules:
  - Frame: "This client has already rejected proposals that felt cliché or templated" — make "deliberate, opinionated choices… specific to this brief".
  - "The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from." Build with the brief's real content throughout.
  - Process: "Work in two passes." First a compact token plan — "4–6 named hex values", typefaces and roles, layout concept with "ASCII wireframes to ideate and compare", principles. "Then review that plan against the brief before building: if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar)… revise that part, say what you changed and why."
  - "Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined." "Before leaving the house, take a look in the mirror and remove one accessory."
  - "Critique your own work as you build, taking screenshots to review… a picture is worth 1000 tokens." Keep notes on what you've tried so later passes do something new.
  - Calibration list of AI clusters: (1) "warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent (often near #D97757…)"; (2) near-black with one acid-green/vermilion accent; (3) broadsheet hairline-rule layout; (4) "the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything… the same soft grey shadow"; (5) template chrome — ALL-CAPS tracked eyebrows, "A · B · C" middle-dot meta strings, "WORD — fragment" labels, monospace for small data labels, "→" on buttons. "The brief's own words always win."
  - Type tells: accenting a single headline word, all-caps labels, unnecessary labels above content. Numbered markers only for real sequences. Motion: fade-and-slide-up on every section "read as AI-generated".
  - — [anthropics/skills: frontend-design SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- **Model-specific (Opus 4.8 prompting guide):** "a consistent default house style: warm cream/off-white backgrounds (~#F4F1EA), serif display type (Georgia, Fraunces, Playfair), italic word-accents, and a terracotta/amber accent… This default is persistent. Generic instructions ('don't use cream,' 'make it clean and minimal') tend to shift the model to a different fixed palette rather than producing variety. Two approaches work reliably: 1. Specify a concrete alternative… 2. Have the model propose options before building." Sample: "Before building, propose 4 distinct visual directions tailored to this brief (each as: bg hex / accent hex / typeface — one-line rationale). Ask the user to pick one, then implement only that direction." It replaces relying on temperature for variety. — [Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- The worked "concrete alternative" example specifies atmosphere in material terms ("misted metallic surface"), exact radius (4px everywhere), spacing feel, type character, section order, hover timing ("all 160ms ease out"), and a closed 5-hex palette. — [same](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- Claude Code best practices: hand over images instead of describing ("paste the screenshot of the design"); say "be ambitious" for empty/error states; ask Claude to interview you to a spec; give it a check — including "A browser screenshot next to the mockup" — and ask for evidence, "the screenshot". — [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md)
- Vision tip: giving Claude a crop/zoom tool gives "consistent uplift on image evaluations". — [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- **Generator/evaluator experiment, Mar 24 2026 (Prithvi Rajasekaran) [Anthropic-tested]:** criteria — Design quality ("coherent whole rather than a collection of parts?"), Originality ("evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns?"), Craft ("typography hierarchy, spacing consistency, color harmony, contrast ratios"), Functionality. Design and originality weighted higher pushed bolder choices. Evaluator used Playwright on the live page, was "calibrated… using few-shot examples with detailed score breakdowns", ran "5 to 15 iterations per generation"; generator chose to refine if scores trended well or pivot to a different aesthetic. Agents "reliably skew positive when grading their own work"; a separate skeptical evaluator was easier to tune. Wording like "museum quality" pushed outputs toward one particular look. — [Anthropic Engineering: Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)

### Inferences
- **Directly relevant to HanziDojo:** the brand accent is vermilion `#B83A24` on a near-white `--bg #FAFAF8`, which sits close to Anthropic's own named tell (cream + serif + terracotta/warm-clay). The skill is explicit that the brief wins — the accent is not the problem — but any mockup that *also* adds a serif display, italic word accents, ALL-CAPS eyebrows, middle-dot meta lines and identical rounded cards will read as default Claude. That combination is a likely reason the owner said "AI slop".
- "Don't make it generic" is documented as ineffective; replace negatives with a concrete positive spec rooted in the subject (Chinese reading, ink, paper, the learner's own words).

### Gaps
- Anthropic gives no quantitative before/after metrics for the skill — evidence is side-by-side screenshots.

## 3. How do people use references (Mobbin, Dribbble, real app screenshots, HIG) without copying?

### Takeaway
Use references for *specific borrowed properties* (structure, spacing, navigation, density), say explicitly what to leave out (colour, copy, brand), one reference per screen, and have the model propose a design policy before building. Real shipped-app screenshots (Mobbin) and platform guidelines beat Dribbble shots.

### Cited Findings
- Tool docs for a Mobbin reference picker: tell the agent **what to borrow (e.g. spacing, navigation) and what to leave out (e.g. colours, copy)**; portrait screenshots push the agent to a mobile layout. Seen via search snippet only. — [anything.com: Mobbin import](https://www.anything.com/docs/import/mobbin) [Community, not fetched]
- Japanese guide (via snippet): link one Mobbin screen per app screen; "Don't let it build immediately; ask it to 'propose a policy first'"; borrow structure, use your own colours/logo. — [youmind summary](https://youmind.com/pt-BR/landing/x-viral-articles/ai-ui-design-netflix-mobbin) [Community]
- Mobbin offers an MCP so the agent searches references itself; Mobbin's agent guidance: "Do not copy protected designs or assets verbatim." — [Mobbin llms-full.txt](https://mobbin.com/llms-full.txt); [joaoqueiros: Mobbin MCP workflow](https://www.ai.joaoqueiros.com/blog/mobbin-mcp-claude-code-ui-reference-workflow) [Community]
- Anthropic cookbook: reference inspirations "without being overly prescriptive" (IDE themes, cultural aesthetics). — [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- Parrott: moodboards and photographed sketches as inputs. — [Claude article](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- Impeccable: native platform mode works from Apple HIG / Material 3. — [Impeccable README](https://github.com/pbakaus/impeccable)

### Inferences
- For a calm mobile learning Home, the highest-value references are a handful of shipped calm/reading apps' home screens (via Mobbin or real device screenshots) annotated "borrow: hierarchy and spacing; ignore: palette, copy". Cultural references (ink, paper, calligraphy layout, Chinese book typography) are the cookbook's "cultural aesthetics" lever and match the skill's "materials and vernacular" rule.

### Gaps
- No rigorous comparison of reference types (Mobbin vs Dribbble vs HIG) exists in what I found; all advice is anecdotal.

## 4. What iteration loop produces the best results?

### Takeaway
Best-supported loop: brief/interview → 3–5 *substantively* different directions (cheap: hex/type/one-line or wireframes) → human picks or remixes → build one → render screenshots at target viewports → critique by a **separate** reviewer against explicit criteria → refine or pivot → hand-polish. Anthropic's experiment used 5–15 automated iterations; a human-in-the-loop typically uses far fewer.

### Cited Findings
- Propose 4 directions as "bg hex / accent hex / typeface — one-line rationale", user picks, implement only that. — [Opus 4.8 prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8) [Anthropic-tested]
- Generate many, keep 1–2, remix ("five riffs that smoosh those together"); wireframes first. — [Parrott](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them) [Practitioner]
- 5–15 evaluator iterations; refine vs pivot; separate skeptical evaluator; few-shot calibrated scoring. — [Anthropic Engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps) [Anthropic-tested]
- Skill: plan → review plan for genericness ("work through a similar prompt to see if you arrive somewhere similar") → build → screenshot self-critique. — [frontend-design SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- Claude Code docs: screenshot next to mockup as the check; demand the screenshot as evidence; `/code-review`-style fresh-context reviewer "isn't swayed by the reasoning that produced the code". — [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md)
- "2–3 iterations often improve results significantly" is attributed to Anthropic's best-practices page by secondary summaries, but is **not** on the current page — unverified. — [search snippet](https://lilting.ch/en/articles/claude-code-best-practices-and-agent-sdk); current page [code.claude.com](https://code.claude.com/docs/en/best-practices.md)
- Community guides: ask for 3–5 variations that differ in substance, not just font; without a brand file, options come back in unrelated styles. — [search snippets, e.g. mikareyes.com](https://mikareyes.com/ai/how-to-get-10-design-options-with-ai.md) [Community]
- Feedback granularity: Parrott's "point and talk" (click element, dictate comment); Impeccable's "narrow targets get better results". — [Parrott](https://claude.com/ko/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them); [Impeccable](https://github.com/pbakaus/impeccable)

### Inferences
- For the owner (low tolerance for long reviews), divergence should be shown visually and compactly — e.g. 3–4 rendered phone-width screenshots side by side, each with a one-line rationale — and feedback should be fragment-level ("B's header, D's story card").
- Self-review by the generating agent is documented as positively biased; use a fresh-context reviewer with the four Anthropic criteria plus the skill's tell list, at 320/390/430 and both themes.

### Gaps
- No controlled data on optimal number of variants for human-in-the-loop work.

## 5. Known failure modes and how experts counter them

### Takeaway
Failure modes: distributional convergence to a house style; negative instructions that just swap one default for another; template chrome (eyebrows, dot-meta, arrows, numbered markers); uniform card kits; scattered motion; optimistic self-grading; working blind without a render; prompt wording that itself induces a look. Counters: concrete positive specs grounded in the subject, divergent options before building, a written brief/system, rendered screenshots, a separate critic, deterministic slop linting, and restraint.

### Cited Findings
- Persistent cream/serif/terracotta default; negatives swap palettes. — [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- Convergence even with guidance ("Space Grotesk, for example"). — [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- The five-cluster tell list and type/motion/structure tells. — [frontend-design SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- Self-praise bias; criteria wording ("museum quality") inducing convergence. — [Anthropic Engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Impeccable's tells: "Inter for everything. Purple-to-blue gradients. Cards nested in cards, gray text on colored backgrounds, a rounded-square icon tile above every heading"; a deterministic detector with 62 rules (cramped padding, skipped headings, etc.) run via a hook on every edited UI file — "without the hook, the detector only runs when someone remembers to run it." — [Impeccable README](https://github.com/pbakaus/impeccable)
- Design skills "work blind" without seeing the render; pair with Playwright. — [claude-codex.fr](https://claude-codex.fr/en/mcp/workflow-design-playwright/) [Community]
- Other community tells: thick coloured border on one side of a rounded card; glassmorphism/glow; excessive pills. — [noqta.tn: AI design slop patterns 2026](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026); [Impeccable anti-patterns docs](https://www.mintlify.com/pbakaus/impeccable/concepts/anti-patterns) [Community, snippets]
- Without a brief, the skill "gives you a generic brief". — [search snippet: findskill.ai](https://findskill.ai/blog/claude-frontend-design-skill/) [Community]
- Copy is a slop vector too: "Copy can make a design feel as templated as the design itself"; plain, sentence-case, user-perspective copy; empty screen "is an invitation to act". — [frontend-design SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

### Inferences
- For HanziDojo Home, likely slop risks given the existing brand: vermilion-on-off-white plus a serif headline with italic accent; identical rounded stat cards (due count, streak-like numbers — note streaks are deliberately removed); a "big number + small label + gradient" hero (the skill's named default); ALL-CAPS section eyebrows. The antidote the sources converge on: make the learner's own Chinese (today's words, the story they can now read) the one memorable element, keep everything else quiet.

### Gaps
- No independent (non-Anthropic, non-vendor) measurement of how often these tells correlate with human "slop" judgements; Design Arena / Taste Labs are building such preference data but no public results found.
