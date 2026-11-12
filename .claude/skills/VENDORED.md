# Vendored skills

These skills are third-party Claude Code skills vendored into this repo so they
are available in Claude Code web/cloud sessions (which do not carry a local
`~/.claude/plugins` directory). They load automatically from `.claude/skills/`.

## Sources & licenses

superpowers and ECC are MIT-licensed; their copyright notices are preserved below as
required by the MIT License. frontend-design is Apache-2.0 (its LICENSE.txt ships
alongside it).

### superpowers — all 14 skills
- Source: https://github.com/obra/superpowers
- Copyright (c) 2025 Jesse Vincent — MIT License
- Skills: brainstorming, dispatching-parallel-agents, executing-plans,
  finishing-a-development-branch, receiving-code-review, requesting-code-review,
  subagent-driven-development, systematic-debugging, test-driven-development,
  using-git-worktrees, using-superpowers, verification-before-completion,
  writing-plans, writing-skills

### ECC (Everything Claude Code) — curated subset (17 skills)
- Source: https://github.com/affaan-m/ECC
- Copyright (c) 2026 Affaan Mustafa — MIT License
- Curated for this repo's stack (React 19 / Vite / Supabase / Vercel / PWA):
  react-patterns, react-performance, react-testing, frontend-patterns,
  frontend-a11y, vite-patterns, design-system, postgres-patterns,
  database-migrations, error-handling, e2e-testing, browser-qa, security-review,
  security-scan, deployment-patterns, github-ops, documentation-lookup

### frontend-design (Anthropic) — 1 skill
- Source: https://github.com/anthropics/skills/tree/main/skills/frontend-design
  (fetched 2026-11-12 from `main`; read in full before vendoring — instructions
  only, no scripts or hooks)
- Copyright Anthropic — Apache License 2.0 (`frontend-design/LICENSE.txt`)
- Why: its plan → review-against-brief → build → screenshot-critique loop and its
  list of "generated design" tells. **Precedence:** `CLAUDE.md` and
  `docs/DESIGN-BIBLE.md` win over its style advice — it pushes distinctive new
  typefaces (we keep Inter + Noto Sans SC, and the native build must never fetch
  webfonts) and lists a vermilion accent as a common default (ours is the brand
  accent and stays). Use it for process and critique, not palette or font picks.

### Impeccable (Paul Bakaus) — 1 skill + 4 agents
- Source: https://github.com/pbakaus/impeccable (plugin/skills/impeccable and
  plugin/agents), commit `b4bff1626c344067788c2679f048a20057c7cc5a`, v4.8.2,
  fetched 2026-11-12. Apache License 2.0 (`impeccable/LICENSE`, `NOTICE.md`).
- Agents copied to `.claude/agents/impeccable-*.md`.
- **Deliberately NOT vendored: `plugin/hooks/hooks.json`** (SessionStart +
  PostToolUse hooks that run the launcher after every edit). Nothing runs
  automatically.
- `scripts/impeccable` is a launcher that downloads a compiled engine from the
  project's GitHub releases and verifies it against the sha256 values in
  `scripts/engine-checksums.txt`. In cloud sessions the harness may refuse to
  run downloaded code; the skill then runs in its documented "launcher
  unavailable" mode — the reference guides (craft-floor, critique, new-work,
  ios, polish …) still apply, the deterministic detector does not.
- Precedence: the skill itself says "the brief wins"; here the brief is
  `CLAUDE.md` + `docs/DESIGN-BIBLE.md`.

### web-design-guidelines (Vercel) — 1 skill, rules pinned
- Source: https://github.com/vercel-labs/agent-skills (skills/web-design-guidelines,
  commit `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`) + the rules file from
  https://github.com/vercel-labs/web-interface-guidelines (`command.md`), both
  fetched 2026-11-12. MIT License (Vercel Labs).
- **Changed from upstream:** upstream fetches the rules from the internet on
  every run; here they are pinned in `guidelines.md` (read in full), and
  SKILL.md is rewritten to read that file. Its "Title Case" rule is overridden
  by the Design Bible's sentence case.

**Removed** (were vendored, then dropped — don't re-add without a reason):
- `api-design` — REST resource naming, status codes, versioning, rate limiting.
  This app has no API; it is a client SPA talking straight to Supabase.
- `backend-patterns` — Node/Express/Next.js API routes. There is no backend.
- `coding-standards` — generic conventions that **contradict `CLAUDE.md` §6**.
  It steers toward CSS modules, type annotations and extracted component trees;
  this repo mandates inline style objects, plain JSX with no TypeScript, and flat
  components. A skill that argues with the project rules costs more than it adds.
- `accessibility` — duplicated `frontend-a11y` and was the weaker of the two here:
  cross-platform WCAG theory with iOS and Android sections, for a web SPA.
  `frontend-a11y` keeps the concrete web patterns (ARIA, focus, keyboard, forms).
- `using-superpowers/references/{codex,antigravity,pi}-tools.md` — setup notes for
  OpenAI Codex, Google Antigravity and Pi. This repo is driven with Claude Code.

## Local modifications

These vendored files were edited to stop them fighting `CLAUDE.md`. Re-apply the
same edits if you ever re-pull from upstream:

- **`using-superpowers/SKILL.md` — rewritten.** Upstream required invoking a skill
  "before ANY response including clarifying questions", told the agent it had "no
  choice" and "cannot rationalize your way out of this", and mandated a "Using
  [skill] to…" announcement plus a todo per checklist item. That is precisely the
  ceremony `CLAUDE.md`'s "How to answer" exists to prevent — the maintainer has
  ADHD and short replies are a stated hard requirement, so the upstream text made
  every one-line question expensive. Now: skills are reference material, checked
  when the task warrants it, and `CLAUDE.md` explicitly wins on conflict.
- **`brainstorming/SKILL.md` — gate scoped.** Upstream applied its 9-step design
  process to "EVERY project regardless of perceived simplicity", naming config
  changes and single-function utilities. It now applies to work with a genuine
  open design question, and the checklist scales to the size of the task.

**The general rule:** these skills are written for arbitrary codebases and know
nothing about this one. Where a skill and `CLAUDE.md` disagree, `CLAUDE.md` is
right. Several also teach in TypeScript (`frontend-patterns`, `error-handling`,
`vite-patterns`, `security-review`, `e2e-testing`) — translate the pattern, never
copy the annotations, because §6.1 bans TypeScript here.

**Note on `design-system`:** its "generate a design system" mode writes a
`DESIGN.md` + `design-tokens.json` + preview page from scratch, and its audit
mode scores against whatever it invents. This repo already has both halves —
[`docs/DESIGN-BIBLE.md`](../../docs/DESIGN-BIBLE.md) for the principles and
`docs/ARCHITECTURE.md` + `src/designTokens.js` for the tokens. **Do not let it
create a competing design document or a second token system.** Use it, if at
all, as an audit lens (consistency, contrast, dark mode, AI-slop detection) with
this repo's own design sources as the reference.

**Note on `security-scan`:** it drives an external tool (AgentShield) that is not
a dependency of this repo. It audits `.claude/` config, which is a different job
from `security-review` (application security) — they are not duplicates.

## Notes

- Only skills were vendored. The plugins' **hooks** (which auto-run on every
  session) were intentionally NOT wired into `settings.json`. If you want any
  hook behavior, enable it deliberately.
- To update: re-clone the upstream repos and re-copy the relevant skill folders.
- The full ECC catalog has 278 skills; only the stack-relevant subset was taken
  to keep the skill namespace focused. Add more from upstream as needed.
