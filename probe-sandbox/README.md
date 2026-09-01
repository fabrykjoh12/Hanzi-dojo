# Reconnaissance probe — NEVER MERGE

Throwaway branch. Its only purpose is to answer one question with runtime
evidence, in a genuinely fresh Claude Code session:

  Does a PreToolUse hook declared in a SUBAGENT'S OWN FRONTMATTER actually fire,
  and actually deny, in this workspace/trust configuration?

That matters because the three mechanisms that can stop an unauthorized effect
(`permissions.deny`, settings-level `PreToolUse`, `sandbox.filesystem.denyWrite`)
all live in `.claude/settings.json`, which the harness's always-forbidden floor
forbids any task from editing. Subagent frontmatter is the one project-scoped
hook location that is NOT on that floor — if it works.

Nothing here is a proposed mechanism. `tools/probe-path-guard.mjs` is a probe
artefact, not the design.
