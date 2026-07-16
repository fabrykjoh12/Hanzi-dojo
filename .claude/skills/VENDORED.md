# Vendored skills

These skills are third-party Claude Code skills vendored into this repo so they
are available in Claude Code web/cloud sessions (which do not carry a local
`~/.claude/plugins` directory). They load automatically from `.claude/skills/`.

## Sources & licenses

Both projects are MIT-licensed; their copyright notices are preserved below as
required by the MIT License.

### superpowers — all 14 skills
- Source: https://github.com/obra/superpowers
- Copyright (c) 2025 Jesse Vincent — MIT License
- Skills: brainstorming, dispatching-parallel-agents, executing-plans,
  finishing-a-development-branch, receiving-code-review, requesting-code-review,
  subagent-driven-development, systematic-debugging, test-driven-development,
  using-git-worktrees, using-superpowers, verification-before-completion,
  writing-plans, writing-skills

### ECC (Everything Claude Code) — curated subset (21 skills)
- Source: https://github.com/affaan-m/ECC
- Copyright (c) 2026 Affaan Mustafa — MIT License
- Curated for this repo's stack (React 19 / Vite / Supabase / Vercel / PWA):
  react-patterns, react-performance, react-testing, frontend-patterns,
  frontend-a11y, accessibility, vite-patterns, design-system, postgres-patterns,
  database-migrations, api-design, backend-patterns, error-handling, e2e-testing,
  browser-qa, security-review, security-scan, coding-standards,
  deployment-patterns, github-ops, documentation-lookup

## Notes

- Only skills were vendored. The plugins' **hooks** (which auto-run on every
  session) were intentionally NOT wired into `settings.json`. If you want any
  hook behavior, enable it deliberately.
- To update: re-clone the upstream repos and re-copy the relevant skill folders.
- The full ECC catalog has 278 skills; only the stack-relevant subset was taken
  to keep the skill namespace focused. Add more from upstream as needed.
