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
| | *These values are **recorded**, not re-verified on every edit to this file. Read ruleset `21654011` back from the API before acting on them — the integration gate fails closed on a mismatch rather than trusting this row.* |
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

## The fourth boundary: which paths a task contract may authorise

Everything above is about a *branch*. This section is about a *task* — the
sealed contracts in `.agent/tasks/`, and how much authority one of them may
hand to the agent implementing it.

A contract's `allowed_paths` is the scope of a piece of work. The danger is a
task that quietly widens its own reach by naming a path that governs the
harness itself: change `.claude/settings.json` and you change which tools run
without a prompt, for every session afterwards. That is not a code change with
a review; it is a change to who reviews.

So paths fall into **three tiers**.

### Tier 0 — the absolute floor

`ALWAYS_FORBIDDEN` in `tools/verify-task-contracts.mjs`:

```
.agent/tasks/**   .agent/roles.json   .claude/settings.local.json   .git/**
```

No contract may name these, under any role, at any risk level, through any
mechanism. There is no grant, no exception and no override — the validator
rejects the contract, and mechanical review reports the diff independently of
whatever the contract says. These are the files that define what a task *is*
(`.agent/tasks/**`, including its own `README.md`), who may own one
(`.agent/roles.json`), the machine-local permission overlay
(`.claude/settings.local.json`), and history itself (`.git/**`).

The floor is why a task cannot re-seal itself: repairing a digest means writing
`.agent/tasks/**`, and nothing authorises that.

### Tier 1 — the protected control plane

`PROTECTED_CONTROL_PLANE`:

```
.claude/settings.json   .claude/hooks/**
```

Two grants exist, and each reaches one part of the tier:

| Grant | Reaches | Maintains |
|---|---|---|
| `runtime-policy-maintenance` | `.claude/settings.json` | the permission and hook *declarations* |
| `runtime-hook-maintenance` | `.claude/hooks/**` | the hook *scripts* those declarations point at |

Related work, but not the same authority. A task that writes a guard script has
no business rewriting the permission allow-list, and a task that edits settings
has no business rewriting the code a hook runs.

**Between them the two grants cover the whole tier; neither covers it alone.**
That distinction is the design, and it is what separates Tier 1 from Tier 0:
every Tier 1 path is now authorizable by exactly one grant, so "protected" here
means *governed*, not *unreachable* — while no single grant is a synonym for the
tier, so a grant still has to name what it needs. Tier 0 remains the tier
nothing can reach. When a third protected path arrives, it arrives with its own
narrow grant; widening an existing grant to cover it would collapse that
distinction and leave the grant/path check unable to fire.

The alternative considered and rejected for the hook script: leave it in an
ordinary Tier 2 file and point settings at it. That needs no grant — and it
would let a task rewrite the very guard that constrains it.

These *do* sometimes need to change — a runtime path guard has to be installed
by somebody. But not by an ordinary task, and never by adding a line to
`allowed_paths`. A Tier 1 path is unreachable through `allowed_paths` (the
validator rejects it, including via a covering subtree like `.claude/**`) and
reachable only through a dedicated, digest-covered `control_plane` declaration:

```json
"control_plane": {
  "grant": "runtime-policy-maintenance",
  "protected_paths": [".claude/settings.json"],
  "justification": "installs the runtime path guard"
}
```

A declaration is honoured only if **all** of it checks out:

- `owner_role` is the role that owns the control plane — today `workflow-authority`,
  and **derived** rather than hardcoded. `.agent/roles.json` is the one canonical
  role source and the validator names no role id anywhere, so the holder is read
  back out of the role model: the single role claiming the control plane in its
  own `purpose` or `authority`. If that ever resolves to zero roles or to more
  than one, no contract may hold a grant at all — could not establish is not
  authorised.
- `risk` is at least `r3`. This does not widen `r4`, which stays reserved for
  direct production authority; the risk model already places control-plane
  work at `r3`.
- `grant` is one of a **closed** vocabulary — closed to the keys actually
  written in the registry, checked with `hasOwnProperty` so `constructor` and
  friends are not inherited grants — each mapping to its own part of the tier.
  No single grant reaches every path in the tier, and a grant cannot authorise a
  protected path outside its own mapping. That property is asserted by **reach**
  rather than by counting paths: a grant mapping to one covering subtree could
  list fewer paths than the tier holds and still reach all of them, so the spec
  asks what each mapping *covers*.
