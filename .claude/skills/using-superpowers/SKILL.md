---
name: using-superpowers
description: How to find and use the vendored skills in .claude/skills. Consult when a task looks like it matches a skill - planning a feature, debugging, reviewing code, writing tests.
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this skill.
</SUBAGENT-STOP>

## CLAUDE.md wins

`CLAUDE.md` is the authority in this repo. Where a skill and `CLAUDE.md` disagree,
**`CLAUDE.md` is right and the skill is wrong** — the skills here are vendored
from general-purpose upstream projects and know nothing about this codebase.

That applies especially to `CLAUDE.md`'s "How to answer" section. Short, direct
answers are a hard requirement here, not a style preference. **Do not add
ceremony** — no "Using [skill] to…" announcements, no todo list per checklist
item, no process narration — unless the task genuinely warrants it or the
maintainer asks. A one-line question gets a one-line answer.

## The rule

Skills are **reference material, not a gate**. Before non-trivial work, check
whether a skill covers it; if one does, follow it. If none does, or the task is
small enough that the skill would cost more than it saves, just do the work.

Use judgement about what "non-trivial" means. Answering a question, reading a
file, or making a one-line fix does not require a skill check first.

## Skill priority

When several skills apply, process skills set the approach and implementation
skills carry it out:

- "Let's build X" → `brainstorming`, then the relevant implementation skills
- "Fix this bug" → `systematic-debugging`, then domain skills

## Worth reaching for

| Situation | Skill |
|---|---|
| Multi-step feature, requirements unclear | `brainstorming`, then `writing-plans` |
| A bug whose cause isn't obvious | `systematic-debugging` |
| Before claiming something works | `verification-before-completion` |
| Writing or fixing tests | `test-driven-development`, `react-testing`, `e2e-testing` |
| Finishing a branch / opening a PR | `finishing-a-development-branch`, `requesting-code-review` |
| Touching auth, secrets, user input | `security-review` |
| Schema or migration work | `database-migrations`, `postgres-patterns` |

## A caveat on the vendored skills

Several were written for TypeScript codebases and show typed examples
(`frontend-patterns`, `error-handling`, `vite-patterns`, `security-review`,
`e2e-testing`). **This repo is plain JSX with no TypeScript — `CLAUDE.md` §6.1.**
Translate the pattern; never copy the annotations.
