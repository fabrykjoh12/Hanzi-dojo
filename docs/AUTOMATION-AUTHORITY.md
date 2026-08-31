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

### 1. Canonical Discord state — a `main`-scoped environment (DESIGNED, NOT YET ENFORCED)

`roadmap-live-sync.yml` declares the **`roadmap-discord`** GitHub Environment.
The intent is that the environment is restricted to `main` with no bypass
branches and the Discord webhooks live in it as **environment** secrets rather
than repository secrets — at which point a run on any other ref is not granted
them, and the old workflow on a stale branch executes, finds no webhook, and
skips. It would be unable to reach Discord for want of a credential, whatever
its own YAML said.

**That is the design, and it is not in force yet.** The environment declaration
is inert while `DISCORD_ROADMAP_WEBHOOK` remains a repository secret, because a
repository secret is handed to runs on every ref. Until the secret is moved into
the environment *and* the repository-level copy deleted, a stale branch can
still rewrite the pinned `#roadmap` message.

The migration is a maintenance step deferred by choice, not an oversight. The
code is already shaped for it, so finishing it is a settings change with no
accompanying pull request.

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

Each boundary is only real once its external configuration exists. As of
2026-08-27 one of the two is:

| Boundary | Status |
|---|---|
| **`main`** — ruleset, empty bypass list | ✅ **Active.** `main` reports `protected: true`; deletions and force pushes blocked; PR required; `check` + `playwright` + `native-gate` required; no bypass, `current_user_can_bypass = never` |
| **`main`** — *up-to-date* enforcement | ⚠️ **Loose.** Required checks are enforced; being current with `main` is not. See below |
| **Roadmap Discord** — `roadmap-discord` environment | ⚠️ **Designed in code, not yet enforced.** The workflow declares the environment, but the webhook is still a **repository** secret, so it is handed to runs on any ref |

## The third gap: a stale branch cannot *push* `main`, but it can still *merge* into it

The two boundaries above are about a branch **writing** to `main`. There is a
separate question — what a branch is allowed to **merge into** `main` — and the
ruleset currently leaves half of it open.

Ruleset `21654011` requires `check`, `playwright` and `native-gate`, but carries
`strict_required_status_checks_policy: false`. GitHub's documented loose
semantics let a topic branch merge **without being up to date with its base**. So
a branch reviewed and checked against yesterday's `main` can merge into today's,
and every required check stays green while it happens.

That is not hypothetical. During PR #229 the exact independently reviewed head
was one commit behind live `main` with all three checks green — the same
time-of-check-to-time-of-use shape as everything else in this document, one
level up: **stale code may exist; stale authority may not, and neither may a
stale base.**

The repository-side half is [`docs/INTEGRATION-PROTOCOL.md`](INTEGRATION-PROTOCOL.md):
a decision function that binds the exact reviewed head to the current target
state and fails closed when either has moved. It cannot close the race by
itself — reading state and merging are two moments, and only GitHub can make
them one. That takes the strict policy, whose activation plan is in the same
document and is a deliberate maintainer action rather than anything a pull
request performs.

Until that activation happens, treat "the required checks are green" as a
statement about a commit, not about the merge result.

## What each boundary actually holds

So, precisely:

- A stale branch **can no longer mutate `main`.** The ruleset rejects the push
  at the server whatever the branch's workflow says.
- A branch **can still merge a stale base into `main`**, because the required
  checks are enforced loosely. The integration protocol detects it; the strict
  policy is what will prevent it.
- A stale branch **can still mutate the roadmap Discord message**, because its
  old workflow reads `DISCORD_ROADMAP_WEBHOOK` and that secret is still
  repository-scoped. The `environment:` declaration does nothing until the
  secret moves into the environment and the repository-level copy is deleted.

That migration is deliberately deferred — it is a maintenance step, not a code
change, and the code is already shaped for it. Until it happens, treat the
pinned `#roadmap` message as writable by any branch, and do not describe Discord
containment as complete.

Beyond that, this does not make stale branches safe to run: they can still fail
loudly and waste a runner. Deleting the merged ones is worthwhile hygiene; it is
just not what is holding the line.
