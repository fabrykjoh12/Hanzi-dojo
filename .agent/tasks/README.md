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
- `allowed_paths` may never name `.agent/tasks/**`, `.claude/settings.json` or
  `.git/**`. A task cannot grant itself the authority to rewrite its own
  contract or widen the harness permission list — the grant is refused at
  validation, so the escalation cannot even be written down.

Do not describe this as preventing scope expansion. It makes scope expansion
**visible and deliberate**, which is what a structural change can honestly buy.

## Fields

Every field below is required. Unknown fields are rejected.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | kebab-case string | Must equal the filename stem. |
| `goal` | string | One sentence: what this task is for. |
| `owner_role` | enum | Which role owns it. Named now so a later enforcement layer has a closed set; **not enforced yet**. |
| `risk` | `low` \| `medium` \| `high` | How much damage a mistake does. |
| `allowed_paths` | glob[] | The only paths the work may modify. Non-empty. |
| `forbidden_paths` | glob[] | Carve-outs inside `allowed_paths`. May be empty, must be present. |
| `non_goals` | string[] | What this task is explicitly NOT. The scope fence. |
| `acceptance_criteria` | string[] | What "done" means. Checkable statements, not aspirations. |
| `verification` | string[] | Commands that must pass. `npm run <script>` entries are checked to exist. |
| `production_effect` | enum | `none`, `deploy-on-merge`, `database`, `store-release`, `external-service`. |
| `dependencies` | id[] | Other task ids. Must resolve. May be empty. |
| `stop_conditions` | string[] | When the agent must halt and report rather than push on. |
| `contract_digest` | sha256 hex | The seal over all of the above. |

`notes` and `links` are optional and **not** covered by the digest — a contract
should be annotatable without re-sealing, or nobody will annotate it.

## Rules the validator enforces

Fail-closed on all of these:

- Missing, empty or wrong-typed required fields; unknown fields.
- `id` not kebab-case, or not matching the filename.
- `owner_role`, `risk` or `production_effect` outside its enum.
- Empty `allowed_paths` (no work is authorised) or empty `acceptance_criteria`
  (anything counts as done). Both are contradictions, not defaults.
- Absolute paths, or any path containing `..`.
- **The always-forbidden floor** — `allowed_paths` naming `.agent/tasks/**`,
  `.claude/settings.json`, `.claude/settings.local.json` or `.git/**`.
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

Sealing is a separate, explicit step on purpose. It should appear in review as a
changed digest beside the changed terms — if a digest moves and the terms did
not, or the terms moved and the digest did not, something is wrong.

## What this is not

No task here is executed automatically. Nothing dispatches an agent, nothing
enforces `owner_role`, nothing reviews the result. This change is the vocabulary
and the checker; the layers that act on it come later.
