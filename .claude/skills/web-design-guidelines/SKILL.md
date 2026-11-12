---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel (vendored + pinned for Hanzi-dojo)
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Vercel's Web Interface Guidelines.

**Vendored change:** upstream fetches the rules from the internet on every run.
Here they are pinned in `guidelines.md` next to this file (read in full before
vendoring) so a remote edit cannot change what the review does. Read that file;
do not fetch.

## How it works

1. Read `guidelines.md` (this directory).
2. Read the specified files (or ask which files).
3. Check against every rule, translating Tailwind-flavoured wording to this
   repo's inline style objects (CLAUDE.md §6: no utility classes).
4. Output findings in the terse `file:line` format the guidelines specify.

**Precedence:** CLAUDE.md and docs/DESIGN-BIBLE.md win. In particular the
guidelines' "Title Case for headings/buttons" rule is overridden here by the
Design Bible's sentence case.
