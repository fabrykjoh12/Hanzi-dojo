# The fresh-context reviewer

Given an immutable task contract and a diff, launch a reviewer that never saw
the implementer's reasoning and whose job is to **find concrete reasons the work
should not merge**.

This document is the mechanism and the protocol. It is also, deliberately, the
place where the limits are written down — a control you describe more strongly
than it behaves is worse than no control, because people stop looking.

## Why fresh context is the whole point

An agent reviewing its own work brings the same blind spots and the same reading
of the contract that produced the work. It has already decided that the edge
case does not matter, that the criterion is "basically met", that the extra file
was in scope. Asking it again gets the same answer with more confidence.

`.agent/roles.json` records this as a rule — *the implementer of a task cannot
also serve as its independent fresh-context reviewer*. Until now nothing acted
on it. This is the mechanism that does.

## The mechanism

`.claude/agents/fresh-context-reviewer.md` defines a Claude Code subagent.

A non-fork subagent **runs in its own context window and does not inherit the
parent conversation**. The implementer's plan, scratchpad, intermediate
reasoning and self-justification are simply not there. That is a platform
property, not a promise the prompt makes.

What the reviewer's context does contain: its own system prompt, the delegation
prompt it is given, the repository's `CLAUDE.md` hierarchy, and a git-status
snapshot. `CLAUDE.md` is repository content that any reviewer should read
anyway — it is not the implementer's account of this change.

| Frontmatter | Why |
| --- | --- |
| `tools: Read, Grep, Glob` | A strict allowlist: **only** these three tools exist for the subagent. Not "we asked it not to edit" — there is no edit, no shell, no skill, no MCP, no nested agent. |
| `disallowedTools: Bash, PowerShell, Edit, Write, NotebookEdit, Skill, ToolSearch, Agent, WebFetch, WebSearch` | `disallowedTools` is applied first and the allowlist resolves against what remains, so someone who later adds `Bash` to `tools:` still does not get it. |
| no `fork` | A fork inherits the entire conversation, which is precisely what must not happen. A spec fails if the word appears in the frontmatter. |
| **no `isolation: worktree`** | See below. It would point the reviewer at the wrong commit. |

### Why the reviewer has no shell

An earlier revision granted `Bash` and tried to contain it. That does not work,
and the reason is worth keeping written down: removing `Edit`/`Write` does not
make a shell read-only. `Bash` can write, delete, `chmod`, replace files, run a
script that modifies files, and put them back. The only mechanisms that would
genuinely constrain it are a `PreToolUse` hook or the Bash sandbox's
`filesystem.denyWrite` — and the sandbox is configured in `settings.json` and
inherited from the parent session, with no per-agent key.

So the capability is removed instead of constrained. With `Read`, `Grep` and
`Glob` there is no platform-accessible path for the reviewer to mutate anything:

| Path | Status |
| --- | --- |
| `Bash`, `PowerShell` | not granted |
| `Edit`, `Write`, `NotebookEdit` | not granted |
| `Skill` | not granted — cannot load a skill that shells out |
| `ToolSearch` | not granted — cannot surface a deferred MCP tool |
| `Agent` | not granted — cannot spawn a wider-tooled sub-subagent |
| MCP servers | none granted, and no `mcp__` pattern in the allowlist |

That is what makes read-only a fact about the platform rather than a promise
about behaviour — and it satisfies the sealed acceptance criterion without a
hook, a sandbox setting, or any runtime enforcement.

### Why `isolation: worktree` was removed

It existed only to contain `Bash`. With no shell it has no job, and it actively
breaks the review, because the docs are explicit about what it does:

> an isolated copy of the repository **branched by default from your default
> branch rather than the parent session's `HEAD`**

A worktree branched from `main` is not the commit under review. The reviewer,
whose `Read`/`Grep`/`Glob` operate on whatever tree it is rooted in, would have
been reading the wrong code — and worktree isolation also confines reads, so a
driver-prepared exact-head tree elsewhere would be unreachable.

Instead: **`brief` refuses unless the working tree is exactly the reviewed
commit and clean.** The reviewer has no shell to check out anything else, so the
tree it reads has to already be the right one, and the driver proves that rather
than asking.

## The protocol

`tools/review-protocol.mjs` splits the review in two, because the two halves
have completely different epistemics.

