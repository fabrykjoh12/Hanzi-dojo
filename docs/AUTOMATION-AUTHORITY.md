# Automation authority

**Stale code may exist; stale authority may not.**

That is the whole document. The rest explains why it had to become a rule, and
what enforces it.

---

## The problem it answers

GitHub runs a workflow from the tree of **the ref that was pushed**, not from
`main`. A branch created in July still runs July's workflows today, with July's
permissions and July's secrets, forever — and there is no way to reach back and
change that.

We learned this the expensive way. `roadmap-live-sync.yml` used to run on
non-`main` pushes and copy that branch's `ROADMAP.md` and `docs/BACKLOG.md`
straight onto `main` with `git push origin HEAD:main`. PR #222 fixed the
workflow on `main`. Within an hour a branch that predated the fix pushed again
and reverted PR #222's own documentation — and did it twice more after that.

An audit found **75 of 90 branches** still carrying the pre-fix file, every one
of them with `branches-ignore`, `contents: write`, a Discord `PATCH`/`POST`, and
a push to `main`.

## Why we did not fix it by updating the branches

Merging `main` into 75 branches would have worked exactly once. It is not a
boundary:

- any branch restored from a fork, a stale clone or a reflog brings the old file
  back;
- any branch cut before today and left unmerged is still live;
- it has to be redone after every future workflow fix, forever;
- and it is unverifiable — nothing fails if one branch is missed.

A boundary has to hold **without** the cooperation of the code on the other
side of it. So the capability is closed at the resource, not at the caller.

## The two boundaries

### 1. Canonical Discord state — a `main`-scoped environment

`roadmap-live-sync.yml` runs under the **`roadmap-discord`** GitHub Environment,
which is restricted to `main` with no bypass branches. The Discord webhooks are
**environment** secrets, not repository secrets.

A run on any other ref is not granted them. The old workflow on a stale branch
still executes — and finds no webhook, so it skips. It cannot reach Discord
because it has no credential to reach Discord with, regardless of what its own
YAML says.

### 2. Canonical `main` — a ruleset with an empty bypass list

Two statements here, and the difference between them matters:

**Repository code** — no workflow *explicitly names* `main` as a push target.
The last one that did was `needs-testing-sync.yml`, which committed its Discord
thread-id map there; it now writes an orphan branch instead (below).

**But four workflows still resolve their push target dynamically** from the ref
they were dispatched on, so dispatching one from `main` pushes `main`. See the
section below. Repository code cannot prevent that — the target is only known at
run time.

**The resource boundary** — the `main` ruleset, with an **empty bypass list**,
rejects every direct workflow push to `main` at the server, dynamic ones
included. That is what actually holds the line, and it holds without knowing
anything about the workflow attempting the push.

Both halves are needed. The code change is what lets the bypass list stay empty:
a ruleset is only as strong as that list, and a GitHub Actions bypass wide enough
for one job is wide enough for **every** workflow on **every** branch — including
the 75. `workflow-authority.test.mjs` fails if any workflow reintroduces an
explicit `main` target, so the exception never needs adding back.

What that test does **not** claim is "no workflow can push `main`". It cannot:
that is a property of the ruleset, which lives in GitHub settings rather than in
this repository.

## Canonical content vs. mutable state

The distinction that made the second boundary possible:

| | Lives on | Written by |
|---|---|---|
| **Canonical** — source, docs, workflows | `main` | humans, through pull requests |
| **Mutable automation state** — Discord ids | `automation/*` | workflows, never humans |

`needs-testing-sync.yml` reads `docs/TESTING.md` and its scripts from `main`,
and writes only `automation/needs-testing-state`. That branch is an orphan
holding one file; its tree is assembled with `git mktree` from exactly one blob,
so it *cannot* contain source, docs or workflows. Not by policy — by
construction.

Concurrent runs compare-and-swap: on a rejected push the remote map is merged
in (remote wins for ids both sides know, because those threads already exist in
Discord) and the commit is rebuilt. Never force-pushed — the losing side holds
real thread ids, and abandoning them would orphan live threads testers have
already replied to.

## The four dynamic writers

`content-utils.yml`, `llm-bench.yml`, `story-pilot.yml` and `vocab-complete.yml`
push `HEAD:${GITHUB_REF_NAME}` (or a bare `git push`) — whatever ref the run was
dispatched on. Dispatch one from `main`, which is the Actions UI default, and it
commits to `main`. The word "main" never appears in them, so they do not look
like main-writers on inspection, and no static check can rule the case out.

They are content workflows whose job is committing generated data, so where that
data should land is a content-pipeline decision rather than a containment one.
They are **listed** rather than changed. `workflow-authority.test.mjs` pins the
set at exactly these four, so a fifth cannot appear without a deliberate
decision.

**Temporary operational behaviour, not the end state.** Once the `main` ruleset
is enabled these four will *fail at push time* when dispatched from `main` —
after doing their work, which is wasteful and confusing. That is accepted for
now because failing closed beats mutating `main`. `vocab-complete.yml --task
build` is the one most likely to be noticed: it rebuilds the HSK word lists and
commits them.

The follow-up, deliberately out of scope for the containment change, is to give
each one an explicit refusal when `github.ref` is `main`, or convert it to
generate on a branch and open a pull request.

## Adding a workflow that needs to write something

1. **Writing to `main`? Don't.** Open a pull request, or write to `automation/*`.
   Check the *resolved* target, not the literal string: `HEAD:${GITHUB_REF_NAME}`
   and a bare `git push` both become `main` when dispatched from `main`.
2. **Touching canonical Discord state?** Put it in the `roadmap-discord`
   environment and use environment secrets.
3. **Needs `contents: write`?** Say in a comment which refs it may advance, and
   add the assertion to `workflow-authority.test.mjs`.
4. **Needs a new credential?** That credential is reachable by every workflow on
   every branch that can read it. Scope it to an environment.

## What is deliberately not claimed

This does not make the stale branches safe to run, and it is not self-executing.

What holds is conditional on the external configuration existing: the
`roadmap-discord` environment must be restricted to `main` **and** the
repository-level webhook secrets deleted, or the environment is decorative; the
`main` ruleset must exist with an empty bypass list, or dynamic pushes to `main`
still land. Until both are in place, the repository changes here reduce the
number of write-paths but close nothing.

Once they are, stale branches become **unable to mutate canonical state** — but
they can still fail loudly, waste a runner, or post to any channel whose webhook
was left as a repository secret. Deleting the merged ones is worthwhile hygiene;
it is just not what is holding the line.
