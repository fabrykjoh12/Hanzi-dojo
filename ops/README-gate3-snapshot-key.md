# The Gate 3 snapshot key

The pre-apply snapshot is a complete copy of every card row the legacy-claim
migration could modify — real user learning data for the affected accounts.

**Hanzi-dojo is a public repository.** GitHub Actions artifacts and job logs on
a public repo are readable by anyone on the internet. The snapshot therefore
never leaves the runner in plain text: it is encrypted to a public key whose
private half exists only on the maintainer's machine, so CI can create a backup
it cannot itself read, and neither can anyone who downloads the artifact.

## Generate the keypair (once, locally — never in CI)

```bash
gpg --quick-generate-key "Hanzi-dojo Gate 3 snapshot" default default never
gpg --armor --export "Hanzi-dojo Gate 3 snapshot" > ops/gate3-snapshot-recipient.asc
```

Commit `ops/gate3-snapshot-recipient.asc`. It is a **public** key — publishing it
is what it is for. Never export or commit the private half, and never add it to
Actions secrets: the whole point is that CI cannot decrypt the backup.

Back the private key up somewhere you will still have it in six months. If it is
lost, existing encrypted snapshots become unrecoverable.

## Restore from a snapshot

```bash
gpg --decrypt legacy-claim-snapshot-<stamp>.json.gpg > snapshot.json
sha256sum snapshot.json          # must equal snapshot_sha256 from the run summary
```

The file holds the complete original rows. Restoration uses those exact rows —
never a reconstruction. Delete the plaintext when you are done.

## Secrets — reuse, do not duplicate

Gate 3 introduces **no second copy** of the Supabase credentials. It uses the
repository secrets that eight other workflows already use:

| Secret | Kind | Status | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | repository | **already exists** | mapped to the env var `SUPABASE_URL`, exactly as `content-utils.yml` does |
| `SUPABASE_SERVICE_KEY` | repository | **already exists** | used verbatim |
| `GATE3_MANIFEST_PASSPHRASE` | **environment** | **new — the only one** | symmetric key for the manifest |

**Do not move `SUPABASE_SERVICE_KEY` or `VITE_SUPABASE_URL` into an
environment.** No existing workflow declares `environment:`, and eight read the
service key as a plain repository secret — moving it would break
content-utils, regen-content, story-batch, story-pilot, vocab-complete,
authored-insert, llm-bench and send-reminders. Gate 3 does not need the move: a
job that declares an environment can still read repository secrets. What
protects Gate 3 is the environment's *protection rules*, below, which work
perfectly well with repository-level secrets.

`GATE3_MANIFEST_PASSPHRASE` is new, so scoping it to the environments breaks
nothing. Add it to **both** environments.

Generate it with something like `openssl rand -base64 48`. It never needs to be
typed by a human; it only has to exist in both environments.

## Environments — the exact settings to configure

Settings → Environments. Two environments, both restricted to the default
branch so a dispatch from a feature branch cannot start the job at all.

### `gate3-prepare`

| Setting | Value |
|---|---|
| Deployment branches | **Selected branches** → `main` only |
| Required reviewers | not required (this job makes no production writes) |
| Environment secrets | `GATE3_MANIFEST_PASSPHRASE` |

### `gate3-production`

| Setting | Value |
|---|---|
| Deployment branches | **Selected branches** → `main` only |
| Required reviewers | **at least one** — this is the approval gate |
| Environment secrets | `GATE3_MANIFEST_PASSPHRASE` |

The branch restriction is the part that answers "can a workflow dispatched from
an arbitrary feature branch receive these secrets?" — it cannot. If the branch
is not permitted, GitHub refuses to start the job, so it never receives any
secret, environment-scoped or repository-scoped.

Note the honest limit: repository secrets remain readable by any workflow on any
branch for anyone with write access to the repo. That is already true of the
eight existing workflows and is not something Gate 3 changes. The environment
gate protects *these* jobs; scoping the service key globally would be a separate
migration across those eight workflows.

## The pinned migration commit

`APPROVED_MIGRATION_SHA` in both workflow files is the **only** commit Gate 3
will check out and run with production credentials. There is deliberately no
workflow input for it: a typo or another branch's SHA must never be able to run
arbitrary repository code against production.

Both workflows refuse to start unless it is a full 40-character SHA, verify the
checkout actually landed on it, and confirm the leak guard exists in that tree.
Apply additionally requires the Prepare bundle's recorded `migration_commit` to
equal the same pin.

Changing it is a reviewed commit to the default branch, and it must be changed
in both files together.

## No output reaches a public log unguarded

Every command that touches production data runs through `ops/run-guarded.sh`:
output is captured to a runner-local file, `ops/leakGuard.mjs` scans it, and it
is printed only if it is clean. A log that fails the scan is **destroyed at the
point of failure**, so no later step can print, summarize or upload it. Only a
generic refusal is shown.