**Mechanical** — computable from the contract and the changed paths alone. A
path outside `allowed_paths` is not an opinion. These are computed up front,
handed to the reviewer as evidence it did not gather, *and* re-applied to its
result. A reviewer that overlooks one still cannot approve past it.

**Judgment** — whether a criterion is really met, whether the diff regresses
something, whether the risk level is honest. No function decides these. What the
protocol does is force the answer into a shape: every criterion addressed
individually, every finding carrying evidence, and approval **stated** rather
than inferred from silence.

### Verdicts

Three values, because two would collapse the two ways a review can fail, and
those are not the same conversation.

| Verdict | Meaning |
| --- | --- |
| `APPROVE` | The review completed and nothing merge-blocking remains. |
| `REQUEST_CHANGES` | The review completed. There is specific, evidenced work to do. |
| `BLOCKED` | The review could not be completed soundly, or a structural invariant is violated. Nobody should be arguing about the diff's merits yet. |

Severities are `blocker`, `major`, `minor`, `info`. A blocker forces `BLOCKED`;
a major forces at least `REQUEST_CHANGES`.

### Silence is never approval

This is the load-bearing rule, and every fail-closed path in the code exists to
serve it:

- A missing, unparseable or wrong-shaped result → `BLOCKED`.
- A tool that failed → `BLOCKED`. A tool that did not run found nothing.
- A missing, invalid or unsealed contract → `BLOCKED`. There is no standard to
  apply.
- A `contract_digest` that is not the contract under review → `BLOCKED`. The
  terms moved under the verdict.
- An acceptance criterion left unaddressed → `BLOCKED`. "I didn't look" and "I
  looked and it was fine" are indistinguishable in prose, and only one is safe.
- A review dimension not reported on → `BLOCKED`, for the same reason.
- `no_blocking_findings: true` alongside a blocking finding → `BLOCKED`. A false
  claim in the record is worse than an honest `REQUEST_CHANGES`.
- No `--head` passed to `decide`, so there is no commit identity → `BLOCKED`,
  said out loud, because a decision that skipped the check would otherwise look
  exactly like one that made it.
- No integrity evidence → `BLOCKED`. Whether the review modified anything is
  then unknown.
- Self-attested integrity evidence → `BLOCKED`. See limitation 2.
- A recorded verification run with a non-zero exit → cannot approve; one that
  could not execute at all → `BLOCKED`.
- A reviewed `head_sha` or `base_sha` that is not the one being decided against
  → `BLOCKED`. A verdict binds to commits, not to branch names.

`APPROVE` requires all of: `no_blocking_findings: true`, every criterion `met`,
no blocker or major finding, no protocol error, no tool failure, external
integrity evidence, and every recorded verification run passing with evidence.
The CLI exits `0` only for `APPROVE`.

A reviewer may be **more** cautious than the machinery and never less. If it
returns `BLOCKED` where the checks computed `APPROVE`, `BLOCKED` stands — it saw
something no function can.

### Verification is the driver's, and every required command is accounted for

The reviewer cannot run the contract's commands, so the driver runs them —
`review-task.mjs verify`, in **its own throwaway worktree at the reviewed
commit**, separate from the tree the reviewer reads so that build and test output
cannot look like the reviewer having written a file. The record it produces is
the only one that counts, and it is bound to `head_sha`.

Accounting is exact in both directions. Every entry in `contract.verification`
must have **exactly one** record — not "at least one", because that lets a
duplicate of an easy command stand in for a missing hard one while the count
still looks right — and a record naming a command the contract never required is
itself a blocker, so an easier command cannot substitute.

A reviewer-authored `verification_run` is **refused outright**, not ignored. A
second account nobody ran could only disagree with the one that was, and worse,
it would let a reviewer satisfy a required command by naming it. Supplemental
observations belong in a dimension note or a finding.

| Case | Outcome |
| --- | --- |
| No evidence at all | `BLOCKED` |
| Empty record while the contract requires commands | `BLOCKED` |
| A required command missing | `BLOCKED` |
| A duplicate standing in for a missing command | `BLOCKED` |
| A command the contract does not require | `BLOCKED` |
| `executed` missing or false | `BLOCKED` — nothing was learned |
| Non-integer exit code | `BLOCKED` |
| Evidence bound to another commit | `BLOCKED` |
| Non-zero exit | cannot approve |
| Passing run with no captured output | cannot approve |

