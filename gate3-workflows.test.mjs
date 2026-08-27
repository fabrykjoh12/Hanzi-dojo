import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { checkBundleBinding } from './src/migration/legacyClaimManifest.js'

// Static guards on the Gate 3 workflows.
//
// These are structural invariants that a YAML edit can silently break and that
// no unit test would otherwise notice. One of them is a bug we actually
// shipped: `actions/checkout` REPLACES the workspace, so the snapshot recipient
// key — committed to main AFTER the migration commit was pinned — did not exist
// in the pinned tree, and Prepare would have failed deterministically at the
// key check. The fix reads the key from the control-plane revision BEFORE the
// pinned checkout. That ordering is the thing these tests protect.
//
// Deliberately dependency-free: the repo has no YAML parser, and a line-order
// assertion is exactly what "step A must come before step B" needs anyway.

const PREPARE = fs.readFileSync('.github/workflows/gate3-prepare.yml', 'utf8')
const APPLY = fs.readFileSync('.github/workflows/gate3-apply.yml', 'utf8')

// Commit A of the loader-contract + snapshot-contract fix.
//
// Every pin this replaces stays named here, because "which commit was the bad
// one" is exactly the thing nobody should have to remember:
//   d0dcc51  produced BOTH poisoned Gate 3 Prepare runs — its review-log query
//            omitted previous_state, so their classification is wrong.
//   6e6344b  proposed but never approved: it fixed the loader and left the
//            snapshot unable to restore learning_step.
const APPROVED_SHA = '5bb8b38383dfb8c4c45cb5b89c34cc3423ea790b'
const BROKEN_LOADER_SHA = 'd0dcc5171d048b603b8e9a5c05d1cebcef273870'
const SUPERSEDED_SHAS = [
  BROKEN_LOADER_SHA,
  '6e6344b31f94157c9b4708fca9a2ca3cf782b981',
]

// THE POISONED PREPARE RUNS — the permanent record.
//
// Both were dispatched from main while the pin was d0dcc51, so both bundles
// record migration_commit d0dcc51 and both are unusable for Apply. Their
// manifests describe ~982 cards across 30 accounts; the truth is 207 across 2.
//
// This registry is evidence, NOT a runtime blocklist. Apply carries no
// special case for either id and does not need one: the generic
// migration_commit comparison rejects any bundle built by a superseded pin,
// including ones nobody has thought to write down.
const POISONED_PREPARE_RUNS = [
  { id: '33014914945', dispatchedFrom: '25517329103dbc4eba3a2fd9d44c660ab6dd0d68' },
  { id: '33015832443', dispatchedFrom: 'be831ecb764692f8c7c5a100f65b2c60f96fe6f4' },
]
const FINGERPRINT = 'F1BAEB3D8E327B506E95E11F8DC40418467B259A'

const lineOf = (text, needle) => {
  const i = text.split('\n').findIndex(l => l.includes(needle))
  return i === -1 ? Infinity : i
}

describe('the production-code pin is intact', () => {
  it('both workflows pin the same approved migration commit', () => {
    expect(PREPARE).toContain(`APPROVED_MIGRATION_SHA: '${APPROVED_SHA}'`)
    expect(APPLY).toContain(`APPROVED_MIGRATION_SHA: '${APPROVED_SHA}'`)
  })

  it('neither workflow accepts a migration ref as dispatch input', () => {
    // A free-form ref would let a typo run arbitrary repository code with the
    // production service-role credential.
    for (const wf of [PREPARE, APPLY]) {
      const inputs = wf.slice(wf.indexOf('inputs:'), wf.indexOf('permissions:'))
      expect(inputs).not.toContain('migration_ref')
      expect(inputs).not.toContain('ref:')
    }
  })

  it('both check out the pin by env, never by an input', () => {
    for (const wf of [PREPARE, APPLY]) {
      expect(wf).toContain('ref: ${{ env.APPROVED_MIGRATION_SHA }}')
      expect(wf).not.toContain('ref: ${{ inputs.')
      expect(wf).not.toContain('ref: ${{ github.event.inputs.')
    }
  })

  it('neither workflow still points at a superseded pin', () => {
    for (const wf of [PREPARE, APPLY]) {
      for (const sha of SUPERSEDED_SHAS) {
        expect(wf).not.toContain(`APPROVED_MIGRATION_SHA: '${sha}'`)
      }
    }
  })

  it('Apply enforces the binding through the tested helper, not inline YAML logic', () => {
    // checkBundleBinding is unit-tested; an inline JSON comparison is not.
    expect(APPLY).toContain('checkBundleBinding')
    expect(APPLY).toContain('approvedSha: process.env.APPROVED_MIGRATION_SHA')
  })

  it('both verify the checkout actually landed on the pin', () => {
    for (const wf of [PREPARE, APPLY]) {
      expect(wf).toContain('git rev-parse HEAD')
      expect(wf).toContain('!= "$APPROVED_MIGRATION_SHA"')
    }
  })
})

