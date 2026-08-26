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

## Required secrets and variables

| Name | Kind | Used by | Notes |
|---|---|---|---|
| `SUPABASE_URL` | secret | both | environment secret |
| `SUPABASE_SERVICE_KEY` | secret | both | environment secret, never printed |
| `GATE3_MANIFEST_PASSPHRASE` | secret | both | symmetric key for the manifest |

The manifest is encrypted symmetrically rather than to the maintainer's key
because Apply has to read it back; the snapshot is encrypted asymmetrically
because CI never does.

## Environments

- `gate3-prepare` — holds the read-only credentials.
- `gate3-production` — **must have at least one required reviewer.** That
  approval is what stands between a dispatch and a production write.