### The contract comes from the reviewed commit

`loadContractAtCommit()` reads `git show <head>:.agent/tasks/<id>.json`. Nothing
about the review comes from the working tree.

The failure this closes is quiet: a locally re-sealed contract is **valid** —
every digest check passes on its own terms — so a version that relaxed its own
acceptance criteria and widened its own `allowed_paths` would have become the
review standard without appearing in the reviewed diff at all. Now the contract
bytes, the digest, the governance boundary, the implementation diff, the
verification evidence and the reviewer's verdict all bind to the same immutable
history.

### The brief is derived — but delivery is not sealed

`buildReviewBrief()` takes the contract, the resolved SHAs and the changed
paths. **It takes no free-text parameter.** There is nowhere inside the function
for an implementer to add "it's all just cleanup, honestly", and a spec proves
extra fields change nothing.

**That is a property of the function, not of the delegation.** When a caller
delegates to the subagent by hand, nothing stops them prepending or appending
text to the brief on the way. The reviewer's own instructions push back — it is
told that any summary is the author's account and not evidence, and to read the
diff regardless — but that is a posture, not a boundary.

Closing it needs a delivery path the caller does not compose: a driver outside
the agent that passes the generated brief verbatim. That is CI-invoked review,
which is automatic dispatch, and deliberately out of scope here. Until then:
**the brief cannot be editorialised by the function; it can be editorialised in
transit.**

### Identity binds to commits, not to names

`base_ref`/`head_ref` were replaced by `base_sha`/`head_sha`, full 40 characters,
resolved with `rev-parse --verify <ref>^{commit}` so a tag or a tree cannot pose
as a commit and an abbreviation cannot collide.

The failure this closes: a review of head A replayed as an approval for head B.
"main" and "feature" are labels whose meaning moves, and a verdict bound to a
label follows the label. `decide` resolves the refs itself and compares them to
what the result carries; a branch that advanced between brief and decision
produces a mismatch and `BLOCKED`, not a silent retarget.

### The base is derived from governance, never chosen

Governance-first is only worth something if the review base *is* the governance
commit. A caller who picks `--base` can pick one after an inconvenient commit:
contract → unauthorised change → tidy-up, reviewed from the tidy-up, approves
clean. The scope fence would be enforced against a diff chosen to fit inside it.

So `--base` does not exist. The boundary is computed as the most recent commit
reachable from the reviewed head that touched this contract, and four things
must hold or the review is `BLOCKED`:

1. it exists and is an ancestor of the reviewed head;
2. it changed **only** the contract file — a governance act, not work with a
   contract edit folded into it;
3. the contract blob at the reviewed head is byte-identical to the blob at the
   boundary, so the terms did not move under the implementation;
4. the implementation diff is exactly `boundary..head`.

Nothing is stored in the contract to make this work. A contract cannot name the
commit that will contain it, and a field that tried would be a lie or a second
seal to maintain. History already knows.

**A shallow clone cannot answer the question, so it is refused.** With truncated
history the "last commit that touched the contract" is whatever the graft
boundary happens to be — in a depth-1 checkout that is one root commit
containing the entire tree, which would present itself as a governance commit
that changed a thousand files. CI checks out shallow by default, so this is the
normal case there rather than an exotic one. The caller fetches full history
(`git fetch --unshallow`) and asks again.

### The floors are floors, not classifiers

`RISK_FLOOR_PATHS` cannot tell you a change is `r1` — only that it cannot
honestly be *below* `r3` because it touches something the risk model already
names there. Under-classification is the direction that costs something;
over-classification costs time, so it is not flagged.

`EFFECT_FLOOR_PATHS` has one rule: learner-facing code deploys on merge.
Notably `supabase/migrations/**` does **not** imply `database` — writing
migration code causes no production effect until someone applies it, and
treating the path as the effect is exactly the contradiction the
`production_effect` model was rewritten to remove.

## Running it

