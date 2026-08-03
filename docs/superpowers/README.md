# docs/superpowers

Design specs and implementation plans, produced by the `brainstorming` and
`writing-plans` skills.

**These are historical records, not current intent.** Every plan and spec in
here describes a feature that has already shipped, dated 2026-07-15 → 2026-08-01.
They record *why a thing was built the way it was* — useful archaeology when you
are about to change one of those features and want the original reasoning.

They are **not** a source of truth for what the code does now. The code is, and
`docs/ARCHITECTURE.md` after it. Where a spec and the code disagree, the spec is
simply out of date — do not "fix" the code to match it.

Nor are they a plan of record for what to build next. That lives in
[`ROADMAP.md`](../../ROADMAP.md) (public) and
[`docs/BACKLOG.md`](../BACKLOG.md) (engineering).

## Why they're kept in place

Several are cited directly — `src/storyShelfFlat.js` points at the flat-shelf
spec, and `docs/CHANGELOG.md` links others. Moving them into an `archive/`
subfolder would break those references for no real gain, so they stay where they
are and this file supplies the context instead.

## Adding to this directory

New specs go to `specs/YYYY-MM-DD-<topic>-design.md`, new plans to
`plans/YYYY-MM-DD-<topic>.md`.

Before starting one, check that the work clears the bar in
`.claude/skills/brainstorming/SKILL.md` — the full design process is for features
with a genuine open design question, not for bug fixes, copy changes or config
edits. That gate was previously "EVERY project regardless of perceived
simplicity", which is why this directory grew as fast as it did.