describe('both poisoned Prepare runs are rejected by the generic binding', () => {
  // Apply reads gate3-metadata.json from the bundle. The only field that
  // decides this is migration_commit, and both runs carry the broken one.
  const metaFor = (run) => ({
    kind: 'hanzi-dojo/gate3-prepare',
    migration_commit: BROKEN_LOADER_SHA,
    prepare_run_id: run.id,
    // A digest shape only — no artifact contents are reproduced here.
    manifest_sha256: 'a'.repeat(64),
  })

  it('names both runs, so neither can be quietly forgotten', () => {
    expect(POISONED_PREPARE_RUNS.map(r => r.id)).toEqual(['33014914945', '33015832443'])
  })

  it('rejects each one against the approved pin, naming migration_commit', () => {
    for (const run of POISONED_PREPARE_RUNS) {
      const meta = metaFor(run)
      const res = checkBundleBinding({
        // The most favourable case for the bundle: the operator supplies that
        // run's own id and its own digest, both correct.
        meta,
        approvedSha: APPROVED_SHA,
        prepareRunId: meta.prepare_run_id,
        manifestSha256: meta.manifest_sha256,
      })
      expect(res.ok).toBe(false)
      expect(res.failures.join(' ')).toContain('migration_commit')
      expect(res.failures.join(' ')).toContain(APPROVED_SHA)
    }
  })

  it('rejects them for the PIN, not for being on a list', () => {
    // The proof that this is generic: an unknown run id, never written down
    // anywhere, built by the same broken pin, is refused identically.
    const res = checkBundleBinding({
      meta: { ...metaFor({ id: '99999999999' }) },
      approvedSha: APPROVED_SHA,
      prepareRunId: '99999999999',
      manifestSha256: 'a'.repeat(64),
    })
    expect(res.ok).toBe(false)
    expect(res.failures.join(' ')).toContain('migration_commit')

    // And Apply carries no per-run special case to drift out of date.
    for (const run of POISONED_PREPARE_RUNS) {
      expect(APPLY).not.toContain(`prepare_run_id != "${run.id}"`)
      expect(APPLY).not.toContain(`"${run.id}"`)
    }
  })

  it('Apply documents both runs where an operator will read it', () => {
    for (const run of POISONED_PREPARE_RUNS) expect(APPLY).toContain(run.id)
    expect(APPLY).toContain('permanently poisoned')
  })
})

describe('the recipient key is obtained BEFORE the pinned checkout', () => {
  it('the control-plane checkout and key verification precede the pinned checkout', () => {
    const controlPlane = lineOf(PREPARE, 'path: control-plane')
    const verify = lineOf(PREPARE, 'Verify and stage the snapshot recipient key')
    const pinned = lineOf(PREPARE, 'ref: ${{ env.APPROVED_MIGRATION_SHA }}')

    expect(controlPlane).toBeLessThan(pinned)
    expect(verify).toBeLessThan(pinned)
    // And the staging must complete before the pinned checkout wipes things.
    expect(lineOf(PREPARE, 'install -m 0600')).toBeLessThan(pinned)
  })

  it('the key is staged OUTSIDE the workspace', () => {
    // Anything inside $GITHUB_WORKSPACE is destroyed by the pinned checkout.
    expect(PREPARE).toContain("GATE3_RECIPIENT_KEY: '/tmp/gate3-snapshot-recipient.asc'")
  })

  it('encryption uses the verified runner-local key, never a workspace path', () => {
    expect(PREPARE).toContain('--recipient-file "$GATE3_RECIPIENT_KEY"')
    expect(PREPARE).not.toContain('--recipient-file "$GITHUB_WORKSPACE/ops/gate3-snapshot-recipient.asc"')
  })

  it('never reads the recipient key out of the pinned tree', () => {
    // The bug: the key does not exist at the pinned commit.
    const afterPin = PREPARE.slice(PREPARE.indexOf('ref: ${{ env.APPROVED_MIGRATION_SHA }}'))
    expect(afterPin).not.toContain('ops/gate3-snapshot-recipient.asc')
  })
})

