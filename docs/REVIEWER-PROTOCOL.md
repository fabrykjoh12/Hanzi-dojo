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
| `tools: Read, Grep, Glob, Bash` | An allowlist, enforced by the platform. |
| `disallowedTools: Edit, Write, NotebookEdit` | The file-editing tools are removed. "Please don't edit" in a prompt is not a control; this is. |
| `isolation: worktree` | `Bash` is broad enough to write files, which would undo the allowlist. The worktree is a throwaway copy, and commands are checked to stay inside it. This is what makes granting `Bash` defensible — the reviewer must be able to *run* the verification, not just read about it. |
| no `fork` | A fork inherits the entire conversation, which is precisely what must not happen. A spec fails if the word appears in the frontmatter. |

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
- No refs passed to `decide`, so paths were never checked → `BLOCKED`, said out
  loud, because a decision that skipped the check would otherwise look exactly
  like one that made it.

`APPROVE` requires all of: `no_blocking_findings: true`, every criterion `met`,
no blocker or major finding, no protocol error, no tool failure. The CLI exits
`0` only for `APPROVE`.

A reviewer may be **more** cautious than the machinery and never less. If it
returns `BLOCKED` where the checks computed `APPROVE`, `BLOCKED` stands — it saw
something no function can.

### The brief cannot be editorialised

`buildReviewBrief()` takes the contract, the refs and the changed paths. **It
takes no free-text parameter.** There is nowhere for an implementer to add "it's
all just cleanup, honestly" or a summary of what it built. A summary
substituting for the diff is the failure mode this exists to prevent, so the
function is pure and a spec proves that extra fields change nothing.

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
# The brief — everything the reviewer gets
node tools/review-task.mjs brief --task <id> --base <ref> --head <ref>

# Either side of the review, for the integrity check
node tools/review-task.mjs snapshot > before.json

# The decision. Exits 0 only on APPROVE.
node tools/review-task.mjs decide --task <id> --result result.json \
  --base <ref> --head <ref> --before before.json --after after.json
```

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

**2. Read-only is enforced unevenly, and the detective half is why.**

`Edit`, `Write` and `NotebookEdit` are removed by the platform. `Bash` is
granted, because a reviewer that cannot run the verification cannot check
anything — and `Bash` can write files. `isolation: worktree` contains that:
filesystem effects land in a throwaway copy, and commands are checked to stay
inside it. Network-reaching commands remain possible in principle.

So the snapshot comparison exists as the detective control: any tracked file
that changed during the review is a blocker. A preventive control you cannot
observe is only a claim.

**3. The protocol validates shape, not judgment.**

Nothing here can tell a thorough review from a lazy one that filled in every
field. `validateReviewResult()` guarantees a *complete* answer, not a *correct*
one. What it removes is the ability to approve by saying nothing — which is the
common failure, not the exotic one.

**4. The floors are heuristics over paths.**

They catch the under-classifications the repo has actually seen. A change that
reaches something dangerous through a path not on the list will not be flagged,
and the reviewer's judgment is the only thing covering that.

**5. Nothing is enforced at runtime.**

No hook, no filesystem interception, no tool-permission enforcement, no
automatic routing, no automatic review, no automatic merge. This PR establishes
the mechanism and the protocol; invoking them is a deliberate act, and making
them mandatory is later hardening.

**6. Nothing here reviews this repository's existing code.** The deliverable is
the mechanism, not a review.
