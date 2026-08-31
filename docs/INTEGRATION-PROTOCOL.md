# The integration identity gate

Reviewer approval and integrator authorization are **not the same statement**.

| Who | Says |
|---|---|
| Reviewer | *This exact implementation passed its task review.* |
| Integrator | *This exact reviewed implementation is still safe to integrate against the current target state.* |

The first is answered by [`docs/REVIEWER-PROTOCOL.md`](REVIEWER-PROTOCOL.md), and
its scope is deliberately narrow: a sealed contract, a governance boundary, an
exact head, its diff and its verification, bound to one another. It never looks
at the base branch. The second question is asked **later**, about state the
review never saw, and this document is the mechanism for it.

## The gap this closes, which was observed rather than imagined

During PR #229 the exact independently reviewed head was **one commit behind
live `main`** while every required check stayed green. Ruleset `21654011`
requires `check`, `playwright` and `native-gate`, but carries
`strict_required_status_checks_policy: false`, and GitHub's documented loose
semantics let a topic branch merge without being up to date with its base.

So the reviewed code was not the code-plus-base-state that would have merged,
and nothing in the pipeline noticed. The conceptual flow is now:

```
implement → deterministic verification → fresh-context review → exact reviewed head
          → INTEGRATION IDENTITY CHECK → human authorization → merge → post-merge verification
```

## What the mechanism is

`tools/integration-protocol.mjs` is a decision function. `tools/integration-gate.mjs`
is its CLI. Together they **merge nothing, change no repository setting, hold no
credential and make no network call.** Producing a decision is the entire
deliverable.

```
node tools/integration-gate.mjs template
node tools/integration-gate.mjs decide --task <id> --reviewed-head <sha> \
                                       --evidence <evidence.json> \
                                       --review <review-result.json> \
                                       [--target-ref refs/remotes/origin/main]
```

`npm run verify:integration` runs the specs.

### Exit codes are per-subcommand

| Subcommand | Exit 0 means |
|---|---|
| `template` | a template was emitted. **Not a decision.** |
| `decide` | the decision is `READY_TO_INTEGRATE`, and nothing else. |

Every other decision exits non-zero — including `REQUIRES_RULESET_ACTIVATION`,
which is not authorization. An exit code that let it pass for one would hand
back exactly the reassurance this gate exists to withhold.

## Two sources, on purpose

**Evidence** is a snapshot of GitHub state — pull request, check runs, ruleset —
collected by whoever holds API access. It is **validated, not authenticated**:
the protocol knows what shape a sound observation has and refuses everything
else, but it cannot prove who produced it. That is the same limitation the
review protocol states about verification evidence, and it is closed by the same
future work (an authenticated evidence producer), not by this change.

**Git** is what the local repository can establish without anyone's word: that
these SHAs are real commits, and above all whether the head actually *contains*
the target. Ancestry is the stale-base question itself, and git answers it from
the commit graph rather than from a field someone typed.

Where the two disagree, the disagreement blocks. Where they agree, that is
corroboration and **not proof** — the local remote-tracking ref is only as fresh
as the last fetch.

## The decision vocabulary

Closed, three values, and exactly one authorizes.

| Decision | Meaning |
|---|---|
| `READY_TO_INTEGRATE` | Every identity holds, every required check passed from the expected App, the head contains the target, and merge-time enforcement will not let the base move underneath this decision. Still not an instruction to merge. |
| `REQUIRES_RULESET_ACTIVATION` | Everything the protocol can establish holds, but the repository is in loose required-status-check mode. The remaining work is a settings change, not a code problem — **and it is not authorization.** |
| `BLOCKED` | Something failed, or could not be established. Nobody should be reasoning about merging yet. |

A value outside the set is rejected rather than interpreted. The dangerous
reading is "not `BLOCKED`, so probably fine", and a reviewer verdict is never one
of these values: `APPROVE` is rejected here exactly as any other foreign token
would be.

Strictness is evaluated **last**, on a finding set already known to be free of
blockers. So activating the policy can never be read as fixing a defect in the
work, and a blocked integration cannot be talked up into "it just needs the
setting flipped".

## What must hold before anything is authorized

1. **Head identity.** The reviewed head is an explicit input supplied by the
   integrator, never read out of the evidence — evidence that named its own
   approved head could assert the approval it is meant to be checked against.
   Equality is byte equality on the full SHA. Not "the same diff", not
   "equivalent changes", not "only a metadata commit on top".
2. **The pull request** still exists, is open, is unmerged, and targets the
   expected branch. GitHub's `mergeable: null` is *unknown*, and unknown blocks.
3. **The target has not moved out from under the review.** The captured target
   must be an ancestor of the head; a target that has advanced beyond what the
   head contains blocks. If a local target ref is supplied, disagreement with the
   captured target blocks too.
4. **Every required check** — exactly `check`, `playwright`, `native-gate` —
   present once, complete, successful, reported against the reviewed head, and
   produced by the expected App.