- Every protected path is inside Tier 1, outside Tier 0, and obeys the existing
  decidable path grammar — an exact path or a `dir/**` subtree, never a
  filename wildcard.
- A `justification` is present, because a reviewer reading the contract should
  not have to infer why the authority was needed.
- No granted path is also in `forbidden_paths`. Mechanical review tests
  forbidden paths before scope, so such a grant could never take effect — dead
  authority is a mistake to correct, not to reconcile.

The declaration is closed to exactly those three keys. A field the schema
accepts but nothing reads would be sealed into the digest and invite its author
to believe it constrained the grant.

If any of that fails, the grant widens **nothing**. It is not partially
honoured: `grantedProtectedPaths()` returns an empty list, the paths it named
are still reported out of scope, and the contract itself is invalid. Fail
closed, not fail partial — a grant nobody could validate is a grant nobody
reviewed.

### Tier 2 — everything else

Ordinary paths, governed by `allowed_paths` and `forbidden_paths` exactly as
before. Most work lives here, including `.claude/commands/**` and (today)
`.claude/agents/**`.

### The digest rule

`control_plane` is an **optional binding field**, and that phrase is a general
schema rule rather than a special case for this one field:

- A **required** binding field is always folded into `contract_digest`.
- An **optional** binding field is folded in **if and only if the key is
  present** — by `hasOwnProperty`, so an explicit `null` counts as present and
  moves the digest.

This is what let the tier be added at all. Folding a new field in
unconditionally would have re-sealed every contract already on disk, and
repairing those digests means writing `.agent/tasks/**`, which is Tier 0. The
schema would have been unextendable. A spec recomputes the digest of every
contract in `.agent/tasks/` and asserts it is unchanged; a second one proves
that adding, changing, widening or removing a grant does move it. So a grant
cannot be added to a contract after it was sealed and reviewed.

Any future optional binding field inherits this rule by being listed in
`OPTIONAL_BINDING_FIELDS`. Nothing else needs to change.

### What a grant still cannot do

- **Reach Tier 0.** No grant maps there, and mechanical review reports a floor
  path unconditionally, before scope is consulted.
- **Edit its own contract.** Independently blocking, whatever the grant says.
- **Escape its mapping.** The grant names a subset; the tier is not a keyword
  that unlocks the rest of it.
- **Take effect while the contract also forbids it.** A granted path that is
  forbidden is rejected at validation, not silently ignored.
- **Change anything at runtime.** This tier is a *rule*, checked when a contract
  is validated and when a diff is reviewed. It is not a hook, a permission or a
  sandbox, and it does not stop an agent from writing a file. See the honesty
  note below.

### What is deliberately not claimed here

**`.claude/agents/**` is not in Tier 1 today.** Agent definitions carry real
authority — a subagent's `tools:`/`disallowedTools:` list is platform-enforced
and is currently the only enforcement primitive that was empirically found to
hold — so they belong in this tier eventually. They are absent for a sequencing
reason, not a safety judgment: `fresh-context-reviewer.json` is already sealed
and merged with `.claude/agents/fresh-context-reviewer.md` legitimately in its
`allowed_paths`, and adding the subtree to Tier 1 would retroactively invalidate
that contract — which could only be repaired by writing `.agent/tasks/**`. Until
that lifecycle question is settled, agent definitions are governed by the
ordinary Tier 2 model, and nothing here should be read as protecting them.

**The registry itself is an ordinary file.** `PROTECTED_CONTROL_PLANE` and the
grant mapping live in `tools/verify-task-contracts.mjs`, which is Tier 2 — a
task that owns the validator can, in one change, add a path to the tier *and*
carry a grant naming it. `.agent/roles.json` is on the floor for the analogous
reason one level up, and this residual is not closed the same way; what holds
here is visibility rather than prevention. The tier, the mapping and the grant
are all covered by `contract_digest` and all appear in the sealed diff, so the
expansion is tamper-evident and a reviewer sees it as its own term. Treat a diff
that widens the registry as a governance change, not a refactor.