```bash
# 0. Check out the exact commit under review. The reviewer reads this tree and
#    has no shell to check out another; `brief` refuses if it is wrong or dirty.
git checkout <head-sha>

# 1. The DRIVER runs the contract's verification, in its own worktree at that
#    commit, so its output never touches the tree the reviewer reads.
node tools/review-task.mjs verify --task <id> --head <head-sha> > verification.json

# 2. Snapshot the review tree, from the driver — the "before".
node tools/review-task.mjs snapshot --worktree . > before.json

# 3. The brief: sealed contract from the commit, raw diff, verification output.
#    There is no --base.
node tools/review-task.mjs brief --task <id> --head <head-sha> \
  --verification verification.json

# 4. …delegate to the fresh-context-reviewer, collect its JSON as result.json…

# 5. Snapshot again, from the driver.
node tools/review-task.mjs snapshot --worktree . > after.json

# 6. The decision. Exits 0 only on APPROVE.
node tools/review-task.mjs decide --task <id> --head <head-sha> --result result.json \
  --verification verification.json --before before.json --after after.json
```

Integrity evidence is **required**: a `decide` without `--before/--after` is
`BLOCKED`, because whether the review modified anything is then unknown, and
unknown fails closed like everything else here.

## Limitations, stated precisely

**1. Fresh context is real. A separate principal is not.**

The platform genuinely prevents the reviewer from inheriting the implementer's
conversation. It does not make the reviewer a different actor: the subagent is
spawned from the implementing session, on the same account, and nothing here
proves that the entity requesting the review is not the entity that wrote the
code. What this mechanism removes is the *contamination* — the reasoning, the
plan, the self-justification. What it cannot remove is the *provenance*.

Do not describe this as identity-level separation. It is context-level
separation with a documented gap, and closing that gap needs something outside
this repository — a CI-invoked reviewer, or a required GitHub reviewer that is a
different account. Both are deliberately out of scope here.

**2. Read-only is now a capability fact; the detective half still has a named gap.**

The reviewer has no tool that can write. That part is settled. What the snapshot
comparison adds is evidence that it held — and **where it is taken decides
whether that evidence is worth anything.**

- A snapshot taken *inside the reviewer's own context* is **self-attestation**.
  A reviewer that wanted to hide a write would take the "after" snapshot before
  making it. It catches carelessness and nothing else.
- A snapshot taken by the **driver, in a worktree the driver created**, is an
  external observation. `review-task.mjs prepare` exists for exactly this: it
  creates the review worktree and snapshots it before the reviewer ever sees it.

Snapshots therefore carry an `observer` field, and **only `external` can support
an APPROVE.** A self-attested pair blocks.

The residual, stated plainly: the protocol verifies **where** the snapshot was
taken and **what** it describes — same worktree root either side, matching the
reviewed head, ignored paths excluded. It cannot verify **who** ran the command.
Closing that needs the snapshots taken by a process the reviewer has no reach
into at all, which is CI-invoked review and out of scope here.

The snapshot covers tracked content, tracked deletions, new non-ignored
untracked files, and file modes — a same-bytes exec-bit flip is a real change
and a hash-only snapshot would have called it untouched.

**3. The reviewer reads the working tree, and the guard is the driver's.**

`brief` refuses unless the checkout is the reviewed commit and clean. That is a
real, checked precondition, not a request — but it is checked at brief time. A
driver that briefed correctly and then changed the checkout underneath the
reviewer would not be caught by it. The integrity snapshots bracket the review
and would show the tree moving, which is what makes this a gap worth naming
rather than one worth hiding.

**4. The protocol validates shape, not judgment.**

Nothing here can tell a thorough review from a lazy one that filled in every
field. `validateReviewResult()` guarantees a *complete* answer, not a *correct*
one. What it removes is the ability to approve by saying nothing — which is the
common failure, not the exotic one.

The one place shape does reach substance is verification. A recorded run with a
non-zero exit cannot approve, and "could not execute" (`executed: false`) is
separated from "ran and failed": the first means nothing was learned and blocks;
the second means something was learned and it was bad. A passing run with no
evidence is refused too — a verification nobody can check is a claim.

**4. The floors are heuristics over paths.**

They catch the under-classifications the repo has actually seen. A change that
reaches something dangerous through a path not on the list will not be flagged,
and the reviewer's judgment is the only thing covering that.

**6. Nothing is enforced at runtime.**

No hook, no filesystem interception, no tool-permission enforcement, no
automatic routing, no automatic review, no automatic merge. This PR establishes
the mechanism and the protocol; invoking them is a deliberate act, and making
them mandatory is later hardening.

**7. Nothing here reviews this repository's existing code.** The deliverable is
the mechanism, not a review.