5. **The ruleset** is the one this protocol reasons about, actively enforced,
   protecting the expected branch, requiring exactly those checks **each bound
   to the expected integration**, and carrying an **empty bypass list**.
6. **A review result** approving *this* head. Necessary, never sufficient.

### Why the check source is validated, not just the name

A check name is a string, and any App installed on the repository can post a
check run with any name it likes. This repository already carries check runs
from three different Apps — GitHub Actions, a dead Cloudflare Workers hookup,
and Vercel. So each required check must come from App id `15368`
(`github-actions`), and a name matched by more than one run is **ambiguous**
rather than resolved: picking the newest, or the green one, would let whoever
posted the extra run decide which result is read.

Checks *outside* the required set are ignored, including permanently failing
ones. The ruleset defines what gates a merge, and the red `Workers Builds` check
is not fixable from this repository.

### Two invariants, and neither substitutes for the other

| | Question | Checked by |
|---|---|---|
| **A** | What *produced* the evidence run? | the check runs on the reviewed head are complete, successful, and from App `15368` |
| **B** | What does GitHub *promise to require* at merge time? | the ruleset still demands those contexts, each bound to integration `15368` |

A is a statement about what already happened; B about what will be enforced
later. **A can be perfect while B has been quietly loosened** — and that is the
same class of failure as the head/base drift that started this task, one level
up.

GitHub's ruleset API defines a required status check as a `context` plus an
*optional* `integration_id`, where the integration_id means the check must
originate from that integration. So the evidence carries structured entries:

```json
{ "context": "check", "integration_id": 15368 }
```