**`.agent/tasks/README.md` still lists `.claude/settings.json` under the
always-forbidden floor.** It is stale as of this change, and it is inside Tier 0,
so no task may correct it — the file can only move through root governance. The
operational answer it gives is still right for `allowed_paths` (a task may never
name that path there); what it now gets wrong is "never", since a grant can
reach it. This document is the current source of truth for the tiers.

**The tiers hold through validation and review, not through the runtime.** A
cold fresh-session probe established that the tool-use guards declared in a
project subagent's own frontmatter never execute in this managed runtime: zero
guard events, zero registration, every path escape succeeded. Settings-level
configuration is the remaining route, and `.claude/settings.json` is exactly
why this tier exists —
but that work is a separate, separately reviewed change. Today the tier tells
you what a contract may *authorise*, and makes an unauthorised diff visible. It
does not make one impossible.

## The runtime guard: what exists, and what it does not yet do

Everything above decides what a contract may *authorise*. This section is about
a separate question — what an agent implementing a task can actually *do* while
it works — and about being precise on how much of that is real today.

### The arrangement

Two trust domains. A **trusted driver** holds the shell, git, the test runner
and the network. An **untrusted producer** — a subagent with a platform-enforced
tool list containing no Bash, no process tool and no ability to spawn agents —
does the implementing. A tool-use guard **will** run outside both and decide
every producer write against the sealed contract bound to the session — once it
is registered. It is written and proven but registered nowhere, so nothing in
this section describes behaviour that happens today; the whole arrangement is
described in the future tense deliberately, and "What is NOT claimed" below says
so again where a reader is most likely to stop.

The producer and the driver will be told apart structurally, not by trusting a
name: a producer's tool call carries `agent_type`, and a driver's carries none.

### Where the decision logic lives, and why

```
.claude/hooks/task-scope-guard.mjs    thin adapter: stdin -> policy -> deny
        └── .claude/hooks/task-scope-policy.mjs    all the decisions
                └── node: builtins only
```

Both files are **Tier 1**, reachable only through `runtime-hook-maintenance`.
That placement is the point. An earlier draft put the decision module in
`tools/` and imported it from the hook — which would have made the runtime
authorization path depend on ordinary Tier 2 code that a task could itself be
authorized to rewrite. That is the escalation the tier model exists to prevent,
one layer down.

The cost is a small duplicated copy of path, seal and grant semantics that
`tools/verify-task-contracts.mjs` also implements. Parity specs hold the two to
the same answer over every contract on disk and over generated path pairs, so
drift fails a test rather than quietly producing two security models.

### How a contract binds to a producer

The launcher sets `HANZI_TASK_BINDING` on the process, carrying the contract id,
its exact digest, and a path required to equal `.agent/tasks/<id>.json`. The
guard re-reads that file and recomputes its seal on **every** decision, denying
unless the recomputed digest matches both the file's own claim and the
launcher's. As above, that is what the code does when it runs, not something
happening in this repository today.

There is no discovery of any kind — no directory scan, no newest-file
heuristic, no inference from the prompt, cwd or branch, and no fallback when the
binding is absent. Each of those would let the thing being governed influence
which rules govern it.

**Confidentiality is not the claim.** The binding may well be readable by
anything that can read the environment. The property that matters is that the
producer cannot *choose or mutate* it: it is set before the session exists, and
a Bash-less producer has no tool that touches process environment. v1 is
deliberately one bound contract per launcher session; running another task means
starting another bound session.

### Who the guard governs

Not every subagent. The guard holds a caller to its contract when the session
carries a binding, **or** when the caller is not one of a closed list of
recognised helper agents — `general-purpose`, `Explore`, `Plan`, `claude`,
`claude-code-guide`, `fresh-context-reviewer`, `statusline-setup`. A call with
no `agent_type` at all is the trusted driver and is not held to any contract.

The obvious rule — govern the agent named `task-producer` — is the one this
deliberately avoids, because it fails in the wrong direction. `agent_type` is
the frontmatter `name:` of the launched definition, not its filename: a
definition in `renamed-file.md` declaring `name: inner-declared-name` emits
exactly `inner-declared-name`, verified on Claude Code 2.1.259. Since
`.claude/agents/**` is Tier 2, a name-equality rule would let a one-line edit to
an ordinary file switch enforcement off silently. Stated as an exemption
instead, an unrecognised name is governed rather than exempt, so that same
rename produces *more* enforcement, not less.