describe('the fingerprint is the trust anchor for the key', () => {
  it('pins the exact expected fingerprint', () => {
    expect(PREPARE).toContain(`GATE3_SNAPSHOT_FINGERPRINT: '${FINGERPRINT}'`)
  })

  it('compares the parsed fingerprint and refuses on mismatch', () => {
    expect(PREPARE).toContain('!= "$GATE3_SNAPSHOT_FINGERPRINT"')
    expect(PREPARE).toContain('fingerprint mismatch')
  })

  it('parses without importing into the keyring', () => {
    expect(PREPARE).toContain('--import-options show-only --import --with-colons')
  })

  it('refuses private key material in the recipient file', () => {
    // CI must never be able to decrypt its own snapshot backups.
    expect(PREPARE).toContain('PRIVATE KEY BLOCK')
    expect(PREPARE).toContain('refusing')
  })

  it('re-confirms the key survived, and that the control-plane tree is gone', () => {
    expect(PREPARE).toContain('rm -rf control-plane')
    expect(PREPARE).toContain('test ! -e control-plane')
  })
})

describe('Prepare stays read-only and leak-guarded', () => {
  it('never applies', () => {
    expect(PREPARE).not.toContain('--apply')
  })

  it('routes every production command through the leak guard, never tee', () => {
    expect(PREPARE).not.toMatch(/\|\s*tee\b/)
    for (const cmd of ['--snapshot --redact', '--manifest /tmp/gate3/manifest.json --redact']) {
      expect(PREPARE).toContain(cmd)
    }
    const guarded = (PREPARE.match(/run-guarded\.sh/g) || []).length
    expect(guarded).toBeGreaterThanOrEqual(2)
  })

  it('uploads only the encrypted bundle directory', () => {
    expect(PREPARE).toContain('path: /tmp/gate3/out/')
    // The plaintext snapshot and manifest are shredded before upload.
    expect(PREPARE).toContain('shred -u "$SNAPSHOT_PLAIN"')
    expect(PREPARE).toContain('shred -u manifest.json')
  })

  it('reuses the existing Supabase secrets and creates no duplicates', () => {
    expect(PREPARE).toContain('SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}')
    expect(PREPARE).toContain('SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}')
    expect(PREPARE).not.toContain('secrets.SUPABASE_URL }}')
  })
})

describe('Prepare parses the snapshot log the script actually prints', () => {
  // A workflow that greps a script's stdout is a seam, and this gate has
  // already been bitten once by a seam nobody exercised. The coverage
  // cross-check is only a check if its regexes still match the printer.
  const SCRIPT = fs.readFileSync('migrate-legacy-claims.mjs', 'utf8')
  const patterns = [...PREPARE.matchAll(/num\(\/(.+?)\/\)/g)].map(m => m[1])

  it('finds the three coverage regexes', () => {
    expect(patterns).toHaveLength(3)
  })

  it('each regex matches a line the snapshot printer emits', () => {
    for (const source of patterns) {
      const label = source.split('\\s+')[0]        // e.g. "convert rows"
      // The printer still emits that exact label...
      expect(SCRIPT).toContain("'  " + label + " ")
      // ...and the regex still finds the number after it.
      const rendered = '  ' + label + '  ' + String(42).padStart(6)
      expect(new RegExp(source).exec(rendered)?.[1]).toBe('42')
    }
  })
})

describe('Apply semantics are unchanged', () => {
  it('still requires the reviewer environment and verifies the bundle digest', () => {
    expect(APPLY).toContain('environment: gate3-production')
    expect(APPLY).toContain('manifest digest mismatch')
    expect(APPLY).toContain('refusing to apply')
  })

  it('does not need the recipient key at all', () => {
    // Apply never encrypts a snapshot, so the key never enters this workflow.
    expect(APPLY).not.toContain('gate3-snapshot-recipient')
    expect(APPLY).not.toContain('GATE3_SNAPSHOT_FINGERPRINT')
  })

  it('never runs the 20260822180000 constraint', () => {
    for (const wf of [PREPARE, APPLY]) expect(wf).not.toContain('20260822180000_')
  })
})

describe('external actions are pinned to immutable SHAs', () => {
  it('no floating tags in either workflow', () => {
    for (const wf of [PREPARE, APPLY]) {
      const uses = [...wf.matchAll(/uses:\s*(\S+)/g)].map(m => m[1])
      expect(uses.length).toBeGreaterThan(0)
      for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/)
    }
  })
})