Flattening those to `["check", "playwright", "native-gate"]` throws the binding
away, and the drift it permits is complete and silent: a later edit keeps the
same ruleset id, the same context names and `strict: true`, while removing or
repointing the binding. Three green GitHub Actions runs would still be observed
on the reviewed head, and the gate would say `READY` against a fence that no
longer requires GitHub Actions at all. So the gate blocks on a **missing
context**, an **unexpected context**, a **duplicate context**, an **unbound**
`integration_id` (`null` — GitHub's "any source"), a **mismatched**
`integration_id`, and a **malformed entry**, each with its own finding.

### The bypass list is part of policy identity

A ruleset id is not immutable policy identity — ruleset `21654011` can be edited
in place — and a strict policy guarantees nothing about merge time if the rules
carrying it can be **bypassed**. `bypass_actors` names the actors permitted to do
that, so authorization requires it to be **empty**. Any entry blocks, including a
pull-request-only or conditional one: how such an actor could be safe is a policy
question for an independently reviewed future change, not something this protocol
may decide by shrugging.

**A missing `bypass_actors` is not an empty one.** GitHub omits the field when
the caller lacks sufficient access, so its absence means the policy state is
*unknown*, which under this protocol's own invariant is `BLOCKED`.
`current_user_can_bypass` is preserved as corroborating state and never
substituted for it — it answers "can *this token* bypass?", not "has the ruleset
no bypass actors?".

## When `main` moves after the review

This is the load-bearing lifecycle, and it has no shortcut.

A reviewer approved head **H1** against the world as it stood at **M1**. `main`
then advances to **M2**. The old review must not silently become authorization
against M2. If integrating requires updating or rebasing the branch:

```
update/rebase → H2 → deterministic verification on H2
              → BRAND-NEW fresh-context reviewer invocation → approval of H2
              → integration decision for H2 against current main
```

**The old reviewer is never resumed** — for the reason
[`docs/REVIEWER-PROTOCOL.md`](REVIEWER-PROTOCOL.md) gives: a resumed reviewer
carries its own previous conclusions, which is not a fresh review of the changed
implementation. And an integrator resolving a conflict does not get to keep the
old approval: if the resolution changes implementation semantics, the owning
implementation role resolves it and the resulting head is reviewed normally.

The gate enforces the identity half of this mechanically. A review result
approving H1 cannot authorize H2 — that is `review-head-mismatch`, and it is the
shape a rebase produces.

## What the repository-side gate cannot do

**It cannot close the final race, and it does not claim to.**

A preflight reads state at time T. The merge happens at time T+n. Nothing in
this repository can prevent `main` advancing in between, because the two are not
one atomic operation. Evidence age is bounded to reject the obviously stale, but
a bound cannot manufacture currency — GitHub state can change one second after
collection.

Only GitHub can make the check and the merge atomic, and the setting that does
it is the **strict required-status-check policy**. Until it is on, the honest
answer is `REQUIRES_RULESET_ACTIVATION`, never `READY_TO_INTEGRATE`.

### Merge queue

Investigated and deliberately **not** a design dependency. This is a personally
owned repository; the design works without it, and it is at most future
defence-in-depth.

### Binding the merge itself

When a merge does happen, it should still be bound to the exact reviewed head —
GitHub's merge API accepts an expected-head SHA and refuses if the head has
moved. That is a property of how the merge is performed, by a human, and this
task implements no merge path of any kind.

---

# Activation plan: strict required status checks

**Nothing in this change touches the live setting.** Activation is a
**separate, explicit action performed by the maintainer or an admin**, after the
repository-side mechanism has been independently reviewed. This section is the
plan for it.

## Current state

| | |
|---|---|
| Ruleset | `21654011`, name `main protection`, enforcement `active` |
| Target | `main` |
| Required checks | `check`, `playwright`, `native-gate` — each bound to `integration_id: 15368` |
| Expected source | GitHub Actions App, id `15368` |
| Bypass list | `bypass_actors: []`, and `current_user_can_bypass: "never"` |
| `strict_required_status_checks_policy` | **`false`** ← the setting to change |

These values were **read from the live API by the maintainer** and are recorded
here as external evidence; the session that wrote this document could not reach
the API. The gate fails closed on any mismatch rather than trusting this table.

## The exact change

One boolean, in the required-status-checks rule of ruleset `21654011`:

`strict_required_status_checks_policy: false` → `true`

In the GitHub web UI this is the **"Require branches to be up to date before
merging"** checkbox, under Settings → Rules → `main protection` → Require status
checks to pass. Nothing else in the ruleset changes: the required check list,
the empty bypass list, the force-push and deletion blocks and the pull-request
requirement all stay as they are.

## Why it is needed

It is the only mechanism that makes "the branch contains current `main`" a
condition GitHub evaluates **at merge time**, atomically. A repository-side
preflight cannot, because reading state and merging are two separate moments.

## Expected behaviour after activation

- A pull request whose head does not contain the tip of `main` **cannot be
  merged**. The merge button is disabled until the branch is updated.
- Updating the branch **changes the head**, which invalidates any existing
  review of the old head and re-triggers the required checks against the new
  one. That is not friction to be minimised — it is the correct consequence, and
  it is the same lifecycle described above.
- The gate's `REQUIRES_RULESET_ACTIVATION` decision disappears: with the policy
  on, a fully sound integration returns `READY_TO_INTEGRATE`.

### Effect on stale pull requests

Every currently open pull request behind `main` becomes unmergeable until
updated. Each will need: update or rebase → new head → verification → a
**brand-new** fresh-context review of the new head → a new integration decision.
Expect this to be visible immediately across all open work, and sequence
deliberately: each merge to `main` makes every other open branch stale.

### Effect on required checks

The three required checks are unchanged and still required. What changes is
*which commit* they must be green on: after an update, the previous green run
belongs to the old head, and the checks re-run on the new one. Runner cost goes
up roughly in proportion to how often `main` moves during a branch's life.

## Rollback

Set `strict_required_status_checks_policy` back to `false` on ruleset `21654011`
— the same checkbox, unticked. It takes effect immediately and needs no
deployment. Nothing else in the repository depends on the policy being on: the
gate reads it and reports it, so with the policy off it simply returns
`REQUIRES_RULESET_ACTIVATION` again rather than failing.

Roll back if activation blocks release-critical work that cannot wait for the
update-and-re-review cycle. Prefer sequencing the work over turning the boundary
off.

## Verification after activation

1. Read the ruleset back and confirm that **everything except the intended
   boolean is unchanged**:
   - ruleset id still `21654011`;
   - `enforcement` still `active`;
   - target still `main`;
   - required contexts still exactly `check`, `playwright`, `native-gate`;
   - each of those still bound to `integration_id: 15368`;
   - `bypass_actors` still `[]`;
   - and `strict_required_status_checks_policy` now `true`.

   Activation is a one-boolean change; anything else that moved is a separate
   edit that needs explaining before the fence is trusted.
2. Take a branch deliberately one commit behind `main` and confirm GitHub
   reports it as needing an update, with the merge blocked, while its three
   required checks are still green — the exact shape observed during PR #229.
3. Update that branch, confirm the head SHA changed and the required checks
   re-ran against the new head.
4. Re-run `integration-gate decide` for a sound pull request and confirm it now
   returns `READY_TO_INTEGRATE` rather than `REQUIRES_RULESET_ACTIVATION`.

Record the result on FAB-43. Until step 1 has actually been performed and read
back, treat the race as open and the gate's own words as the accurate ones.

---

## Limitations, stated rather than implied

1. **Integration evidence is validated, but not authenticated.** The protocol
   checks its shape and cross-checks it against git; it cannot prove who
   produced it.
2. **A local target ref is only as fresh as the last fetch.** Disagreement is
   decisive; agreement is corroboration, not proof of currency.
3. **Evidence age is a bound, not a guarantee.** It rejects a snapshot
   describing a different world; it cannot make one current.
4. **The gate is not invoked automatically.** It has no dispatch, no CI job and
   no required status of its own. It is a tool an integrator runs.
5. **The final race is closed by GitHub, not by this repository** — and only
   once the activation above has actually been performed.
6. **No merge is performed anywhere in this task**, and no repository setting is
   changed by any code path in it.