**What the exemption exempts, exactly.** One thing: the contract scope, which
an unbound helper has no contract to be measured against. It exempts nothing
from the tiers. A recognised helper in an unbound session is still refused
Tier 0 *and* Tier 1, on the **resolved** path — so a symlink cannot launder
either, and `.claude/hooks/**`, this guard's own module, is not writable by a
helper that carries no grant. In one line: an unbound helper writes ordinary
Tier 2 paths and nothing else.

That resolution is done by the exemption itself rather than inherited. The
lexical floor check upstream sees only the spelling it was handed, and the
authoritative resolved check sits downstream of the exemption, where it never
runs for this caller. An earlier draft of this change relied on the upstream
check alone, and `src/door/config` with `src/door` symlinked to `.git` went
through — caught in review, closed, and pinned by a spec that asserts the deny
names the resolved path rather than the spelling.

Two consequences worth stating plainly:

- **A binding overrides the exemption.** Once a session is bound to a contract,
  every subagent in it is held to that contract, helpers included — a helper
  spawned inside a bound session is doing that task's work. This is a decision,
  not a derivation; the opposite is defensible.
- **A new helper agent is denied until it is listed.** That is the intended
  direction: a loud, cheap failure rather than a silent exemption.

One name on the list is not a platform built-in: `fresh-context-reviewer` is a
repository-defined Tier 2 definition like the producer's. It holds no write
tool, so it never reaches the branch the list guards.

**An `agent_type` that is present but unusable is denied, not read as the
driver.** The driver is identified by the key being *absent*, which is what a
real main-thread call sends. An array, object or number in that field is a
malformed event, and this guard does not guess at events it cannot read.

**The residual this does not close.** `agent_type` originates in a Tier 2 file,
so an edit that renames the producer *to* one of the recognised helper names
would exempt it. That is not a new weakness: the same edit could give the
producer Bash, which defeats the guard outright — see the tool-list dependency
below. A spec pins the policy's constant to the name the producer definition
declares, so drift between them fails CI; the tier itself is what would have to
change to close the residual, and that waits on the contract-lifecycle work.

### What is proven, and what is merely written down

Proven by unit and adversarial specs against a real temporary repository:

- Tier 0 is the **first** branch, and applies before the binding is parsed — so
  a floor write is refused even in a session with no binding at all.
- Every invalid state denies: missing or malformed binding, a malformed hook
  event, missing, malformed or unsealed contract, id/path/filename mismatch,
  stale seal, digest mismatch, bad path grammar, invalid grant, out-of-scope
  path, unresolvable realpath.
- **A contract that fails any of the guard's checks authorises nothing at all**
  — not "loses the grant and carries on with its ordinary paths". The sharpest
  case is `.claude/settings.json` sitting in ordinary `allowed_paths`: that
  would otherwise hand a producer the control plane with no grant whatsoever.
  What the guard checks, before any scope is consulted: path shapes and grammar
  for `allowed_paths` and `forbidden_paths`, no Tier 0 and no Tier 1 reachable
  through `allowed_paths`, and for a grant its closed key set, owning role, risk
  floor, mapping and tier containment, and no overlap with `forbidden_paths`.
  Any one of those denies the whole decision. "Invalid grant" is measured
  against the canonical rules rather than a subset: the owning role and the `r3`
  floor are checked as well as the shape, so a grant the validator refuses
  grants nothing at runtime either. Specs assert that over deliberately invalid
  contracts, because a parity check that only sees valid ones agrees on every
  input it will ever get.

  **That is narrower than the canonical validator, deliberately and stated so.**
  `tools/verify-task-contracts.mjs` rejects a good deal more — **including**, and
  not limited to, an unknown top-level field, a missing required field, a
  malformed id, an unknown `owner_role`, `risk` or `production_effect`, an empty
  required array, an allowed path lying entirely inside a forbidden one, an
  unresolved dependency, and a verification command naming no npm script. That
  list is illustrative, not a specification: the guard does not re-implement
  those rules and does not track them, so treat the validator as the authority
  on contract validity and this section as an account of what the *runtime*
  checks.

  What makes the gap safe is not the list but the shape of it: none of those
  rules is a widening vector. Every route by which a contract could reach beyond
  its own ordinary paths — Tier 0 or Tier 1 in `allowed_paths`, a bad path
  spelling, any malformed or unauthorised grant — is checked above, and the
  granted set is at exact parity with the validator. A contract failing only a
  validator-only rule is refused by `npm run verify:tasks` and by CI, and would
  still authorise its own ordinary paths at runtime. That asymmetry is why the
  parity specs assert containment rather than equality.
