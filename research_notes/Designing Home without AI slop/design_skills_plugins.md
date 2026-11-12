# Claude Code design skills, plugins and MCP servers for high-quality UI (as of 2026-11-12)

Method note: GitHub API access was blocked in this session, so star counts come from fetching the public GitHub pages on 2026-11-12 (rounded, as GitHub shows them). Last-commit dates were not visible in any fetched page, so recency was judged from other signals (footer year, release notes, launch press). developers.figma.com and mobbin.com could not be reached from this sandbox (network allowlist), so Figma and Mobbin details come from Figma's help-center snippets and third-party guides found by search. Nothing was installed.

## What official Anthropic skills/plugins exist for design/frontend, and how are they installed?

### Takeaway
Anthropic ships `frontend-design` as an official plugin in the default `claude-plugins-official` marketplace (`/plugin install frontend-design@claude-plugins-official`), and the `anthropics/skills` repo adds `canvas-design`, `theme-factory`, `brand-guidelines`, `web-artifacts-builder`, `algorithmic-art` and `webapp-testing`. `frontend-design` is the one that matters for app UI. The others are mostly for artifacts, posters and slides.

### Cited Findings
- `anthropics/skills` has about 193k stars and 22.7k forks. Skills live in `./skills`, grouped into Creative & Design, Development & Technical, Enterprise & Communication and Document Skills. Install: `/plugin marketplace add anthropics/skills`, then `/plugin install example-skills@anthropic-agent-skills` (or `document-skills@anthropic-agent-skills`) — [anthropics/skills](https://github.com/anthropics/skills)
- The skill folders on `main` (19 listed) are: academy-guide, algorithmic-art, brand-guidelines, canvas-design, claude-api, discernment-nudge, doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx, skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing, xlsx — [anthropics/skills/skills](https://github.com/anthropics/skills/tree/main/skills)
- A single skill can also be pulled with the cross-agent `skills` CLI: `npx skills add https://github.com/anthropics/skills --skill frontend-design` (reported in search results, not tested) — [search summary / skills.sh listing](https://www.skills.sh/anthropics/claude-code/frontend-design)
- Anthropic's plugins are now developed in `anthropics/claude-plugins-official`. The older `claude-code-plugins` marketplace in `anthropics/claude-code` still lists them and installs from there — [anthropics/claude-code plugins](https://github.com/anthropics/claude-code/tree/main/plugins)
- `claude-plugins-official` has about 46.9k stars. Its `/plugins` folder includes `frontend-design`, `playground`, `project-artifact`, `code-review`, `pr-review-toolkit`, `skill-creator`, `feature-dev` and others. Install format: `/plugin install {plugin-name}@claude-plugins-official`. Partner plugins (for example Figma) sit in `/external_plugins`. The README warns that Anthropic "does not control what plugins include" for partner and community entries — [claude-plugins-official](https://github.com/anthropics/claude-plugins-official), [plugins dir](https://github.com/anthropics/claude-plugins-official/tree/main/plugins)
- The current `frontend-design` SKILL.md casts Claude as a "design lead". It asks for a written plan first: 4–6 named hex colours, typefaces, ASCII wireframes and principles, then a review for generic defaults before building. Its stated principle is "Spend your boldness in one place." — [frontend-design SKILL.md](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- The same SKILL.md names specific anti-patterns to avoid:
  - Highlighting one word in a headline, all-caps eyebrow labels.
  - "Warm cream with a terracotta accent", near-black with a single neon accent.
  - Identical rounded SaaS cards with uniform shadows, gradient washes.
  - Middle-dot meta strings, monospace data labels, arrows appended to buttons.
  - Fade-and-slide-up on every section, hover effects on every card.

  Its quality floor covers responsive layout, visible focus states, reduced motion and accessibility. It ends with "remove one element before finishing" — [frontend-design SKILL.md](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- Anthropic's post "Improving frontend design through Skills" (Applied AI team: Prithvi Rajasekaran, Justin Wei, Alexander Bricken; 12 Nov 2025) blames "AI slop" on "distributional convergence": Inter, purple gradients on white, minimal motion. The original skill was a compact prompt of about 400 tokens. It warned off Inter/Roboto/Arial and even Space Grotesk, and pushed committed palettes via CSS variables and one orchestrated load animation. The evidence is qualitative before/after screenshots only, with no metrics — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)
- The same post presents `web-artifacts-builder` as the skill for richer claude.ai artifacts (React + shadcn-style), with before/after app examples — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)

### Inferences
- The SKILL.md fetched today is clearly a later revision than the Nov 2025 post describes. It went from about 400 tokens of "be bold" to a plan-then-critique process with a long anti-pattern list, so the skill is actively maintained.
- For HanziDojo, `frontend-design` is the top pick but **conflicts in places with the house rules**:
  - It pushes distinctive webfonts, but the native build must never contact Google Fonts.
  - It pushes layered backgrounds, but the Design Bible is calm minimalism.
  - It flags "warm cream + terracotta accent" as a cliché, which is close to the Chinese accent `#B83A24` on a warm ground.
  - Per CLAUDE.md §6 the project docs win. Use the skill for its critique and anti-slop checklist, not for its aesthetic direction.
- `theme-factory`, `canvas-design`, `brand-guidelines` and `algorithmic-art` target posters, slides and artifacts. They are low value for an in-app React UI. `webapp-testing` (Playwright-based) partly overlaps the vendored `browser-qa`.

### Gaps
- Last-commit dates for `anthropics/skills` and `claude-plugins-official` were not visible.
- I could not confirm whether `claude-plugins-official` is preinstalled in every Claude Code build. Figma's help center implies it is, since it uses `figma@claude-plugins-official` with no marketplace-add step.

## Which community skill collections are most respected for UI/UX?

### Takeaway
Two community skills dominate by adoption:
- **Impeccable** (Paul Bakaus): about 108k stars, design-command vocabulary plus a deterministic slop detector.
- **UI UX Pro Max** (nextlevelbuilder): about 148k stars, a searchable style/palette/font database.

Vercel's `web-design-guidelines` (about 34k stars, in `vercel-labs/agent-skills`) is the most credible rules-based UI review. Impeccable fits HanziDojo best because it critiques and refines rather than imposing a style.

### Cited Findings
- **Impeccable**, `pbakaus/impeccable`: about 108.4k stars, 6.4k forks, 2,862 commits.
  - Tagline: "The design vocabulary for your coding agent."
  - Steer commands: `bolder`, `quieter`, `distill`, `colorize`, `typeset`, `layout`, `animate`, `delight`, `overdrive`.
  - Review commands: `critique` (scored UX review), `audit` (technical quality).
  - Finish commands: `polish`, `harden`, `clarify`, `adapt`, `optimize`, `onboard`. Live iteration: `live`, `generate`. Setup: `shape`, `init`, `document`, `extract`.
  - Includes a deterministic "slop detector" with 62 rules that runs without an LLM or API key. It started from Anthropic's frontend-design skill.
  - Install: `/plugin marketplace add pbakaus/impeccable`, then install from `/plugin`; or `npx impeccable install`, which also offers a design hook for automatic checks.
  — [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- Paul Bakaus is credited as creator, with links to his site and X account. (Background not stated on the page. From training knowledge, he previously worked on Chrome DevRel / AMP at Google; unverified here.) — [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- Independent commentary on Impeccable exists — [Bill Mill notes](https://notes.billmill.org/AI/claude/skills/impeccable__design_skill_.html) (content not fetched)
- **UI UX Pro Max**, `nextlevelbuilder/ui-ux-pro-max-skill`: about 148.2k stars, 15.7k forks, MIT. No individual maintainer is named.
  - It generates a design system from a product description: pattern, style, colours, type, effects, anti-patterns and a pre-delivery checklist.
  - Catalog: 80 styles (51 active), 192 palettes, 74 font pairings, 25 chart types, 22 stacks, 120 UX guidelines.
  - Needs Python 3. The search script uses only the standard library and makes no network calls (the catalog refresh runs in GitHub Actions).
  - Install: `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`, then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`; or `npx ui-ux-pro-max-cli init --ai claude`.
  — [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- **Vercel agent skills**, `vercel-labs/agent-skills`: about 33.9k stars, 8 skills.
  - `web-design-guidelines`: reviews UI code against 100+ accessibility/performance/UX rules.
  - Also: `react-best-practices`, `react-native-guidelines`, `react-view-transitions`, `composition-patterns`, `writing-guidelines`, `vercel-optimize`, `deploy-to-vercel`.
  - Install: `npx skills add vercel-labs/agent-skills`.
  — [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- **OneRedOak/claude-code-workflows**: about 3.9k stars, only 20 commits. A design-review workflow that uses specialised Claude Code agents plus Microsoft's Playwright MCP to check UI consistency, accessibility and design standards. The README has no install steps; they are in the `design-review` folder. Recency unknown — [OneRedOak/claude-code-workflows](https://github.com/OneRedOak/claude-code-workflows)
- Snyk published a roundup of "top Claude skills for UI/UX engineers" (not fetched) — [Snyk](https://snyk.io/articles/top-claude-skills-ui-ux-engineers/)

### Inferences
- **Impeccable** fits a project with an existing design bible best. `critique`, `audit`, `quieter`, `distill` and `polish` push toward calm refinement, and `init`/`document` can capture house rules. The no-LLM slop detector is a cheap, repeatable check.
- **UI UX Pro Max** is strongest when no design system exists yet. HanziDojo already has one (DESIGN-BIBLE + tokens), so its generated "design system" output would compete with the project docs. Best used only as a reference catalog, if at all.
- **Vercel `web-design-guidelines`** is framework-agnostic rule checking. Good for a review pass. Its other skills skew Next.js/Vercel.
- **Stack fit:** most community skills assume Tailwind/shadcn/TypeScript. HanziDojo uses inline style objects, plain JSX and no utility classes. Expect to tell each skill that CLAUDE.md §6 wins, as `.claude/skills/VENDORED.md` already does for the ECC skills.
- **Already in the repo:** a vendored `design-system` skill and a `browser-qa` skill (both from ECC). A new skill should be checked against these for overlap.
- **Star counts:** they are very high for skill repos (100k+). They show popularity and virality, not quality, and may include star inflation. Treat them as adoption signals only.

### Gaps
- No last-commit dates were visible for Impeccable or UI UX Pro Max.
- I found no independent quantitative evaluation (A/B or human ratings) of any design skill. All quality evidence is anecdotal or self-reported.
- Not verified this session: "interface-design" (Dammyjay93), raphaelsalaja's "userinterface-wiki" and the awesome-claude-skills lists. Their pages were not fetched.

## Which MCP servers help with design (Figma, Mobbin, 21st.dev, Playwright, Chrome DevTools)?

### Takeaway
The useful MCPs for a solo dev are:
- **Playwright MCP / CLI** (Microsoft) or **Chrome DevTools MCP** (Google): render the app, screenshot it at phone sizes, iterate.
- **Mobbin MCP** (official, May 2026): real app screens as reference.
- **Figma MCP** (official): only if designs live in Figma.

21st.dev Magic is now "21st MCP", needs an API key and outputs React/Tailwind components, which is a poor fit for inline-style JSX.

### Cited Findings
- **Playwright MCP**, `microsoft/playwright-mcp`: about 39.5k stars.
  - Install: `claude mcp add playwright npx @playwright/mcp@latest`.
  - Tools: `browser_take_screenshot`. `--caps=vision` adds coordinate mouse tools.
  - Emulation: `--device "iPhone 15"`, `--viewport-size 1280x720`, `--mobile`.
  - The README says coding agents "might benefit from using the CLI+SKILLS" because it is more token-efficient. It positions the MCP for agent loops needing persistent state.
  — [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- **Chrome DevTools MCP**, `ChromeDevTools/chrome-devtools-mcp` (official Chrome DevTools org): about 55.1k stars.
  - Install: `/plugin marketplace add ChromeDevTools/chrome-devtools-mcp`, then `/plugin install chrome-devtools-mcp@chrome-devtools-plugins`; or the generic `npx -y chrome-devtools-mcp@latest`.
  - Takes screenshots and records performance traces. Trace URLs may be sent to Google's CrUX API unless `--no-performance-crux` is set.
  — [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- **Figma**:
  - Recommended Claude Code setup is the official plugin: `claude plugin install figma@claude-plugins-official`. It bundles the MCP config plus Figma's workflow skills.
  - Manual: `claude mcp add --transport http figma https://mcp.figma.com/mcp` (optionally `--scope user`), then `/mcp` to OAuth.
  - A local desktop server at `http://127.0.0.1:3845/mcp` exists, but the remote server is preferred.
  — [search summary of Figma help center / developer docs](https://help.figma.com/hc/en-us/articles/39888612464151); [Figma remote install docs](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation) (not reachable from sandbox)
- **Mobbin**:
  - Official hosted MCP launched May 2026, giving AI tools access to about 621,500 real app screens.
  - Install: `claude mcp add mobbin --scope user --transport http https://api.mobbin.com/mcp`, then `/mcp` → Authenticate (OAuth with a Mobbin account).
  - Listed in Claude's plugin marketplace.
  - The community `pdcolandrea/mobbin-mcp` reverse-engineered Mobbin's internal endpoints and now tells users to switch to the official one.
  — [BusinessWire launch release](https://www.businesswire.com/news/home/20260511053592/en/Mobbin-Launches-MCP-Server-Giving-AI-Tools-621500-Real-App-Screens-to-Reference); [claude.com marketplace](https://claude.com/marketplace/plugins/mobbin); [pdcolandrea/mobbin-mcp](https://github.com/pdcolandrea/mobbin-mcp)
- **21st.dev**, `21st-dev/magic-mcp`: about 6.5k stars.
  - "Magic MCP is now the 21st MCP". The old package is a thin proxy, and old Magic API keys were reset.
  - Install: `claude plugin marketplace add 21st-dev/magic-mcp`, then `/plugin install 21st`; or `npx @21st-dev/cli@latest init --client claude`.
  - Needs `API_KEY_21ST` (a "free key"). AI generation only works if enabled on the account.
  - Library: 10,000+ React/Tailwind components.
  — [21st-dev/magic-mcp](https://github.com/21st-dev/magic-mcp)

### Inferences
- **Mobbin** is the most relevant reference tool for a mobile-first app: real iOS/Android screens of calm learning/reading apps. Whether it needs a paid Mobbin plan is unverified (see Gaps).
- **Figma** is only worth it if the owner designs in Figma. HanziDojo's source of truth is code plus DESIGN-BIBLE.
- **21st.dev** components are Tailwind-class based, which conflicts with CLAUDE.md §6 ("no Tailwind utility classes in JSX"). Low fit.

### Gaps
- Mobbin pricing/plan requirements and its exact tool list are unverified (mobbin.com blocked).
- Figma seat/plan requirements and rate limits are unverified (developers.figma.com blocked). Third-party guides suggest a Dev or Full seat is needed for higher limits; treat as unconfirmed.
- Chrome DevTools MCP emulation features (viewport, `prefers-color-scheme`) were not on the README. They are in `docs/tool-reference.md`, which was not fetched.

## What tools support screenshot-driven design critique loops in Claude Code?

### Takeaway
The loop is: a browser MCP or CLI (Playwright or Chrome DevTools) takes phone-sized screenshots, then a critique skill reviews them (Impeccable `critique`/`audit`, the OneRedOak design-review agent, or Vercel `web-design-guidelines`), then Claude edits and re-shoots. Impeccable adds a `live` iteration mode and an optional hook.

### Cited Findings
- Impeccable provides `critique` (scored UX review), `audit` (technical report) and `live` iteration. `npx impeccable install` offers a design hook for automatic checks — [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- The OneRedOak design-review workflow pairs specialised agents with Playwright MCP for UI/UX and accessibility review — [OneRedOak/claude-code-workflows](https://github.com/OneRedOak/claude-code-workflows)
- Playwright MCP supports device emulation (`--device`, `--mobile`, `--viewport-size`) and `browser_take_screenshot` — [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- Anthropic's own `webapp-testing` skill (Playwright-based) is in `anthropics/skills` — [anthropics/skills/skills](https://github.com/anthropics/skills/tree/main/skills)
- The `frontend-design` skill tells Claude to critique the work as it builds and to "remove one element before finishing" — [frontend-design SKILL.md](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/frontend-design/skills/frontend-design/SKILL.md)

### Inferences
- **HanziDojo already has most of the plumbing:**
  - Playwright is a dev dependency with visual snapshots.
  - `.claude/settings.json` allow-lists `npx playwright test`.
  - A vendored `browser-qa` skill exists.

  The missing piece is a critique layer. Impeccable `critique` and `audit` are the cheapest add.
- Per CLAUDE.md §8, sandbox screenshots differ from CI font rasterisation. Critique loops in a remote sandbox should judge layout and hierarchy, not exact pixels.
- Screenshot loops must run in both themes and at 320/390/430 widths (CLAUDE.md §5). Playwright's `--device` flag plus a colour-scheme setting covers this.

### Gaps
- I found no tool that does a closed-loop "screenshot → vision critique → patch" with measured quality gains. All loops are assembled by hand from the pieces above.

## Which are reputable vs. low-quality/abandoned/security-risky?

### Takeaway
- **Reputable:** first-party sources (Anthropic's `claude-plugins-official` and `anthropics/skills`, Microsoft Playwright MCP, Google Chrome DevTools MCP, Figma's and Mobbin's official servers, Vercel Labs).
- **Popular but single-maintainer:** Impeccable, UI UX Pro Max.
- **Superseded:** 21st Magic, the community Mobbin MCP.

Skills run with the agent's full permissions, and audits of open skill registries found real malware. So read every SKILL.md and script before installing, and vendor a pinned copy rather than auto-updating.

### Cited Findings
- Snyk "ToxicSkills" (5 Feb 2026) scanned 3,984 ClawHub skills:
  - 76 had confirmed malicious payloads.
  - 534 (13.4%) had at least one CRITICAL issue, and 1,467 (36.82%) had any security issue.
  - Prompt-injection techniques included base64 obfuscation, Unicode smuggling and system-message impersonation.
  - Skills "operate with the full permissions of the AI agent".
  - Secondary claims (a 91% hybrid prompt-injection+malware rate; a Liu et al. study finding 157 malicious skills among 98,380) are not verified against primary sources.
  — [Snyk ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/); [secondary summary](https://codex.danielvaughan.com/2026/06/07/agent-skill-supply-chain-crisis-clawhavoc-toxicskills-skillsieve-codex-cli-defence/)
- Anthropic's official marketplace README warns that Anthropic does not control or verify partner/community plugins, or guarantee they won't change — [claude-plugins-official](https://github.com/anthropics/claude-plugins-official)
- Third-party code in these tools:
  - UI UX Pro Max ships a Python script. Its README states stdlib-only with no network calls.
  - Impeccable's `npx impeccable install` can add a hook, i.e. code that runs automatically.
  - Chrome DevTools MCP can send trace URLs to Google CrUX by default.
  — [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill); [impeccable](https://github.com/pbakaus/impeccable); [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- The community `pdcolandrea/mobbin-mcp` used reverse-engineered private endpoints and now defers to the official server — [pdcolandrea/mobbin-mcp](https://github.com/pdcolandrea/mobbin-mcp)
- 21st Magic is superseded, and old API keys were reset — [21st-dev/magic-mcp](https://github.com/21st-dev/magic-mcp)
- The repo already has a `security-scan` skill (AgentShield) for scanning `.claude/` config, MCP servers and hooks — local file `/home/user/Hanzi-dojo/.claude/skills/security-scan`

### Inferences
- Suggested ranking for HanziDojo (my judgement from the findings above):
  1. `frontend-design` (official; use as a critique and anti-slop checklist, with project docs winning).
  2. Impeccable (`critique`, `audit`, `polish`, `quieter`, `distill`; skip or review the hook).
  3. Playwright CLI/MCP or Chrome DevTools MCP for phone-size screenshot loops (Playwright is already in the stack).
  4. Mobbin MCP for reference screens, if the plan cost is acceptable.
  5. Vercel `web-design-guidelines` for a rules-based review pass.
  6. UI UX Pro Max (only as a reference catalog; its generated design system would fight the DESIGN-BIBLE).
  7. Figma MCP (only if Figma is used).
  8. 21st.dev (poor stack fit: Tailwind components).
- Install the way the repo already does: vendor a pinned copy into `.claude/skills/`, record it in `VENDORED.md`, and re-apply local edits that subordinate the skill to CLAUDE.md. This also works in cloud sessions, which carry no `~/.claude/plugins`, and avoids silent upstream changes.

### Gaps
- No independent security audit of Impeccable or UI UX Pro Max specifically was found.
- Maintenance recency (last commit) could not be verified for any repo, because the GitHub API was blocked and the HTML pages showed no dates.
