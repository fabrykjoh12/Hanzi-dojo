// Provenance rules for generated image manifests (`.art.json`, story covers).
//
// Pure — no fs, no network — so it is testable and can be shared by
// fetch-manhua-art.mjs and generate-story-images.mjs.
//
// WHY THIS EXISTS. Every panel and cover in the app was produced by an image
// model under a prompt carrying the STORY-BIBLE's CRITICAL CONSTRAINTS block
// ("no resemblance to any existing franchise or artist"). The policy is real and
// was enforced — 14 of one episode's 19 panels were regenerated for breaching
// it — but the manifests recorded only { file, url }, so there was no per-image
// evidence the constraint had been applied. A rights query could be answered
// only in prose. See docs/CONTENT-PROVENANCE-AUDIT.md.
//
// THE ONE RULE: an asset being downloaded for the FIRST time must carry its
// prompt and generation date. Assets already committed are reported as
// incomplete and left alone. Backfilling a prompt after the fact would be
// inventing evidence, which is worse than admitting the gap — so the checker
// never asks for that, and `--check` exits 0 on a fully-legacy manifest.

export const PROVENANCE_KEYS = ['prompt', 'generated']

// ISO calendar date, YYYY-MM-DD, and a real day — 2026-02-30 is not.
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// Which provenance keys an asset entry is missing. A prompt has to be
// substantive: a placeholder like "" or "n/a" is not a record of anything, and
// accepting one would make the manifest lie more convincingly than it did when
// the key was simply absent.
export function missingProvenance(asset) {
  const missing = []
  const prompt = asset && typeof asset.prompt === 'string' ? asset.prompt.trim() : ''
  if (prompt.length < 20) missing.push('prompt')
  if (!asset || !isIsoDate(asset.generated)) missing.push('generated')
  return missing
}

export function hasProvenance(asset) {
  return missingProvenance(asset).length === 0
}

// Classify one manifest's assets. `isPresent(file)` answers "is this already
// committed?" — the caller supplies it because this module does no I/O.
//
// An entry that is about to be fetched for the first time is NEW, and new
// entries are required to carry provenance. That test needs no cutoff date and
// no bookkeeping: the file system already knows which work predates the rule.
export function auditManifest(manifest, isPresent = () => false) {
  const assets = Array.isArray(manifest && manifest.assets) ? manifest.assets : []
  const complete = []
  const legacy = []    // already committed, no provenance — honest gap, warn only
  const blocking = []  // new, no provenance — refuse
  for (const asset of assets) {
    const file = asset && asset.file
    const missing = missingProvenance(asset)
    if (missing.length === 0) complete.push(file)
    else if (isPresent(file)) legacy.push({ file, missing })
    else blocking.push({ file, missing })
  }
  return { total: assets.length, complete, legacy, blocking }
}

export function formatAudit(audit, label) {
  const lines = []
  lines.push(label + ': ' + audit.complete.length + '/' + audit.total + ' entries carry prompt + generated')
  for (const e of audit.legacy) {
    lines.push('  · ' + e.file + ' — no ' + e.missing.join(' or ') + ' (already committed; left as-is, not backfilled)')
  }
  for (const e of audit.blocking) {
    lines.push('  ✗ ' + e.file + ' — new entry is missing ' + e.missing.join(' and '))
  }
  return lines.join('\n')
}