- **The adapter fails closed before the policy exists.** The policy is loaded
  inside the caught path, not as a top-level import: a static import throws
  where no catch can reach it, Node exits non-zero, and only exit code 2 blocks
  a tool call — so a missing or broken policy module would have failed *open*.
  Proven by specs that spawn the real adapter and feed it real stdin, including
  a missing policy, an unparseable one, and one that throws.

- **The symlink escape is closed, in both its forms.** A real symlink inside an
  in-scope directory pointing out of it is denied, because the guard resolves
  the target with `realpath` before matching. So is the harder case: a symlink
  whose target does **not** exist. `realpath` fails identically for that and for
  an ordinary new file, and resolving through the parent — which is right for
  the new file — would hand back the link's own in-scope path and allow a write
  that follows the link anywhere, including into Tier 0. The guard `lstat`s the
  final component to tell the two apart and denies the dangling link. This matters: a cold probe on Claude Code 2.1.257,
  revalidated on 2.1.258, showed the runtime hands the hook the **unresolved**
  path, so a textual prefix check is bypassable.
- A valid in-scope write succeeds, including a new file whose parent resolves
  inside scope — the guard is not deny-all.

### What is NOT claimed

**The hook is intentionally inert.** Nothing registers it in
`.claude/settings.json`; that is a separate change under `runtime-policy-maintenance`.
So Tier 0 is the first branch of *protected hook logic that has been proven in
tests* — it is **not** globally enforced at runtime, and this change does not
make it so. The **static Tier-0 deny rules** arrive with registration too; note
that only `Edit(path)` and `Read(path)` rules are consulted, since `Write(path)`
rules are accepted and silently never checked.

**`disableAllHooks` remains a trusted-launcher residual.** A launcher passing
`--settings '{"disableAllHooks":true}'` silences the hook completely, and
project settings **cannot** pin it back — verified empirically. It is out of the
producer's reach only because it is a process-launch flag and the producer has
no shell. Static deny rules survive it, which is why they are the Tier-0
backstop once registered.

**The guard only sees four write tools, so it rests on the producer's tool
list.** It is an allowlist over `Write`, `Edit`, `MultiEdit` and `NotebookEdit`;
everything else, Bash included, it passes through untouched as none of its
business. That is correct given a producer with no shell — but it means editing
the Tier 2 producer definition to add Bash or an MCP write tool does not merely
falsify the "no Bash" sentence, it defeats the guard entirely. The two halves
compose into one requirement: the guard is worth what the producer's tool list
is worth.

**The producer definition is not protected.** `.claude/agents/**` is Tier 2. The
platform enforces the `tools:` list of whatever definition is launched, so a
launched producer really has no Bash — but the definition file itself can be
modified by any task authorized to write it. Moving it into Tier 1 waits on the
contract-lifecycle work.

**The guard does not self-govern hook maintenance.** A task holding
`runtime-hook-maintenance` can rewrite the very guard that would constrain it, so
running such a task under the guard proves nothing about that task. Hook and
control-plane maintenance remain a **trusted control-plane workflow**, reviewed
by people, not a case the mechanism secures.

## What each boundary actually holds

So, precisely:

- A stale branch **can no longer mutate `main`.** The ruleset rejects the push
  at the server whatever the branch's workflow says.
- A branch **can still merge a stale base into `main`**, because the required
  checks are enforced loosely. The integration protocol detects it; the strict
  policy is what will prevent it.
- A task contract **can no longer authorise the control plane by accident.**
  Tier 0 is unauthorisable, Tier 1 needs an explicit digest-covered grant that
  a reviewer can see, and a malformed grant widens nothing. This is a rule
  checked at validation and review time — it is not a runtime restraint.
- An untrusted producer **is not yet constrained at runtime**, because the
  guard that would constrain it is deliberately not registered. What exists is
  proven decision logic in the protected tier, waiting on a separate activation
  change.
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
