# Task contracts

A task contract is the machine-readable statement of what a piece of agent work
is allowed to be. One JSON file per task, named `<id>.json`, validated by
`tools/verify-task-contracts.mjs` and by `task-contract.test.mjs` on every
`npm test` — so `npm run verify:pr` already covers them.

Today the same information lives in prose: `.claude/commands/*.md`,
`docs/PM-BOARD.md`, `docs/BACKLOG.md`, a paragraph in a chat. Prose cannot be
checked, cannot be diffed meaningfully, and cannot be held to.

## What this does and does not give you

**It gives you tamper-EVIDENCE, not tamper-proofing.** There is no hook, no role
enforcement and no reviewer agent yet — those are later work, deliberately not
in this change. An agent with write access can still edit any file. What it
cannot do is change a contract's terms *silently*:

- `contract_digest` covers the binding fields. Edit an acceptance criterion
  without re-sealing and validation fails. Re-seal and the diff carries a
  changed digest line, which is exactly the thing a reviewer looks for.
- `allowed_paths` may never name `.agent/tasks/**`, `.agent/roles.json`,
  `.claude/settings.json` or `.git/**`. A task cannot grant itself the authority
  to rewrite its own contract, redefine the role taxonomy that bounds it, or
  widen the harness permission list — the grant is refused at validation, so the
  escalation cannot even be written down.

Do not describe this as preventing scope expansion. It makes scope expansion
**visible and deliberate**, which is what a structural change can honestly buy.

## Fields

Every field below is required. Unknown fields are rejected.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | kebab-case string | Must equal the filename stem. |
| `goal` | string | One sentence: what this task is for. |
| `owner_role` | role id | Which authority domain owns it. Closed enum, read from `.agent/roles.json` — see below. |
| `risk` | `r0`–`r4` | Control-plane risk level. Closed enum — see below. |
| `allowed_paths` | path[] | The only paths the work may modify. Non-empty. Narrow grammar — see below. |
| `forbidden_paths` | path[] | Carve-outs inside `allowed_paths`. May be empty, must be present. |
| `non_goals` | string[] | What this task is explicitly NOT. The scope fence. |
| `acceptance_criteria` | string[] | What "done" means. Checkable statements, not aspirations. |
| `verification` | string[] | Commands that must pass. `npm run <script>` entries are checked to exist. |
| `production_effect` | enum | The **maximum** direct production effect the task is permitted to cause. Closed enum — see below. |
| `dependencies` | id[] | Other task ids. Must resolve. May be empty. |
| `stop_conditions` | string[] | When the agent must halt and report rather than push on. |
| `contract_digest` | sha256 hex | The seal over all of the above. |

`notes` and `links` are optional and **not** covered by the digest — a contract
should be annotatable without re-sealing, or nobody will annotate it.

## The risk model

`risk` is closed to the canonical control-plane levels:

| Level | Meaning |
| --- | --- |
| `r0` | Docs, comments, non-executable metadata only. |
| `r1` | Pure logic or local UI. No auth, persistence, native/release, or external side effects. |
| `r2` | User-flow / bounded integration semantics: story matching, onboarding, auth flow, offline behaviour, SRS UI. |
| `r3` | High-impact system semantics or authority: FSRS/scheduler core, migration code, privacy/security, CI/workflow authority, native/release configuration. |
| `r4` | Direct production authority: live Apply/data mutation, secrets and signing, store publication/release. |

**When several levels apply, take the highest.** A change that is mostly local
UI but also touches the scheduler is `r3`, not `r1` — the level describes the
worst thing the work can reach, not the bulk of it.

`risk` and `production_effect` answer different questions and are deliberately
orthogonal. `risk` is the authority the **work** carries; `production_effect` is
the maximum production effect it is **permitted to cause**. Migration code
written but explicitly not applied is `r3` (migration code is high-impact system
semantics) with `production_effect: "none"` (writing it touches nothing live). A
docs typo on `main` is `r0` with `deploy-on-merge`. The shipped
`dynamic-ref-writers` contract is the worked example: `r3` because it changes
CI/workflow authority, `production_effect: "none"` because it neither runs
against production nor deploys on merge.

## The production_effect model

**Definition: the maximum direct production effect this task is permitted to
cause, whether during execution or as an automatic consequence of merge.**

An earlier revision of this document defined it as "what merging does" and then
gave an unapplied migration as `database`, which contradicted itself — writing
migration code causes no production effect until someone applies it. The
definition above is permission-shaped, which covers both halves: an Apply task
mutates production while it runs; a merge to `main` deploys without anyone
running anything.

| Value | Meaning |
| --- | --- |
| `none` | No production access or direct production effect. |
| `read-only` | May inspect live production/external state, but may not mutate it. |
| `deploy-on-merge` | Merging automatically deploys learner-facing code. |
| `database` | Permitted to mutate the live production database. |
| `store-release` | Permitted to publish/release through an app store. |
| `external-service` | Permitted to mutate another live external service. |

Worked cases, so the contradiction cannot return:

- **Migration code only, explicitly not applied** → **`none`**, not `database`.
  (Unless merge itself causes another production effect, in which case use that.)
- **A read-only production audit** → **`read-only`**.
- **An Apply task** → **`database`**.
- **`dynamic-ref-writers`** → **`none`**.

If a task would carry **multiple write-side effects** (`database`,
`store-release`, `external-service`), it should normally be **split**, or
explicitly stopped for review. One enum value is the wrong place to hide that.

## The role model

`owner_role` is **required**, digest-covered, and closed to exactly the roles in
[`.agent/roles.json`](../roles.json) — the one canonical source. The validator
*reads* that file; the list is not restated anywhere, here included. It is also
on the always-forbidden floor: an ordinary task contract cannot authorise
editing the taxonomy that defines its own authority domain, so role-taxonomy
governance happens outside an implementing task, exactly as task-contract
definition changes already do.

The validator **refuses to run** against a malformed model rather than deriving
a short or empty enum from it: bad JSON, a bad version, no roles, a duplicate or
non-kebab id, a missing documentation field, or a missing separation rule all
stop the tool at load with a message naming the fault. It enforces the model's
*shape* only — the role ids themselves live in `roles.json` and nowhere else.

Each role there carries its purpose, its authority, its explicit
**non**-authority, and worked examples of what it owns and what it must hand
off. Read it before choosing one; the boundaries are where the value is.

| Role | Mental model |
| --- | --- |
| `product-app` | How the learner moves through and interacts with the application. |
| `story-content` | What the learner reads and learns, and whether the content semantics are correct. |
| `scheduler-db` | What the learning system knows, stores, schedules and counts. |
| `privacy-release` | What may legally/safely ship, and how native/store release authority is exercised. |
| `workflow-authority` | The repository rules under which work is checked, automated and merged. |
| `qa` | Independently exercises and verifies behaviour. |
| `reviewer` | Independently judges the implementation against the contract and diff. |
| `integrator` | Integrates already-approved work without redefining requirements or gates. |

That table is a *pointer*, not the enum — it names the roles so a reader knows
what exists; the ids the validator accepts come from `roles.json` alone.

### The three axes are orthogonal

`owner_role` = **authority domain** (what kind of work this is).
`risk` = **worst reach** (the most impactful thing the work can touch).
`production_effect` = **maximum direct production effect permitted**.

None implies another. A `workflow-authority` task can be `r0`/`none` or
`r3`/`none`; a `product-app` task can be `r0` with `deploy-on-merge`. Pick each
independently.

### A role never overrides a contract

A role is an authority **domain**, never a permission. No role grants the
ability to modify paths outside `allowed_paths`, to touch `forbidden_paths`, to
relax `acceptance_criteria`, to ignore `stop_conditions`, or to exceed the
contract's `risk` or `production_effect`. **Where a role and a contract
disagree, the contract is narrower and the contract wins.**

### An implementer is not its own reviewer

**The implementer of a task cannot also serve as its independent fresh-context
reviewer.** Independence is the whole value of the review: an agent judging its
own work brings the same blind spots and the same reading of the contract that
produced the work.

This is a **semantic** rule. It is recorded in `roles.json` and asserted by
`role-model.test.mjs` — but nothing enforces it at runtime. There is no reviewer
agent and no dispatch layer, so today it binds whoever assigns the work. Do not
describe it as enforced.

## The path grammar is deliberately narrow

Exactly two forms are accepted:

```
src/App.jsx        an exact repository-relative POSIX path
src/**             a directory subtree
```

Everything else is rejected: `*.js`, `.agent/tasks/*`, `**/*.json`, `?`,
character classes, braces, backslashes, Windows drive paths, a bare `**`,
absolute paths, `..`, empty segments.

This is not tidiness. Containment reasoning can only be *exact* for these two
forms, and anything the validator cannot decide must not be expressible —
otherwise it is accepted and then silently not analysed. `.agent/tasks/*` and
`.agent/*` both reach task contracts and neither is decidable by prefix logic
that only understands `/**`; under a permissive grammar they passed.

With the grammar closed, the always-forbidden floor is **complete**: every
accepted expression matches either exactly one path or exactly one subtree, so
containment against a floor entry is decidable in both directions. A test
generates every route to every floor entry and requires each to be refused.

## Rules the validator enforces

Fail-closed on all of these:

- Missing, empty or wrong-typed required fields; unknown fields.
- `id` not kebab-case, or not matching the filename.
- `risk` outside `r0`–`r4`, or `production_effect` outside its closed enum.
- `owner_role` outside the canonical role model in `.agent/roles.json`.
- Empty `allowed_paths` (no work is authorised) or empty `acceptance_criteria`
  (anything counts as done). Both are contradictions, not defaults.
- **Any path outside the two-form grammar** — wildcards, character classes,
  braces, backslashes, drive letters, a bare `**`, absolute paths, `..`, empty
  segments.
- **The always-forbidden floor** — `allowed_paths` naming `.agent/tasks/**`,
  `.agent/roles.json`, `.claude/settings.json`, `.claude/settings.local.json` or
  `.git/**`.
- **Contradictory paths** — a path both allowed and forbidden, or an allowed
  path entirely inside a forbidden one, where the allowance can never take
  effect. A forbidden path *inside* an allowed one is a carve-out and is fine;
  that is the normal case.
- `verification` naming an npm script that does not exist.
- A dependency that does not resolve, or a task depending on itself.
- A missing, malformed, or stale `contract_digest`.

## Working with a contract

```bash
npm run verify:tasks           # validate every contract
npm run verify:tasks -- --seal # recompute digests after a deliberate edit
```

**`--seal` cannot bless an invalid contract.** It validates every non-digest
rule first; if a single contract is unsound it exits 1 and **modifies no files
at all**, then re-validates the written result in full before reporting success.
A digest over a contract that authorises `.agent/tasks/**` would certify exactly
the escalation the floor exists to refuse, so sealing is all-or-nothing.

Sealing is a separate, explicit step on purpose. It should appear in review as a
changed digest beside the changed terms — if a digest moves and the terms did
not, or the terms moved and the digest did not, something is wrong.

## What this is not

No task here is executed automatically. Nothing dispatches an agent, nothing
selects a role for you, and nothing reviews the result. `owner_role` is
*validated* — a contract cannot name a role that does not exist — but it is not
*enforced*: no hook, no filesystem interception, no reviewer agent. This is the
vocabulary and the checker; the layers that act on it come later.
